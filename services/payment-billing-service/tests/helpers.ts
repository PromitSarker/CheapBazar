import crypto from "crypto";
import { ServiceError } from "../../../packages/service-kit";
import type { Gateway, InitParams, QueryResult, RefundParams, RemoteStatus, ValidationResult } from "../src/gateway";
import { verifySslcommerzSignature } from "../src/gateway";
import type { LedgerGateway } from "../src/ledger";
import type { OrderGateway, OrderInfo } from "../src/orders";

export const STORE_PASSWORD = "test-store-password";

/** In-memory stand-in for SSLCommerz. The test plays the buyer with pay()/fail()/cancel(). */
export class FakeGateway implements Gateway {
  readonly name = "FAKE";
  sessions = new Map<string, { amount: number; remote: RemoteStatus; valId?: string }>();
  validations = new Map<string, { status: string; tranId: string; amount: number; currency: string; bankTranId: string }>();
  initCalls = 0;
  refundCalls: RefundParams[] = [];
  validateCalls = 0;
  down = false;          // gateway unreachable
  failInit = false;
  refuseRefund = false;
  private n = 0;

  async init(p: InitParams) {
    this.initCalls++;
    if (this.failInit) return { ok: false, error: "gateway says no" };
    this.sessions.set(p.tranId, { amount: p.amount, remote: "PENDING" });
    return { ok: true, gatewayUrl: `https://fake-gw.example/pay/${p.tranId}`, sessionKey: `sk-${p.tranId}` };
  }
  async validate(valId: string): Promise<ValidationResult> {
    this.validateCalls++;
    if (this.down) return { valid: false, status: "ERROR", tranId: "", amount: 0, currency: "", raw: null, error: "down" };
    const v = this.validations.get(valId);
    if (!v) return { valid: false, status: "INVALID_TRANSACTION", tranId: "", amount: 0, currency: "", raw: {} };
    return { valid: v.status === "VALID", status: v.status, tranId: v.tranId, amount: v.amount, currency: v.currency, bankTranId: v.bankTranId, cardType: "VISA", raw: v };
  }
  async query(tranId: string): Promise<QueryResult> {
    if (this.down) throw new Error("down");
    const s = this.sessions.get(tranId);
    if (!s) return { found: false, status: "UNKNOWN", raw: {} };
    return { found: true, status: s.remote, valId: s.valId, raw: {} };
  }
  async refund(p: RefundParams) {
    this.refundCalls.push(p);
    return this.refuseRefund ? { ok: false, error: "refund window closed" } : { ok: true, gatewayRefId: `gr-${p.refundRef}` };
  }
  verifyIpn(fields: Record<string, string>) {
    return verifySslcommerzSignature(fields, STORE_PASSWORD);
  }

  // ---- the buyer's side
  /** The buyer pays at the gateway. Returns the val_id the gateway would send us. Override fields to simulate fraud. */
  pay(tranId: string, over: Partial<{ amount: number; currency: string; tranId: string }> = {}) {
    const s = this.sessions.get(tranId)!;
    const valId = `VAL-${++this.n}-${crypto.randomBytes(3).toString("hex")}`;
    this.validations.set(valId, { status: "VALID", tranId: over.tranId ?? tranId, amount: over.amount ?? s.amount, currency: over.currency ?? "BDT", bankTranId: `BANK${this.n}${crypto.randomBytes(3).toString("hex")}` });
    if (over.amount === undefined && over.currency === undefined && over.tranId === undefined) { s.remote = "PAID"; s.valId = valId; }
    return valId;
  }
  set(tranId: string, remote: RemoteStatus) { this.sessions.get(tranId)!.remote = remote; }
}

/** Build an IPN body the way SSLCommerz does (signed with the store password). */
export function ipnBody(fields: Record<string, string>, password = STORE_PASSWORD, tamper?: (f: Record<string, string>) => void) {
  const verifyKey = [...Object.keys(fields), "verify_key"].filter((k) => k !== "verify_key").join(",") + ",verify_key";
  const signed: Record<string, string> = { ...fields, verify_key: verifyKey };
  const toSign: Record<string, string> = {};
  for (const k of verifyKey.split(",")) toSign[k] = signed[k];
  toSign.store_passwd = crypto.createHash("md5").update(password).digest("hex");
  const text = Object.keys(toSign).sort().map((k) => `${k}=${toSign[k]}`).join("&");
  signed.verify_sign = crypto.createHash("md5").update(text).digest("hex");
  if (tamper) tamper(signed);
  return new URLSearchParams(signed).toString();
}

export class FakeLedger implements LedgerGateway {
  wallets = new Map<string, { available: number }>();
  reversals: string[] = [];
  down = false;
  addStore(storeId: string, available = 0) { this.wallets.set(storeId, { available }); return storeId; }
  async walletExists(storeId: string) {
    if (this.down) throw new ServiceError(503, "ledger down", "UNREACHABLE");
    return this.wallets.has(storeId);
  }
  async reverseSettlement(p: { tranId: string }) {
    if (this.down) throw new ServiceError(503, "ledger down", "UNREACHABLE");
    const first = !this.reversals.includes(p.tranId);
    if (first) this.reversals.push(p.tranId);
    return { reversed: first };
  }
}

export class FakeOrders implements OrderGateway {
  orders = new Map<string, OrderInfo>();
  add(o: Partial<OrderInfo> & { orderNumber: string; storeId: string }) {
    const full: OrderInfo = { status: "PENDING_PAYMENT", paymentMethod: "SSLCOMMERZ", totalAmount: 1000, platformFee: 50, sellerNet: 950, buyerName: "Buyer", buyerEmail: "b@example.com", buyerPhone: "01711111111", shippingAddress: "Dhaka", shippingCity: "Dhaka", ...o };
    this.orders.set(full.orderNumber, full);
    return full;
  }
  async get(orderNumber: string) { return this.orders.get(orderNumber) ?? null; }
}
