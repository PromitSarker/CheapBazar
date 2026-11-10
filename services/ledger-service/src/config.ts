function n(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

/** Read lazily so tests / ops can change env without a rebuild. */
export const config = {
  get softThreshold() { return n("WALLET_SOFT_THRESHOLD", 500); },
  get hardThreshold() { return n("WALLET_HARD_THRESHOLD", 100); },
  get grace1Hours() { return n("GRACE_PERIOD_1_HOURS", 72); },
  get grace2Hours() { return n("GRACE_PERIOD_2_HOURS", 168); },
  get minOperatingReserve() { return n("MIN_OPERATING_RESERVE", 500); },
  get minWithdrawal() { return n("MIN_WITHDRAWAL", 500); },
  get withdrawalFee() { return n("WITHDRAWAL_FEE", 0); },
  get enforcerIntervalMs() { return n("ENFORCER_INTERVAL_MS", 60_000); },
};
