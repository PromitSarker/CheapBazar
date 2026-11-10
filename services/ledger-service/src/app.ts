import fs from "fs";
import path from "path";
import { Router, createServer, HttpError, positiveNumber, requireFields, envInt, reply } from "../../../packages/service-kit";
import { splitSqlStatements } from "../../../packages/service-kit/sql";
import { HttpTransport, registerEventRoute, startRelay, outboxStats, type Transport } from "../../../packages/event-bus";
import { createDb, num, type Db } from "./db";
import { handlers } from "./consumers";
import { adminChangeStatus, enforceAll, enforceStore } from "./enforcer";
import { platformAccountBalances, reconcileWallets, trialBalance } from "./ledger";
import {
  chargeWallet, getStatement, getWalletStatus, placeCodHold, releaseCodHold, reverseOnlineSettlement, settleCodHold, topUp,
} from "./wallets";
import {
  addPayoutMethod, deletePayoutMethod, listPayoutMethods, listWithdrawals, requestWithdrawal, reviewWithdrawal,
} from "./withdrawals";
import { config } from "./config";

export function buildRouter(db: Db): Router {
  const r = new Router();

  // ------------------------------------------------------------ wallets
  r.get("/wallets", async ({ query }) => {
    const ids = query.ids ? query.ids.split(",").filter(Boolean) : undefined;
    const rows = await db.wallet.findMany({
      where: { storeId: ids ? { in: ids } : undefined, status: (query.status as any) || undefined },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(query.limit) || 500, 1000),
    });
    return {
      wallets: rows.map((w) => ({
        storeId: w.storeId, ownerId: w.ownerId, status: w.status, statusReason: w.statusReason, statusChangedAt: w.statusChangedAt,
        balance: num(w.balance), holds: num(w.holds), available: num(w.balance) - num(w.holds),
      })),
    };
  });

  r.get("/wallets/:storeId/status", ({ params }) => getWalletStatus(db, params.storeId));
  r.get("/wallets/:storeId/statement", async ({ params, query }) => ({
    entries: await getStatement(db, params.storeId, Number(query.limit) || 25),
  }));

  r.post("/wallets/:storeId/holds", async ({ params, body }) => {
    requireFields(body, ["reference", "amount"]);
    return placeCodHold(db, params.storeId, String(body.reference), positiveNumber(body.amount, "amount"));
  });
  r.post("/wallets/:storeId/settle-hold", async ({ body }) => {
    requireFields(body, ["reference"]);
    return settleCodHold(db, String(body.reference));
  });
  r.post("/wallets/:storeId/release-hold", async ({ body }) => {
    requireFields(body, ["reference"]);
    return releaseCodHold(db, String(body.reference), String(body.reason ?? "released"));
  });

  r.post("/wallets/:storeId/topup", async ({ params, body }) => {
    requireFields(body, ["amount", "reference"]);
    const reference = String(body.reference);
    return topUp(db, {
      storeId: params.storeId, amount: positiveNumber(body.amount, "amount"), reference, method: body.method,
      source: body.source === "GATEWAY" ? "GATEWAY" : "CASH", idempotencyKey: String(body.idempotencyKey ?? `topup:${reference}`),
    });
  });

  r.post("/wallets/:storeId/charge", async ({ params, body }) => {
    requireFields(body, ["amount", "kind", "reference", "idempotencyKey"]);
    return chargeWallet(db, {
      storeId: params.storeId, amount: positiveNumber(body.amount, "amount"), kind: body.kind, reference: String(body.reference),
      description: String(body.description ?? `${body.kind} ${body.reference}`), idempotencyKey: String(body.idempotencyKey),
    });
  });

  r.post("/wallets/:storeId/reverse-settlement", async ({ body }) => {
    requireFields(body, ["tranId"]);
    return reverseOnlineSettlement(db, String(body.tranId), String(body.reason ?? "Reversal"));
  });

  r.post("/wallets/:storeId/status", async ({ params, body }) => {
    requireFields(body, ["status", "admin"]);
    await adminChangeStatus(db, params.storeId, body.status, String(body.reason ?? ""), String(body.admin));
    return getWalletStatus(db, params.storeId);
  });

  // ------------------------------------------------------ payout methods
  r.get("/wallets/:storeId/payout-methods", async ({ params }) => ({ methods: await listPayoutMethods(db, params.storeId) }));
  r.post("/wallets/:storeId/payout-methods", async ({ params, body }) => ({ success: true, method: await addPayoutMethod(db, params.storeId, body) }));
  r.delete("/wallets/:storeId/payout-methods/:id", ({ params }) => deletePayoutMethod(db, params.storeId, params.id));

  // --------------------------------------------------------- withdrawals
  r.get("/wallets/:storeId/withdrawals", async ({ params, query }) => ({
    withdrawals: await listWithdrawals(db, { storeId: params.storeId }, Number(query.limit) || 20),
  }));
  r.post("/wallets/:storeId/withdrawals", async ({ params, body }) => {
    requireFields(body, ["payoutMethodId", "amount"]);
    return { success: true, withdrawal: await requestWithdrawal(db, params.storeId, String(body.payoutMethodId), Number(body.amount)) };
  });

  r.get("/admin/withdrawals", async ({ query }) => {
    const withdrawals = await listWithdrawals(db, { status: query.status }, 200);
    const pending = await db.withdrawal.aggregate({ where: { status: "PENDING" }, _count: true, _sum: { amount: true } });
    return { withdrawals, stats: { pendingCount: pending._count, pendingAmount: num(pending._sum.amount) } };
  });
  r.post("/admin/withdrawals/:id/review", async ({ params, body }) => {
    requireFields(body, ["action", "admin"]);
    if (body.action !== "APPROVE" && body.action !== "REJECT") throw new HttpError(400, "Invalid action", "VALIDATION");
    return { success: true, withdrawal: await reviewWithdrawal(db, params.id, body) };
  });

  // --------------------------------------------------- audit / operations
  r.get("/admin/reconcile", async () => reconcileWallets(db));
  r.get("/admin/trial-balance", async () => trialBalance(db));
  r.get("/admin/platform-accounts", async () => ({ accounts: await platformAccountBalances(db) }));
  r.get("/admin/outbox", async () => outboxStats(db));
  r.post("/admin/enforcer/run", async ({ body }) => {
    if (body.storeId) return { decision: await enforceStore(db, String(body.storeId), body.now ? new Date(body.now) : new Date()) };
    return enforceAll(db, body.now ? new Date(body.now) : new Date());
  });

  return r;
}

export interface LedgerServiceOptions {
  secret: string;
  port?: number;
  host?: string;
  databaseUrl?: string;
  /** Run the outbox relay (default true). */
  relay?: boolean;
  /** Run the status-enforcer daemon (default true). */
  daemon?: boolean;
  transport?: Transport;
  applyConstraints?: boolean;
}

export async function applyConstraints(db: Db) {
  const file = path.join(__dirname, "..", "sql", "constraints.sql");
  for (const stmt of splitSqlStatements(fs.readFileSync(file, "utf8"))) {
    await db.$executeRawUnsafe(stmt);
  }
}

export async function startLedgerService(opts: LedgerServiceOptions) {
  const db = createDb(opts.databaseUrl);
  if (opts.applyConstraints !== false) await applyConstraints(db);

  const router = buildRouter(db);
  registerEventRoute(router, db as any, handlers);

  const app = createServer({ name: "ledger-service", router, internalSecret: opts.secret, ready: async () => void (await db.$queryRaw`SELECT 1`) });
  await app.listen(opts.port ?? envInt("PORT", 4005), opts.host);

  const stops: Array<() => void> = [];
  if (opts.relay !== false) {
    stops.push(startRelay({ db: db as any, transport: opts.transport ?? new HttpTransport(opts.secret, "ledger"), name: "ledger" }));
  }
  if (opts.daemon !== false) {
    let busy = false;
    const t = setInterval(async () => {
      if (busy) return;
      busy = true;
      try { await enforceAll(db); } catch (e: any) { console.error("[ledger] enforcer sweep failed:", e?.message); } finally { busy = false; }
    }, config.enforcerIntervalMs);
    stops.push(() => clearInterval(t));
  }

  return {
    db,
    app,
    stop: async () => {
      stops.forEach((s) => s());
      await app.close();
      await db.$disconnect();
    },
  };
}

export { reply };
