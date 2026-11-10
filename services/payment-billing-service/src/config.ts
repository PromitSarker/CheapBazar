import { envInt } from "../../../packages/service-kit";

export interface BillingConfig {
  /** SSLCommerz is on hold: while false, POST /payments/charge answers ONLINE_DISABLED. */
  onlinePaymentsEnabled: boolean;
  appUrl: string;            // where the buyer's browser returns (the web app's payment status page)
  publicUrl: string;         // where the gateway can reach THIS service for the IPN (via the gateway/proxy)
  paymentWindowMinutes: number;
  sessionHours: number;      // after this a PENDING payment with no gateway result is EXPIRED
  minTopUp: number;
  maxTopUp: number;
  maxPendingManual: number;  // pending manual payments one store/user may hold at once
}

export function loadConfig(over: Partial<BillingConfig> = {}): BillingConfig {
  return {
    onlinePaymentsEnabled: process.env.ONLINE_PAYMENTS_ENABLED === "true",
    appUrl: (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, ""),
    publicUrl: (process.env.BILLING_PUBLIC_URL || "").replace(/\/$/, ""),
    paymentWindowMinutes: envInt("PAYMENT_WINDOW_MINUTES", 15),
    sessionHours: envInt("PAYMENT_SESSION_HOURS", 1),
    minTopUp: envInt("MIN_TOPUP", 10),
    maxTopUp: envInt("MAX_TOPUP", 500_000),
    maxPendingManual: envInt("MAX_PENDING_MANUAL", 5),
    ...over,
  };
}

/** The only plan. Placeholder price (BDT): the real one is set with POST /admin/plans. */
export const DEFAULT_PLANS = [
  { code: "BUYER_PRO" as const, name: "Buyer Pro (wholesale access, monthly)", price: 499, periodDays: 30, graceDays: 3 },
];
