import crypto from "crypto";
import { publish } from "../../../packages/event-bus";
import { D, Prisma, type Runner, type Tx } from "./db";

/**
 * Double-entry ledger engine.
 *
 * Invariants (also enforced by DB triggers, see sql/constraints.sql):
 *  - every transaction balances; rows are insert-only (fix mistakes by reversal)
 *  - every wallet balance change happens here, atomically with its postings, so
 *    Wallet.balance can always be reconciled against the ledger.
 *
 * Accounts (BDT):
 *  STORE_WALLET:<id>  liability to seller, credit-normal (credit = money in)
 *  PLATFORM_CASH      bank/MFS money we hold, debit-normal
 *  GATEWAY_CLEARING   online money in transit, debit-normal
 *  PAYOUT_CLEARING    withdrawals in flight, credit-normal
 *  PLATFORM_*_REVENUE income, credit-normal;  PLATFORM_EQUITY opening/adjustments
 */

type Amount = number | string | Prisma.Decimal;

export type AccountRef =
  | { type: "STORE_WALLET"; storeId: string }
  | {
      type:
        | "PLATFORM_CASH"
        | "PLATFORM_FEE_REVENUE"
        | "PLATFORM_AD_REVENUE"
        | "PLATFORM_SUBSCRIPTION_REVENUE"
        | "PAYOUT_CLEARING"
        | "GATEWAY_CLEARING"
        | "PLATFORM_EQUITY";
    };

export class InsufficientFundsError extends Error {
  constructor(message = "Insufficient wallet funds") {
    super(message);
    this.name = "InsufficientFundsError";
  }
}

export const accountCode = (ref: AccountRef) => (ref.type === "STORE_WALLET" ? `STORE_WALLET:${ref.storeId}` : ref.type);

export async function ensureWallet(tx: Runner, storeId: string, ownerId?: string | null): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "Wallet" ("storeId","ownerId","updatedAt") VALUES (${storeId}, ${ownerId ?? null}, now())
    ON CONFLICT ("storeId") DO NOTHING`;
  if (ownerId) {
    await tx.$executeRaw`UPDATE "Wallet" SET "ownerId" = ${ownerId} WHERE "storeId" = ${storeId} AND "ownerId" IS NULL`;
  }
}

async function ensureAccount(tx: Runner, ref: AccountRef): Promise<string> {
  const code = accountCode(ref);
  const found = await tx.ledgerAccount.findUnique({ where: { code }, select: { id: true } });
  if (found) return found.id;
  const storeId = ref.type === "STORE_WALLET" ? ref.storeId : null;
  const name = ref.type === "STORE_WALLET" ? `Store wallet ${ref.storeId}` : ref.type.replace(/_/g, " ").toLowerCase();
  await tx.$executeRaw`
    INSERT INTO "LedgerAccount" ("id","code","type","storeId","name")
    VALUES (${crypto.randomUUID()}, ${code}, ${ref.type}::"LedgerAccountType", ${storeId}, ${name})
    ON CONFLICT ("code") DO NOTHING`;
  return (await tx.ledgerAccount.findUniqueOrThrow({ where: { code }, select: { id: true } })).id;
}

export interface PostingInput {
  account: AccountRef;
  debit?: Amount;
  credit?: Amount;
}

export interface PostOptions {
  kind: string;
  reference?: string;
  description: string;
  /** Same key => same transaction. Makes retries and event replays safe. */
  idempotencyKey: string;
  postings: PostingInput[];
  /** Statement type shown to the seller (defaults to kind). */
  entryType?: string;
  /** For debits on a store wallet: require (balance - holds - amount) >= minAvailableAfter. */
  walletGuard?: { minAvailableAfter: Amount };
  /** Backfill only: don't touch Wallet.balance. */
  skipWalletCache?: boolean;
  reversesId?: string;
}

export interface PostResult {
  id: string;
  created: boolean;
}

export async function postTransaction(tx: Tx, opts: PostOptions): Promise<PostResult> {
  const existing = await tx.ledgerTransaction.findUnique({
    where: { idempotencyKey: opts.idempotencyKey },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const lines = opts.postings
    .map((p) => ({ account: p.account, debit: D(p.debit ?? 0), credit: D(p.credit ?? 0) }))
    .filter((l) => l.debit.gt(0) || l.credit.gt(0));
  for (const l of lines) {
    if (l.debit.gt(0) && l.credit.gt(0)) throw new Error("A posting cannot be both debit and credit");
  }
  if (lines.length < 2) throw new Error("A ledger transaction needs at least two postings");
  const zero = new Prisma.Decimal(0);
  const totalDebit = lines.reduce((a, l) => a.plus(l.debit), zero);
  const totalCredit = lines.reduce((a, l) => a.plus(l.credit), zero);
  if (!totalDebit.equals(totalCredit)) {
    throw new Error(`Unbalanced ledger transaction: debit ${totalDebit} != credit ${totalCredit}`);
  }

  const ids = new Map<string, string>();
  for (const l of lines) {
    if (l.account.type === "STORE_WALLET") await ensureWallet(tx, l.account.storeId);
    const code = accountCode(l.account);
    if (!ids.has(code)) ids.set(code, await ensureAccount(tx, l.account));
  }

  const created = await tx.ledgerTransaction.create({
    data: {
      kind: opts.kind,
      reference: opts.reference,
      description: opts.description,
      idempotencyKey: opts.idempotencyKey,
      reversesId: opts.reversesId,
      postings: {
        create: lines.map((l) => ({ accountId: ids.get(accountCode(l.account))!, debit: l.debit, credit: l.credit })),
      },
    },
    select: { id: true },
  });

  // The balance trigger is DEFERRED (postings are inserted one row at a time), but
  // Prisma can swallow an error raised at COMMIT, which would make an unbalanced
  // transaction look successful. Force the check here, where errors propagate,
  // then re-defer so later postings in the same DB transaction still work.
  await tx.$executeRaw`SET CONSTRAINTS ledger_posting_balanced IMMEDIATE`;
  await tx.$executeRaw`SET CONSTRAINTS ledger_posting_balanced DEFERRED`;

  const deltas = new Map<string, Prisma.Decimal>();
  for (const l of lines) {
    if (l.account.type !== "STORE_WALLET") continue;
    deltas.set(l.account.storeId, (deltas.get(l.account.storeId) ?? zero).plus(l.credit).minus(l.debit));
  }
  for (const [storeId, delta] of deltas) {
    if (delta.isZero() || opts.skipWalletCache) continue;
    if (delta.lt(0) && opts.walletGuard) {
      const need = delta.abs();
      const floor = D(opts.walletGuard.minAvailableAfter);
      const n = await tx.$executeRaw`
        UPDATE "Wallet" SET "balance" = "balance" - ${need}, "updatedAt" = now()
         WHERE "storeId" = ${storeId} AND ("balance" - "holds" - ${need}) >= ${floor}`;
      if (n === 0) throw new InsufficientFundsError();
    } else {
      await tx.wallet.update({ where: { storeId }, data: { balance: { increment: delta } } });
    }
  }

  for (const l of lines) {
    if (l.account.type !== "STORE_WALLET") continue;
    await tx.statementEntry.create({
      data: {
        storeId: l.account.storeId,
        transactionId: opts.reference ?? created.id,
        entryType: opts.entryType ?? opts.kind,
        description: opts.description,
        debit: l.debit.gt(0) ? l.debit : null,
        credit: l.credit.gt(0) ? l.credit : null,
        ledgerTxId: created.id,
      },
    });
  }
  return { id: created.id, created: true };
}

/** Mirror-image reversal (refund / chargeback / correction). The original is untouched. */
export async function reverseTransaction(
  tx: Tx,
  originalId: string,
  opts: { reason: string; idempotencyKey: string; reference?: string; entryType?: string }
): Promise<PostResult> {
  const again = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: opts.idempotencyKey }, select: { id: true } });
  if (again) return { id: again.id, created: false };
  const reversed = await tx.ledgerTransaction.findUnique({ where: { reversesId: originalId }, select: { id: true } });
  if (reversed) return { id: reversed.id, created: false };

  const original = await tx.ledgerTransaction.findUniqueOrThrow({
    where: { id: originalId },
    include: { postings: { include: { account: true } } },
  });
  return postTransaction(tx, {
    kind: `REVERSAL_${original.kind}`,
    reference: opts.reference ?? original.reference ?? undefined,
    description: `Reversal: ${opts.reason} (of ${original.description})`,
    idempotencyKey: opts.idempotencyKey,
    entryType: opts.entryType ?? "REVERSAL",
    reversesId: originalId,
    postings: original.postings.map((p) => ({
      account:
        p.account.type === "STORE_WALLET"
          ? { type: "STORE_WALLET" as const, storeId: p.account.storeId! }
          : ({ type: p.account.type } as AccountRef),
      debit: p.credit,
      credit: p.debit,
    })),
  });
}

// ------------------------------------------------------------------- holds

/** Atomically add to Wallet.holds only if (balance - holds) >= amount. */
export async function reserveFunds(tx: Runner, storeId: string, amount: Amount): Promise<boolean> {
  const a = D(amount);
  const n = await tx.$executeRaw`
    UPDATE "Wallet" SET "holds" = "holds" + ${a}, "updatedAt" = now()
     WHERE "storeId" = ${storeId} AND ("balance" - "holds") >= ${a}`;
  return n > 0;
}

export async function releaseFunds(tx: Runner, storeId: string, amount: Amount): Promise<void> {
  const a = D(amount);
  await tx.$executeRaw`UPDATE "Wallet" SET "holds" = GREATEST("holds" - ${a}, 0), "updatedAt" = now() WHERE "storeId" = ${storeId}`;
}

/** Per-key transaction advisory lock (e.g. serialise one store's withdrawals). */
export async function lockKey(tx: Runner, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

// --------------------------------------------------------------- reporting

export async function reconcileWallets(db: Runner) {
  {
    const rows = await db.$queryRaw<{ storeId: string; cached: Prisma.Decimal; ledger: Prisma.Decimal }[]>`
      SELECT w."storeId", w."balance" AS cached, COALESCE(SUM(p."credit" - p."debit"), 0) AS ledger
        FROM "Wallet" w
        LEFT JOIN "LedgerAccount" a ON a."code" = 'STORE_WALLET:' || w."storeId"
        LEFT JOIN "LedgerPosting" p ON p."accountId" = a."id"
       GROUP BY w."storeId", w."balance"`;
    const mismatches = rows
      .filter((r) => !new Prisma.Decimal(r.cached).equals(new Prisma.Decimal(r.ledger)))
      .map((r) => ({
        storeId: r.storeId,
        cached: Number(r.cached),
        ledger: Number(r.ledger),
        diff: Number(new Prisma.Decimal(r.cached).minus(new Prisma.Decimal(r.ledger))),
      }));
    return { checked: rows.length, mismatches };
  }
}

export async function trialBalance(db: Runner) {
  const agg = await db.ledgerPosting.aggregate({ _sum: { debit: true, credit: true } });
  const debit = agg._sum.debit ?? new Prisma.Decimal(0);
  const credit = agg._sum.credit ?? new Prisma.Decimal(0);
  return { debit: Number(debit), credit: Number(credit), balanced: debit.equals(credit) };
}

export async function platformAccountBalances(db: Runner) {
  const rows = await db.$queryRaw<{ code: string; type: string; debit: Prisma.Decimal; credit: Prisma.Decimal }[]>`
    SELECT a."code", a."type"::text AS type, COALESCE(SUM(p."debit"),0) AS debit, COALESCE(SUM(p."credit"),0) AS credit
      FROM "LedgerAccount" a LEFT JOIN "LedgerPosting" p ON p."accountId" = a."id"
     WHERE a."storeId" IS NULL GROUP BY a."code", a."type" ORDER BY a."code"`;
  return rows.map((r) => ({
    code: r.code,
    type: r.type,
    debit: Number(r.debit),
    credit: Number(r.credit),
    net: Number(new Prisma.Decimal(r.credit).minus(new Prisma.Decimal(r.debit))),
  }));
}

export { publish };
