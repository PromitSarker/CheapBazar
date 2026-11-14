import type { EventHandler } from "../../../packages/event-bus";
import { ensureWallet } from "./ledger";
import { recordOnlineSettlement, recordPlatformRevenue, reversePlatformRevenue, reverseOnlineSettlement, topUp } from "./wallets";

/**
 * Events consumed by ledger-service. Handlers run in the same transaction as the
 * ProcessedEvent dedupe marker, and every ledger write below is also keyed by a
 * deterministic idempotencyKey, so replays are harmless.
 */
export const handlers: Record<string, EventHandler> = {
  // identity-service created a store -> open its wallet
  StoreCreated: async (env, tx) => {
    const { storeId, ownerId } = env.data;
    await ensureWallet(tx, storeId, ownerId);
  },

  // order-service: cancelled / refused -> refund an online payment. COD orders move no money here
  // (there is no platform fee on COD).
  OrderCancelled: async (env, tx) => refundOnline(env.data, tx, "CANCELLED"),
  OrderRefused: async (env, tx) => refundOnline(env.data, tx, "REFUSED"),

  // payment-billing-service
  PaymentCaptured: async (env, tx) => {
    const d = env.data;
    if (d.purpose === "STORE_ORDER") {
      await recordOnlineSettlement(tx, {
        storeId: d.storeId, orderNumber: d.orderNumber, tranId: d.tranId, total: d.total, fee: d.fee, net: d.net, method: d.method,
      });
    } else if (d.purpose === "WALLET_TOPUP") {
      await topUp(tx, { storeId: d.storeId, amount: d.total, reference: d.tranId, method: d.method, source: "GATEWAY", idempotencyKey: `topup:${d.tranId}` });
    }
  },
  // Buyer Pro fee received (gateway-captured or admin-approved manual payment): the platform's own revenue
  PlatformRevenueReceived: async (env, tx) => {
    const d = env.data;
    await recordPlatformRevenue(tx, { source: String(d.source), amount: Number(d.amount), reference: String(d.reference), method: d.method === "GATEWAY" ? "GATEWAY" : "MANUAL" });
  },
  PlatformRevenueReversed: async (env, tx) => {
    await reversePlatformRevenue(tx, String(env.data.reference), String(env.data.reason ?? "chargeback"));
  },
  TopUpApproved: async (env, tx) => {
    const d = env.data;
    await topUp(tx, { storeId: d.storeId, amount: d.amount, reference: d.paymentRef, method: d.method, source: "CASH", idempotencyKey: `topup:${d.paymentRef}` });
  },
};

async function refundOnline(d: any, tx: any, why: string) {
  if (d.paymentMethod !== "COD" && d.paymentRef) {
    await reverseOnlineSettlement(tx, d.paymentRef, `Order ${d.orderNumber} ${why.toLowerCase()}`);
  }
}
