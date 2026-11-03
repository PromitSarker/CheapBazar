import type { EventHandler } from "../../../packages/event-bus";
import { ensureWallet } from "./ledger";
import { enforceWithin } from "./enforcer";
import { recordOnlineSettlement, releaseCodHold, reverseOnlineSettlement, settleCodHold, topUp } from "./wallets";

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
    await enforceWithin(tx, storeId);
  },

  // order-service: COD delivered -> fee hold becomes a confirmed debit
  OrderDelivered: async (env, tx) => {
    const d = env.data;
    if (d.paymentMethod === "COD") await settleCodHold(tx, d.orderNumber);
  },

  // order-service: cancelled / refused -> release COD hold, or refund an online payment
  OrderCancelled: async (env, tx) => releaseOrRefund(env.data, tx, "CANCELLED"),
  OrderRefused: async (env, tx) => releaseOrRefund(env.data, tx, "REFUSED"),

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
  TopUpApproved: async (env, tx) => {
    const d = env.data;
    await topUp(tx, { storeId: d.storeId, amount: d.amount, reference: d.paymentRef, method: d.method, source: "CASH", idempotencyKey: `topup:${d.paymentRef}` });
  },
};

async function releaseOrRefund(d: any, tx: any, why: string) {
  if (d.paymentMethod === "COD") {
    await releaseCodHold(tx, d.orderNumber, why);
  } else if (d.paymentRef) {
    await reverseOnlineSettlement(tx, d.paymentRef, `Order ${d.orderNumber} ${why.toLowerCase()}`);
  }
}
