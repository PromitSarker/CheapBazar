/**
 * event-bus: transactional outbox + at-least-once delivery + idempotent consumers.
 *
 * Producer:  `await publish(tx, "ledger", "WalletToppedUp", data)` INSIDE the same DB
 *            transaction as the state change.
 * Relay:     `startRelay(...)` drains the producer's outbox and hands each message
 *            to a Transport. The default HttpTransport POSTs a CloudEvents-style
 *            envelope to `<consumer>/internal/events`. Swap in an AMQP / Redis
 *            Streams transport by implementing `Transport` - nothing else changes.
 * Consumer:  `createEventRoute(...)` dedupes on eventId (ProcessedEvent table) and
 *            runs the handler in the same transaction as the dedupe marker.
 *
 * Every service schema must contain the OutboxMessage and ProcessedEvent models
 * (see each service prisma/schema.prisma).
 */
import crypto from "crypto";
import { HttpError, Router, serviceClient, serviceUrl, safeEqual } from "../service-kit";
import { consumersOf, type ServiceName } from "./topology";

export * from "./topology";

export interface EventEnvelope<T = any> {
  eventId: string;
  eventType: string;
  timestamp: string;
  producer: string;
  tenantId?: string;
  data: T;
}

/** Minimal surface of any generated Prisma client / transaction client. */
export interface Db {
  $executeRawUnsafe(query: string, ...values: any[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Promise<T>;
}
export interface TxDb extends Db {}
export interface TransactionalDb extends Db {
  $transaction<R>(fn: (tx: any) => Promise<R>, opts?: { timeout?: number; maxWait?: number }): Promise<R>;
}

// ----------------------------------------------------------------- producer

export async function publish(
  db: Db,
  producer: string,
  eventType: string,
  data: Record<string, unknown>,
  tenantId?: string
): Promise<string> {
  const consumers = consumersOf(eventType);
  const eventId = crypto.randomUUID();
  const envelope: EventEnvelope = {
    eventId,
    eventType,
    timestamp: new Date().toISOString(),
    producer,
    tenantId,
    data,
  };
  const json = JSON.stringify(envelope);
  for (const consumer of consumers) {
    await db.$executeRawUnsafe(
      `INSERT INTO "OutboxMessage" ("id","eventId","consumer","eventType","envelope") VALUES ($1,$2,$3,$4,$5::jsonb)`,
      crypto.randomUUID(),
      eventId,
      consumer,
      eventType,
      json
    );
  }
  return eventId;
}

// ---------------------------------------------------------------- transport

export interface Transport {
  deliver(consumer: ServiceName, envelope: EventEnvelope): Promise<void>;
}

export class HttpTransport implements Transport {
  constructor(private secret: string, private caller: string, private resolveUrl: (s: string) => string = serviceUrl) {}
  async deliver(consumer: ServiceName, envelope: EventEnvelope): Promise<void> {
    const client = serviceClient({
      baseUrl: this.resolveUrl(consumer),
      secret: this.secret,
      caller: this.caller,
      timeoutMs: 10_000,
    });
    await client.post("/internal/events", envelope);
  }
}

// -------------------------------------------------------------------- relay

interface Claimed {
  id: string;
  consumer: string;
  envelope: EventEnvelope;
  attempts: number;
}

export const MAX_ATTEMPTS = 12;
const LEASE_SECONDS = 30;

export async function relayOnce(db: Db, transport: Transport, batch = 50): Promise<{ delivered: number; failed: number }> {
  const rows = await db.$queryRawUnsafe<Claimed[]>(
    `UPDATE "OutboxMessage"
        SET "attempts" = "attempts" + 1,
            "availableAt" = now() + ($1 * interval '1 second')
      WHERE "id" IN (
        SELECT "id" FROM "OutboxMessage"
         WHERE "deliveredAt" IS NULL AND "availableAt" <= now() AND "attempts" < $2
         ORDER BY "createdAt"
         LIMIT $3
         FOR UPDATE SKIP LOCKED)
      RETURNING "id","consumer","envelope","attempts"`,
    LEASE_SECONDS,
    MAX_ATTEMPTS,
    batch
  );
  let delivered = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await transport.deliver(row.consumer as ServiceName, row.envelope);
      await db.$executeRawUnsafe(`UPDATE "OutboxMessage" SET "deliveredAt" = now(), "lastError" = NULL WHERE "id" = $1`, row.id);
      delivered++;
    } catch (e: any) {
      failed++;
      const backoff = Math.min(900, 2 ** row.attempts);
      await db.$executeRawUnsafe(
        `UPDATE "OutboxMessage" SET "lastError" = $2, "availableAt" = now() + ($3 * interval '1 second') WHERE "id" = $1`,
        row.id,
        String(e?.message ?? e).slice(0, 400),
        backoff
      );
      if (row.attempts >= MAX_ATTEMPTS) {
        console.error(`[event-bus] DEAD-LETTER ${row.envelope.eventType} -> ${row.consumer}: ${e?.message}`);
      }
    }
  }
  return { delivered, failed };
}

export function startRelay(opts: { db: Db; transport: Transport; intervalMs?: number; name?: string }) {
  let stopped = false;
  let busy = false;
  const timer = setInterval(async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      await relayOnce(opts.db, opts.transport);
    } catch (e: any) {
      console.error(`[${opts.name ?? "relay"}] outbox relay error:`, e?.message);
    } finally {
      busy = false;
    }
  }, opts.intervalMs ?? 1000);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/** Outbox health numbers (pending / dead) for /admin dashboards and tests. */
export async function outboxStats(db: Db) {
  const rows = await db.$queryRawUnsafe<{ pending: number; dead: number }[]>(
    `SELECT COUNT(*) FILTER (WHERE "deliveredAt" IS NULL AND "attempts" < ${MAX_ATTEMPTS})::int AS pending,
            COUNT(*) FILTER (WHERE "deliveredAt" IS NULL AND "attempts" >= ${MAX_ATTEMPTS})::int AS dead
       FROM "OutboxMessage"`
  );
  return rows[0];
}

// ----------------------------------------------------------------- consumer

export type EventHandler = (envelope: EventEnvelope, tx: any) => Promise<void>;

/**
 * Registers POST /internal/events on a router. Handlers are keyed by eventType;
 * unknown types are acknowledged (and ignored) so adding events never breaks a
 * consumer. Dedupe marker and handler share one transaction.
 */
export function registerEventRoute(router: Router, db: TransactionalDb, handlers: Record<string, EventHandler>) {
  router.post("/internal/events", async ({ body }) => {
    const env = body as EventEnvelope;
    if (!env?.eventId || !env?.eventType) throw new HttpError(400, "Invalid event envelope", "VALIDATION");
    const handler = handlers[env.eventType];
    if (!handler) return { ok: true, ignored: true };

    return db.$transaction(
      async (tx: TxDb) => {
        const inserted = await tx.$executeRawUnsafe(
          `INSERT INTO "ProcessedEvent" ("eventId","eventType") VALUES ($1,$2) ON CONFLICT ("eventId") DO NOTHING`,
          env.eventId,
          env.eventType
        );
        if (inserted === 0) return { ok: true, duplicate: true };
        await handler(env, tx);
        return { ok: true };
      },
      { timeout: 20_000, maxWait: 10_000 }
    );
  });
}

export { safeEqual };
