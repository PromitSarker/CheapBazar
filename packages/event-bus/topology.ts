/**
 * Event topology: which services consume which events. A producer writes ONE
 * outbox row per consumer (fan-out at publish time), so every consumer has its
 * own delivery state, retries and dead-lettering.
 */
export type ServiceName =
  | "identity" | "catalog" | "order" | "payment" | "ledger" | "ad" | "aggregator" | "notification";

export const EVENT_ROUTES: Record<string, ServiceName[]> = {
  // identity-service
  UserRegistered: ["notification"],
  StoreCreated: ["ledger", "aggregator", "notification"],
  StoreDomainUpdated: ["aggregator"],
  StoreUpdated: ["aggregator"],

  // catalog-service
  ProductCreated: ["aggregator"],
  ProductUpdated: ["aggregator"],
  ProductDeleted: ["aggregator"],
  StockReserved: [],
  StockReleased: [],
  StockDepleted: ["notification"],

  // order-service
  OrderCreated: ["notification"],
  OrderPaymentPending: [],
  OrderConfirmed: ["notification"],
  OrderShipped: ["notification"],
  OrderDelivered: ["ledger", "notification"],
  OrderCancelled: ["ledger", "catalog", "notification"],
  OrderRefused: ["ledger", "catalog", "notification"],

  // payment-billing-service
  PaymentCaptured: ["order", "ledger", "notification"],
  PaymentFailed: ["order", "notification"],
  TopUpApproved: ["ledger"],
  ManualPaymentReviewed: ["notification"],
  // Buyer Pro is the ONLY plan (sellers pay nothing); the buyer's fee is the platform's (admin's) revenue
  PlatformRevenueReceived: ["ledger"],
  PlatformRevenueReversed: ["ledger"], // a chargeback took the money back
  SubscriptionActivated: ["notification"],
  SubscriptionEnteredGrace: ["notification"],
  SubscriptionLapsed: ["notification"],

  // ledger-service
  WalletHoldCreated: [],
  WalletHoldSettled: [],
  WalletHoldReleased: [],
  WalletToppedUp: ["notification"],
  StoreStatusChanged: ["ad", "aggregator", "notification"],
  BalanceLow: ["notification"],
  PayoutGenerated: ["notification"],

  // ad-service
  AdBookingRequested: ["notification"],
  AdApproved: ["notification"],
  AdRejected: ["notification"],
  AdExpired: ["notification"],
  AdPushedToCache: [],

  // notification-service (courier integration)
  ShipmentUpdated: ["order"],
};

export function consumersOf(eventType: string): ServiceName[] {
  const c = EVENT_ROUTES[eventType];
  if (!c) throw new Error(`Unknown event type "${eventType}" - add it to packages/event-bus/topology.ts`);
  return c;
}
