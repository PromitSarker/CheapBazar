import { Router, createServer, HttpError, requireFields, envInt } from "../../../packages/service-kit";
import { HttpTransport, startRelay, outboxStats, type Transport } from "../../../packages/event-bus";
import { createDb, type Db } from "./db";
import { loadConfig, type BillingConfig } from "./config";
import { SSLCommerzGateway, type Gateway } from "./gateway";
import { httpLedger, type LedgerGateway } from "./ledger";
import { httpOrders, type OrderGateway } from "./orders";
import { chargeback, createCharge, getPayment, handleIpn, listPayments, reconcile, refundPayment, sweep } from "./payments";
import { createManualPayment, listManual, reviewManualPayment } from "./manual";
import { entitlement, listInvoices, listSubscriptions, parsePlan, revenueSummary, seedPlans, shapePlan, tick, upsertPlan } from "./subscriptions";

/** Used while ONLINE_PAYMENTS_ENABLED=false: nothing can start a gateway session, and nothing is trusted from one. */
const disabledGateway: Gateway = {
  name: "DISABLED",
  async init() { return { ok: false, error: "online payments are disabled" }; },
  async validate() { return { valid: false, status: "ERROR", tranId: "", amount: 0, currency: "", raw: null, error: "disabled" }; },
  async query() { throw new Error("online payments are disabled"); },
  async refund() { return { ok: false, error: "online payments are disabled" }; },
  verifyIpn() { return false; },
};

export interface Deps {
  db: Db;
  gw: Gateway;
  ledger: LedgerGateway;
  orders: OrderGateway;
  cfg: BillingConfig;
  clock: () => Date;
}

export function buildRouter({ db, gw, ledger, orders, cfg, clock }: Deps): Router {
  const r = new Router();

  // ------------------------------------------------------------ gateway callback (public)
  // The gateway posts form-encoded data and cannot send our bearer token: authenticity comes from
  // the IPN signature, checked inside handleIpn, and the outcome is re-verified with the gateway.
  r.post("/payments/webhooks/sslcommerz", async ({ rawBody }) => {
    if (!cfg.onlinePaymentsEnabled) throw new HttpError(503, "Online payments are disabled.", "ONLINE_DISABLED");
    return handleIpn(db, gw, rawBody, clock());
  }, { auth: "none" });

  // ----------------------------------------------------------------------- plans
  r.get("/plans", async () => ({ plans: (await db.plan.findMany({ where: { active: true }, orderBy: { code: "asc" } })).map(shapePlan) }));

  // -------------------------------------------------------------- online payments
  r.post("/payments/charge", ({ body }) => createCharge(db, gw, ledger, orders, cfg, body, clock()));
  r.get("/payments", async ({ query }) => ({ payments: await listPayments(db, { ...query, limit: Number(query.limit) || undefined }) }));
  r.get("/payments/:tranId", ({ params, query }) => getPayment(db, params.tranId, { storeId: query.storeId, userId: query.userId }));
  // The browser return pages (success / fail / cancel) call this; it asks the gateway, trusts nothing from the redirect.
  r.post("/payments/:tranId/reconcile", ({ params }) => reconcile(db, gw, params.tranId, clock()));

  // ---------------------------------------------------------------- entitlements
  // Called by order-service and aggregator-service on hot paths. Unknown buyer => { active: false }.
  // Buyer Pro is the only plan: there is no seller entitlement (sellers pay nothing).
  r.get("/subscriptions/buyer/:userId/status", ({ params }) => entitlement(db, "BUYER_PRO", `user:${params.userId}`, clock()));

  r.post("/subscriptions/subscribe", async ({ body }) => {
    requireFields(body, ["plan", "method", "idempotencyKey"]);
    const plan = parsePlan(body.plan);
    const method = String(body.method).toUpperCase();
    if (method === "GATEWAY") return createCharge(db, gw, ledger, orders, cfg, { ...body, plan, purpose: "SUBSCRIPTION" }, clock());
    // for MANUAL, `transferMethod` says how the money was sent (BKASH / NAGAD / ROCKET / BANK / CASH)
    if (method === "MANUAL") return createManualPayment(db, ledger, cfg, { ...body, method: body.transferMethod, plan, purpose: "SUBSCRIPTION" });
    throw new HttpError(400, "method must be GATEWAY or MANUAL", "VALIDATION");
  });
  r.get("/subscriptions/invoices", async ({ query }) => ({ invoices: await listInvoices(db, { userId: query.userId }) }));

  // ----------------------------------------------------------------- manual payments
  r.post("/topups/manual", ({ body }) => createManualPayment(db, ledger, cfg, { ...body, purpose: "WALLET_TOPUP" }));
  r.get("/topups/manual", async ({ query }) => {
    if (!query.storeId && !query.userId) throw new HttpError(400, "storeId or userId is required", "VALIDATION");
    return { payments: await listManual(db, { storeId: query.storeId, userId: query.userId, status: query.status, limit: Number(query.limit) || undefined }) };
  });

  // -------------------------------------------------------------------------- admin
  r.get("/admin/manual-payments", async ({ query }) => ({ payments: await listManual(db, { status: query.status, storeId: query.storeId, userId: query.userId, limit: Number(query.limit) || undefined }) }));
  r.patch("/admin/manual-payments/:id/review", ({ params, body }) => {
    requireFields(body, ["decision", "admin"]);
    return reviewManualPayment(db, { id: params.id, decision: String(body.decision), admin: String(body.admin), note: body.note }, clock());
  });
  r.get("/admin/plans", async () => ({ plans: (await db.plan.findMany({ orderBy: { code: "asc" } })).map(shapePlan) }));
  r.post("/admin/plans", ({ body }) => upsertPlan(db, body));
  r.get("/admin/subscriptions", async ({ query }) => ({ subscriptions: await listSubscriptions(db, { status: query.status, limit: Number(query.limit) || undefined }) }));
  // What Buyer Pro has earned the platform (the ledger's PLATFORM_SUBSCRIPTION_REVENUE is the book of record).
  r.get("/admin/revenue", () => revenueSummary(db, clock()));
  r.get("/admin/payments", async ({ query }) => ({ payments: await listPayments(db, { ...query, limit: Number(query.limit) || undefined }) }));
  r.post("/admin/payments/:tranId/refund", ({ params, body }) => {
    requireFields(body, ["admin", "reason"]);
    return refundPayment(db, gw, ledger, { tranId: params.tranId, admin: String(body.admin), reason: String(body.reason) });
  });
  r.post("/admin/payments/:tranId/chargeback", ({ params, body }) => {
    requireFields(body, ["admin"]);
    return chargeback(db, ledger, { tranId: params.tranId, admin: String(body.admin), note: body.note }, clock());
  });
  r.post("/admin/billing/tick", () => runTick(db, gw, ledger, cfg, clock()));
  r.get("/admin/outbox", () => outboxStats(db as any));
  return r;
}

async function runTick(db: Db, gw: Gateway, ledger: LedgerGateway, cfg: BillingConfig, now: Date) {
  return {
    subscriptions: await tick(db, now),
    payments: cfg.onlinePaymentsEnabled ? await sweep(db, gw, cfg, now) : null,
  };
}

export interface BillingServiceOptions {
  secret: string;
  port?: number;
  host?: string;
  databaseUrl?: string;
  relay?: boolean;
  worker?: boolean;
  seedPlans?: boolean;
  transport?: Transport;
  ledger?: LedgerGateway;
  orders?: OrderGateway;
  gateway?: Gateway;
  config?: Partial<BillingConfig>;
  /** Injectable time source (tests simulate days passing); defaults to the system clock. */
  clock?: () => Date;
}

export async function startBillingService(opts: BillingServiceOptions) {
  const db = createDb(opts.databaseUrl);
  const cfg = loadConfig(opts.config);
  const ledger = opts.ledger ?? httpLedger(opts.secret);
  const orders = opts.orders ?? httpOrders(opts.secret);
  const gw = opts.gateway ?? (cfg.onlinePaymentsEnabled ? new SSLCommerzGateway() : disabledGateway);
  const clock = opts.clock ?? (() => new Date());
  const router = buildRouter({ db, gw, ledger, orders, cfg, clock });
  if (opts.seedPlans !== false) await seedPlans(db);

  const app = createServer({ name: "payment-billing-service", router, internalSecret: opts.secret, ready: async () => void (await db.$queryRaw`SELECT 1`) });
  await app.listen(opts.port ?? envInt("PORT", 4004), opts.host);

  const stops: Array<() => void> = [];
  if (opts.relay !== false) stops.push(startRelay({ db: db as any, transport: opts.transport ?? new HttpTransport(opts.secret, "payment"), name: "payment" }));
  if (opts.worker !== false) {
    let busy = false;
    const t = setInterval(async () => {
      if (busy) return;
      busy = true;
      try { await runTick(db, gw, ledger, cfg, clock()); } catch (e: any) { console.error("[payment] scheduler:", e?.message); } finally { busy = false; }
    }, envInt("BILLING_TICK_INTERVAL_MS", 60_000));
    stops.push(() => clearInterval(t));
  }
  return {
    db, app, cfg,
    runTick: (now = clock()) => runTick(db, gw, ledger, cfg, now),
    stop: async () => {
      stops.forEach((s) => s());
      await app.close();
      await db.$disconnect();
    },
  };
}
