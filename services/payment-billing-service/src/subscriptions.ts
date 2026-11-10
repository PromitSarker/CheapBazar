import crypto from "crypto";
import { HttpError, requireFields } from "../../../packages/service-kit";
import { publish } from "../../../packages/event-bus";
import { lockKey, num, round2, type Db, type Runner, type Tx } from "./db";
import { DEFAULT_PLANS } from "./config";

/**
 * Buyer Pro is the ONLY plan: a wholesale buyer pays a monthly fee, sellers pay nothing and retail
 * buyers pay nothing. The buyer's fee is the platform's (admin's) revenue: every paid period
 * publishes PlatformRevenueReceived, which ledger-service books into the platform's own account.
 */
export type PlanCode = "BUYER_PRO";
const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const invoiceNumber = (now: Date) => `INV-${now.toISOString().slice(0, 7).replace("-", "")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

export const subjectFor = (_plan: PlanCode, ids: { userId?: string }) => {
  if (!ids.userId) throw new HttpError(400, "Buyer Pro belongs to a buyer account: userId is required", "VALIDATION");
  return { key: `user:${ids.userId}`, userId: ids.userId };
};

export function parsePlan(v: unknown): PlanCode {
  if (String(v ?? "").toUpperCase() !== "BUYER_PRO") {
    throw new HttpError(400, "The only plan is BUYER_PRO (the wholesale buyer's monthly plan). Sellers pay nothing.", "VALIDATION");
  }
  return "BUYER_PRO";
}

// -------------------------------------------------------------------- plans

export async function seedPlans(db: Db) {
  if ((await db.plan.count()) > 0) return;
  for (const p of DEFAULT_PLANS) await db.plan.create({ data: p });
}

export const shapePlan = (p: any) => ({ code: p.code, name: p.name, price: num(p.price), periodDays: p.periodDays, graceDays: p.graceDays, active: p.active });

export async function upsertPlan(db: Db, body: any) {
  requireFields(body, ["code"]);
  const code = parsePlan(body.code);
  const data: any = {};
  if (body.name !== undefined) data.name = String(body.name).slice(0, 80);
  if (body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) throw new HttpError(400, "price must be a positive number", "VALIDATION");
    data.price = round2(price);
  }
  for (const k of ["periodDays", "graceDays"] as const) {
    if (body[k] !== undefined) {
      const n = Number(body[k]);
      if (!Number.isInteger(n) || n < (k === "periodDays" ? 1 : 0) || n > 366) throw new HttpError(400, `${k} is out of range`, "VALIDATION");
      data[k] = n;
    }
  }
  if (body.active !== undefined) data.active = !!body.active;
  const existing = await db.plan.findUnique({ where: { code } });
  if (!existing) {
    requireFields(body, ["name", "price"]);
    return shapePlan(await db.plan.create({ data: { code, periodDays: 30, graceDays: 3, ...data } }));
  }
  // Price changes affect FUTURE payments only: existing invoices are never rewritten.
  return shapePlan(await db.plan.update({ where: { code }, data }));
}

export async function getPlan(db: Runner, code: PlanCode, mustBeActive = true) {
  const p = await db.plan.findUnique({ where: { code } });
  if (!p || (mustBeActive && !p.active)) throw new HttpError(404, "This plan is not available.", "PLAN_UNAVAILABLE");
  return p;
}

// ------------------------------------------------------------- entitlement

/**
 * What order-service and aggregator-service ask on hot paths. The stored status is re-checked
 * against the clock on every read, so a missed or late tick can never leave a lapsed plan active.
 * Active = ACTIVE or in grace. Unknown buyer => not active (fail closed).
 */
export async function entitlement(db: Runner, plan: PlanCode, subjectKey: string, now = new Date()) {
  const sub = await db.subscription.findUnique({ where: { plan_subjectKey: { plan, subjectKey } } });
  if (!sub) return { active: false, status: "NONE", plan, currentPeriodEnd: null, graceEndsAt: null };
  const p = await db.plan.findUnique({ where: { code: plan } });
  const graceDays = p?.graceDays ?? 0;
  let status: string = sub.status;
  let graceEndsAt = sub.graceEndsAt;
  if (sub.status === "ACTIVE" && now > sub.currentPeriodEnd) {
    graceEndsAt = addDays(sub.currentPeriodEnd, graceDays);
    status = now <= graceEndsAt ? "GRACE" : "LAPSED";
  } else if (sub.status === "GRACE" && (!graceEndsAt || now > graceEndsAt)) {
    status = "LAPSED";
  }
  return { active: status === "ACTIVE" || status === "GRACE", status, plan, currentPeriodEnd: sub.currentPeriodEnd, graceEndsAt, subscriptionId: sub.id };
}

// --------------------------------------------------------------- activation

const eventBody = (sub: any, extra: Record<string, unknown> = {}) => ({
  plan: sub.plan, userId: sub.userId, subscriptionId: sub.id, periodEnd: sub.currentPeriodEnd, ...extra,
});

/**
 * Start or extend Buyer Pro after the buyer's money has been received (verified gateway payment or
 * admin-approved manual payment). Runs inside the caller's transaction, so the payment state, the
 * invoice, the subscription and BOTH events (activation + the platform revenue) commit together.
 * Idempotent per `paymentRef`: applying the same payment twice changes nothing.
 * `amount` is what the buyer really paid (not today's list price): the invoice and the platform's
 * books record that.
 */
export async function activateSubscription(
  tx: Tx,
  p: { plan: PlanCode; userId?: string; amount: number; method: "GATEWAY" | "MANUAL"; paymentRef: string; now?: Date }
) {
  const now = p.now ?? new Date();
  const subj = subjectFor(p.plan, p);
  await lockKey(tx, `sub:${subj.key}`);

  const dup = await tx.invoice.findFirst({ where: { paymentRef: p.paymentRef, plan: p.plan } });
  if (dup) return { applied: false, invoiceNumber: dup.invoiceNumber };

  const plan = await getPlan(tx, p.plan, false); // money already taken: honour it even if the plan was just retired
  const existing = await tx.subscription.findUnique({ where: { plan_subjectKey: { plan: p.plan, subjectKey: subj.key } } });

  // paying early stacks on top of the remaining time; paying after it ran out starts now
  const start = existing && existing.status === "ACTIVE" && existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now;
  const end = addDays(start, plan.periodDays);
  const data = {
    status: "ACTIVE" as const, graceEndsAt: null, currentPeriodEnd: end,
    currentPeriodStart: existing && start > now ? existing.currentPeriodStart : start,
  };
  const sub = existing
    ? await tx.subscription.update({ where: { id: existing.id }, data })
    : await tx.subscription.create({ data: { plan: p.plan, subjectKey: subj.key, userId: subj.userId, ...data } });

  const inv = await tx.invoice.create({
    data: {
      invoiceNumber: invoiceNumber(now), subscriptionId: sub.id, plan: p.plan, amount: p.amount,
      periodStart: start, periodEnd: end, method: p.method, paymentRef: p.paymentRef,
    },
  });
  await publish(tx as any, "payment", "SubscriptionActivated", eventBody(sub, { invoiceNumber: inv.invoiceNumber, amount: p.amount }));
  // The buyer's fee is the platform's (admin's) money: ledger-service books it to the platform account.
  await publish(tx as any, "payment", "PlatformRevenueReceived", {
    source: p.plan, amount: p.amount, reference: p.paymentRef, method: p.method, userId: sub.userId, invoiceNumber: inv.invoiceNumber,
  });
  return { applied: true, invoiceNumber: inv.invoiceNumber, subscriptionId: sub.id, periodEnd: end };
}

// ----------------------------------------------------------------- reads

export async function listInvoices(db: Db, q: { userId?: string }) {
  if (!q.userId) throw new HttpError(400, "userId is required", "VALIDATION");
  const subs = await db.subscription.findMany({ where: { userId: q.userId } });
  const rows = await db.invoice.findMany({ where: { subscriptionId: { in: subs.map((s) => s.id) } }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((i) => ({
    invoiceNumber: i.invoiceNumber, plan: i.plan, amount: num(i.amount), periodStart: i.periodStart, periodEnd: i.periodEnd,
    method: i.method, paymentRef: i.paymentRef, status: i.status, createdAt: i.createdAt,
  }));
}

export async function listSubscriptions(db: Db, q: { status?: string; limit?: number }) {
  const rows = await db.subscription.findMany({
    where: q.status ? { status: q.status as any } : {}, orderBy: { updatedAt: "desc" }, take: Math.min(q.limit ?? 100, 500),
  });
  return rows.map((s) => ({ id: s.id, plan: s.plan, userId: s.userId, status: s.status, currentPeriodEnd: s.currentPeriodEnd, graceEndsAt: s.graceEndsAt }));
}

/**
 * What the platform has earned from Buyer Pro, from the invoices (the ledger's
 * PLATFORM_SUBSCRIPTION_REVENUE account is the book of record; this is the admin's quick view).
 * Chargebacks are subtracted.
 */
export async function revenueSummary(db: Db, now = new Date()) {
  const rows = await db.$queryRawUnsafe<{ total: any; count: bigint; last30: any; reversed: any }[]>(
    `SELECT COALESCE(SUM(i."amount"),0) AS total, COUNT(*)::bigint AS count,
            COALESCE(SUM(i."amount") FILTER (WHERE i."createdAt" >= $1),0) AS last30,
            COALESCE(SUM(i."amount") FILTER (WHERE EXISTS (SELECT 1 FROM "Payment" p WHERE p."tranId" = i."paymentRef" AND p."status" = 'CHARGEBACK')),0) AS reversed
       FROM "Invoice" i WHERE i."status" = 'PAID'`,
    new Date(now.getTime() - 30 * DAY)
  );
  const r = rows[0];
  const gross = Number(r.total);
  const reversed = Number(r.reversed);
  return { invoices: Number(r.count), gross, chargedBack: reversed, net: round2(gross - reversed), last30Days: Number(r.last30) };
}

// ----------------------------------------------------------------- scheduler

/**
 * Lifecycle tick (every minute, and on demand). Buyers pay each month themselves, so the
 * platform never charges anyone automatically:
 *
 *   ACTIVE --paid month ends--> GRACE (access continues, buyer is told to pay again) --grace ends--> LAPSED
 *
 * Every transition is a compare-and-swap, so overlapping runs or several instances are harmless.
 */
export async function tick(db: Db, now = new Date()) {
  const out = { enteredGrace: 0, lapsed: 0 };
  const plans = new Map((await db.plan.findMany()).map((p) => [p.code, p]));
  const graceOf = (code: string) => plans.get(code as any)?.graceDays ?? 0;

  for (const sub of await db.subscription.findMany({ where: { status: "ACTIVE", currentPeriodEnd: { lte: now } }, take: 500 })) {
    const graceEndsAt = addDays(sub.currentPeriodEnd, graceOf(sub.plan));
    const to = graceEndsAt <= now ? "LAPSED" : "GRACE";
    const changed = await db.$transaction(async (tx) => {
      const r = await tx.subscription.updateMany({ where: { id: sub.id, status: "ACTIVE" }, data: { status: to, graceEndsAt: to === "GRACE" ? graceEndsAt : null } });
      if (!r.count) return false;
      const fresh = await tx.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      await publish(tx as any, "payment", to === "GRACE" ? "SubscriptionEnteredGrace" : "SubscriptionLapsed", eventBody(fresh, to === "GRACE" ? { graceEndsAt } : {}));
      return true;
    });
    if (changed) out[to === "GRACE" ? "enteredGrace" : "lapsed"]++;
  }

  for (const sub of await db.subscription.findMany({ where: { status: "GRACE", graceEndsAt: { lte: now } }, take: 500 })) {
    const changed = await db.$transaction(async (tx) => {
      const r = await tx.subscription.updateMany({ where: { id: sub.id, status: "GRACE" }, data: { status: "LAPSED", graceEndsAt: null } });
      if (!r.count) return false;
      await publish(tx as any, "payment", "SubscriptionLapsed", eventBody(await tx.subscription.findUniqueOrThrow({ where: { id: sub.id } })));
      return true;
    });
    if (changed) out.lapsed++;
  }
  return out;
}
