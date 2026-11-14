function n(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}
function flag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw.toLowerCase() === "true" || raw === "1";
}

/** Read lazily so ops (and tests) can flip behaviour without a rebuild. */
export const config = {
  /** SSLCommerz / online payments are ON HOLD: everything is Cash-on-Delivery until this is "true". */
  get onlinePaymentsEnabled() { return flag("ONLINE_PAYMENTS_ENABLED", false); },
  /** Commission on ONLINE-paid orders only (default 0). Cash on Delivery orders never carry a platform fee. */
  get onlineFeePercent() { return n("ONLINE_FEE_PERCENTAGE", 0); },
  get reservationMinutes() { return n("STOCK_RESERVATION_MINUTES", 15); },
  /** Wholesale orders above this total cannot be COD. */
  get wholesaleCodCap() { return n("WHOLESALE_COD_CAP", 50000); },
  /**
   * Until a courier integration is live, sellers confirm delivery/refusal themselves.
   * Set "false" to make DELIVERED/REFUSED courier/admin-only.
   */
  get allowSellerFinalize() { return flag("ALLOW_SELLER_FINALIZE", true); },
  /** A saga stuck in PLACING longer than this is compensated by the recovery job. */
  get placingTimeoutSeconds() { return n("PLACING_TIMEOUT_SECONDS", 120); },
  get sweepIntervalMs() { return n("ORDER_SWEEP_MS", 30_000); },
};
