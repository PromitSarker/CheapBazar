import crypto from "crypto";

/**
 * Payment gateway abstraction. SSLCommerz is the only real implementation (and it is
 * on hold behind ONLINE_PAYMENTS_ENABLED); tests use a fake. Stripe / bKash direct would
 * be another class implementing this interface.
 *
 * The SSLCommerz code is a port of src/modules/payments/sslcommerz (which the live
 * monolith still uses until cutover) with three differences:
 *  - no "testbox/qwerty" fallback credentials in live mode (it refuses to start),
 *  - fetch is injectable, so tests never touch the network,
 *  - IPN `verify_sign` is really verified (audit finding #3: the monolith returned true).
 */
export interface InitParams {
  tranId: string;
  amount: number;
  currency: string;
  purpose: string;
  productName: string;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipnUrl?: string;
  customer: { name: string; email: string; phone: string; address: string; city: string };
  meta?: { a?: string; b?: string; c?: string };
}
export interface InitResult { ok: boolean; gatewayUrl?: string; sessionKey?: string; error?: string }

export interface ValidationResult {
  /** True only when the gateway says the money is really there. */
  valid: boolean;
  status: string;
  tranId: string;
  amount: number;
  currency: string;
  bankTranId?: string;
  cardType?: string;
  raw: unknown;
  error?: string;
}

export type RemoteStatus = "PAID" | "PENDING" | "FAILED" | "CANCELLED" | "EXPIRED" | "UNKNOWN";
export interface QueryResult { found: boolean; status: RemoteStatus; valId?: string; raw: unknown }

export interface RefundParams { bankTranId: string; amount: number; remarks: string; refundRef: string }
export interface RefundResult { ok: boolean; gatewayRefId?: string; error?: string }

export interface Gateway {
  readonly name: string;
  init(p: InitParams): Promise<InitResult>;
  /** Server-to-server validation by val_id. THE authority for "was it paid". */
  validate(valId: string): Promise<ValidationResult>;
  /** Ask the gateway what it knows about a merchant transaction id (for reconciliation). */
  query(tranId: string): Promise<QueryResult>;
  refund(p: RefundParams): Promise<RefundResult>;
  /** Check an incoming IPN POST really comes from the gateway. */
  verifyIpn(fields: Record<string, string>): boolean;
}

// ------------------------------------------------------------------ SSLCommerz

type FetchFn = typeof fetch;

export class SSLCommerzGateway implements Gateway {
  readonly name = "SSLCOMMERZ";
  private storeId: string;
  private storePasswd: string;
  private baseUrl: string;

  constructor(
    opts: { storeId?: string; storePassword?: string; live?: boolean; fetchFn?: FetchFn } = {},
    private fetchFn: FetchFn = opts.fetchFn ?? fetch
  ) {
    const live = opts.live ?? process.env.SSLCOMMERZ_IS_LIVE === "true";
    this.storeId = opts.storeId ?? process.env.SSLCOMMERZ_STORE_ID ?? "";
    this.storePasswd = opts.storePassword ?? process.env.SSLCOMMERZ_STORE_PASSWORD ?? "";
    if (live && (!this.storeId || !this.storePasswd)) {
      throw new Error("SSLCommerz is configured as LIVE but SSLCOMMERZ_STORE_ID / SSLCOMMERZ_STORE_PASSWORD are missing");
    }
    // Sandbox defaults are the public SSLCommerz test credentials; never used in live mode.
    if (!live) {
      this.storeId = this.storeId || "testbox";
      this.storePasswd = this.storePasswd || "qwerty";
    }
    this.baseUrl = live ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com";
  }

  private async http(url: string, init?: RequestInit): Promise<any> {
    const res = await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(15_000), cache: "no-store" } as RequestInit);
    if (!res.ok) throw new Error(`SSLCommerz HTTP ${res.status}`);
    return res.json();
  }

  async init(p: InitParams): Promise<InitResult> {
    const body = new URLSearchParams();
    const add = (k: string, v: unknown) => v !== undefined && v !== null && body.append(k, String(v));
    add("store_id", this.storeId);
    add("store_passwd", this.storePasswd);
    add("total_amount", p.amount.toFixed(2));
    add("currency", p.currency);
    add("tran_id", p.tranId);
    add("success_url", p.successUrl);
    add("fail_url", p.failUrl);
    add("cancel_url", p.cancelUrl);
    add("ipn_url", p.ipnUrl);
    add("cus_name", p.customer.name);
    add("cus_email", p.customer.email);
    add("cus_phone", p.customer.phone);
    add("cus_add1", p.customer.address);
    add("cus_city", p.customer.city);
    add("cus_country", "Bangladesh");
    add("cus_postcode", "1200");
    add("product_name", p.productName);
    add("product_category", p.purpose);
    add("product_profile", p.purpose === "STORE_ORDER" ? "physical-goods" : "non-physical-goods");
    add("shipping_method", p.purpose === "STORE_ORDER" ? "Courier" : "NO");
    add("num_of_item", 1);
    add("value_a", p.meta?.a);
    add("value_b", p.meta?.b);
    add("value_c", p.meta?.c);
    try {
      const r = await this.http(`${this.baseUrl}/gwprocess/v4/api.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (r.status !== "SUCCESS" || !r.GatewayPageURL) return { ok: false, error: r.failedreason || "Gateway refused to start a session" };
      return { ok: true, gatewayUrl: r.GatewayPageURL, sessionKey: r.sessionkey };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Could not reach the gateway" };
    }
  }

  async validate(valId: string): Promise<ValidationResult> {
    const q = new URLSearchParams({ val_id: valId, store_id: this.storeId, store_passwd: this.storePasswd, format: "json", v: "1" });
    try {
      const r = await this.http(`${this.baseUrl}/validator/api/validationserverAPI.php?${q}`);
      return {
        valid: r.status === "VALID" || r.status === "VALIDATED",
        status: String(r.status),
        tranId: String(r.tran_id ?? ""),
        amount: Number(r.amount ?? 0),
        currency: String(r.currency ?? ""),
        bankTranId: r.bank_tran_id,
        cardType: r.card_type,
        raw: r,
      };
    } catch (e: any) {
      return { valid: false, status: "ERROR", tranId: "", amount: 0, currency: "", raw: null, error: e?.message || "Validation request failed" };
    }
  }

  async query(tranId: string): Promise<QueryResult> {
    const q = new URLSearchParams({ tran_id: tranId, store_id: this.storeId, store_passwd: this.storePasswd, format: "json" });
    const r = await this.http(`${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php?${q}`); // throws -> caller treats as "unknown"
    const rows: any[] = Array.isArray(r?.element) ? r.element : [];
    if (!rows.length) return { found: false, status: "UNKNOWN", raw: r };
    // If any attempt for this tran_id was paid, that wins.
    const paid = rows.find((x) => x.status === "VALID" || x.status === "VALIDATED");
    if (paid) return { found: true, status: "PAID", valId: paid.val_id, raw: r };
    const s = String(rows[rows.length - 1].status || "").toUpperCase();
    const map: Record<string, RemoteStatus> = { FAILED: "FAILED", CANCELLED: "CANCELLED", EXPIRED: "EXPIRED", PENDING: "PENDING", UNATTEMPTED: "PENDING", INVALID_TRANSACTION: "FAILED" };
    return { found: true, status: map[s] ?? "UNKNOWN", raw: r };
  }

  async refund(p: RefundParams): Promise<RefundResult> {
    const q = new URLSearchParams({
      bank_tran_id: p.bankTranId, refund_amount: p.amount.toFixed(2), refund_remarks: p.remarks, refe_id: p.refundRef,
      store_id: this.storeId, store_passwd: this.storePasswd, format: "json",
    });
    try {
      const r = await this.http(`${this.baseUrl}/validator/api/merchantTransIDvalidationAPI.php?${q}`);
      if (String(r.status).toLowerCase() === "success") return { ok: true, gatewayRefId: r.refund_ref_id };
      return { ok: false, error: r.errorReason || `Refund refused (${r.status})` };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Refund request failed" };
    }
  }

  verifyIpn(fields: Record<string, string>): boolean {
    return verifySslcommerzSignature(fields, this.storePasswd);
  }
}

/**
 * SSLCommerz IPN signature: `verify_key` lists the field names that were signed. Take
 * those fields plus `store_passwd = md5(store password)`, sort by name, join as
 * `k=v&k=v` and md5 it; the result must equal `verify_sign`.
 */
export function verifySslcommerzSignature(fields: Record<string, string>, storePassword: string): boolean {
  const sign = String(fields.verify_sign ?? "");
  const keyList = String(fields.verify_key ?? "");
  if (!sign || !keyList) return false;
  const signed: Record<string, string> = {};
  for (const k of keyList.split(",")) {
    if (!k || k === "store_passwd") continue;
    if (!(k in fields)) return false; // a signed field was stripped or renamed
    signed[k] = String(fields[k]);
  }
  signed.store_passwd = crypto.createHash("md5").update(storePassword).digest("hex");
  const text = Object.keys(signed).sort().map((k) => `${k}=${signed[k]}`).join("&");
  const expected = crypto.createHash("md5").update(text).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sign.toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
