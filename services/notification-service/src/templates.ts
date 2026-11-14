import type { EventEnvelope } from "../../../packages/event-bus";

/**
 * Pure planner: event in -> list of notifications to create. No I/O, so every rule
 * (who is told, what, in which language, how duplicates collapse) is unit-testable.
 *
 * `dedupe` is combined with the recipient to form the unique key, so:
 *   - replays of the same event never double-notify (default: the eventId), and
 *   - alerts that can fire repeatedly (low balance, stock) use a time-bucketed key
 *     and are throttled to one per bucket.
 */

export interface Text { title: string; body: string }
export interface PlannedNotification {
  /** Exactly one of: a user, a store (-> its owner), or all admins. */
  to: { userId?: string | null; storeId?: string | null; admins?: boolean };
  kind: string;
  en: Text;
  bn: Text;
  link?: string;
  email?: boolean;
  dedupe: string;
}
export interface PlannedSms { phone: string; text: string; dedupe: string }
export interface Plan { notifications: PlannedNotification[]; sms: PlannedSms[] }

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const toBn = (v: string | number) => String(v).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
const fmt = (n: number) => Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const taka = (n: number) => `৳${fmt(n)}`;
const takaBn = (n: number) => `৳${toBn(fmt(n))}`;
const HOUR = 3_600_000;

const PAY_EN = (m: string) => (m === "COD" ? "Cash on Delivery" : "online payment");
const PAY_BN = (m: string) => (m === "COD" ? "ক্যাশ অন ডেলিভারি" : "অনলাইন পেমেন্ট");

const STATUS_COPY: Record<string, { en: string; bn: string }> = {
  ACTIVE: { en: "Your store is active again.", bn: "আপনার স্টোর আবার সক্রিয় হয়েছে।" },
  SUSPENDED: { en: "Your store has been suspended for review.", bn: "আপনার স্টোর পর্যালোচনার জন্য স্থগিত করা হয়েছে।" },
  BANNED: { en: "Your store has been permanently banned.", bn: "আপনার স্টোর স্থায়ীভাবে নিষিদ্ধ করা হয়েছে।" },
};

export function plan(env: EventEnvelope): Plan {
  const d = env.data ?? {};
  const out: Plan = { notifications: [], sms: [] };
  const seller = { userId: d.ownerId ?? null, storeId: d.storeId ?? null };
  const add = (n: PlannedNotification) => out.notifications.push(n);
  const eid = env.eventId;
  const buyerLink = d.storeSlug && d.orderNumber ? `/store/${d.storeSlug}/order/${d.orderNumber}` : undefined;

  const buyerSms = (text: string) => {
    if (d.buyerPhone) out.sms.push({ phone: String(d.buyerPhone), text: `Cheap-Bazar: ${text}`, dedupe: `${eid}:sms` });
  };
  const buyerInApp = (kind: string, en: Text, bn: Text) => {
    if (d.buyerId) add({ to: { userId: d.buyerId }, kind, en, bn, link: buyerLink, dedupe: eid });
  };

  switch (env.eventType) {
    case "UserRegistered":
      add({
        to: { userId: d.userId }, kind: "WELCOME", email: true, dedupe: eid,
        en: { title: "Welcome to Cheap-Bazar", body: `Hi ${d.name}, your account is ready.${d.role === "SELLER" ? " Open your store to start selling." : " Start exploring stores."}` },
        bn: { title: "চিপ-বাজারে স্বাগতম", body: `হ্যালো ${d.name}, আপনার অ্যাকাউন্ট প্রস্তুত।${d.role === "SELLER" ? " বিক্রি শুরু করতে আপনার স্টোর খুলুন।" : " স্টোরগুলো ঘুরে দেখুন।"}` },
      });
      break;

    case "StoreCreated":
      add({
        to: seller, kind: "STORE_CREATED", link: "/dashboard", dedupe: eid,
        en: { title: "Your store is live", body: `"${d.name}" is ready at /store/${d.slug}. Add products and top up your wallet to start taking Cash-on-Delivery orders.` },
        bn: { title: "আপনার স্টোর চালু হয়েছে", body: `"${d.name}" এখন /store/${d.slug} ঠিকানায় আছে। পণ্য যোগ করুন এবং ক্যাশ অন ডেলিভারি অর্ডার নিতে ওয়ালেটে টাকা যোগ করুন।` },
      });
      break;

    case "OrderCreated": {
      const wholesale = d.orderType === "WHOLESALE";
      add({
        to: seller, kind: "ORDER_NEW", email: true, link: "/dashboard/orders", dedupe: eid,
        en: { title: `New ${wholesale ? "wholesale " : ""}order ${d.orderNumber}`, body: `${d.buyerName} ordered ${taka(d.total)} (${PAY_EN(d.paymentMethod)}). Platform fee ${taka(d.fee)}.` },
        bn: { title: `নতুন ${wholesale ? "পাইকারি " : ""}অর্ডার ${d.orderNumber}`, body: `${d.buyerName} ${takaBn(d.total)} টাকার অর্ডার করেছেন (${PAY_BN(d.paymentMethod)})। প্ল্যাটফর্ম ফি ${takaBn(d.fee)}।` },
      });
      break;
    }

    case "OrderConfirmed":
      buyerSms(`Your order ${d.orderNumber} is confirmed. Total ${taka(d.total)} (${PAY_EN(d.paymentMethod)}).`);
      buyerInApp("ORDER_CONFIRMED",
        { title: `Order ${d.orderNumber} confirmed`, body: `Total ${taka(d.total)} (${PAY_EN(d.paymentMethod)}).` },
        { title: `অর্ডার ${d.orderNumber} নিশ্চিত হয়েছে`, body: `মোট ${takaBn(d.total)} (${PAY_BN(d.paymentMethod)})।` });
      break;

    case "OrderShipped":
      buyerSms(`Your order ${d.orderNumber} has been shipped${d.paymentMethod === "COD" ? `. Please keep ${taka(d.total)} ready.` : "."}`);
      buyerInApp("ORDER_SHIPPED",
        { title: `Order ${d.orderNumber} shipped`, body: "It is on its way to you." },
        { title: `অর্ডার ${d.orderNumber} পাঠানো হয়েছে`, body: "এটি আপনার কাছে আসছে।" });
      break;

    case "OrderDelivered":
      add({
        to: seller, kind: "ORDER_DELIVERED", link: d.paymentMethod === "COD" ? "/dashboard/orders" : "/dashboard/wallet", dedupe: eid,
        en: { title: `Order ${d.orderNumber} delivered`, body: d.paymentMethod === "COD" ? "The cash was collected on delivery. No platform fee applies." : `Net ${taka(d.net)} was credited to your wallet.` },
        bn: { title: `অর্ডার ${d.orderNumber} ডেলিভারি হয়েছে`, body: d.paymentMethod === "COD" ? "ডেলিভারিতে টাকা সংগ্রহ করা হয়েছে। কোনো প্ল্যাটফর্ম ফি নেই।" : `আপনার ওয়ালেটে নিট ${takaBn(d.net)} জমা হয়েছে।` },
      });
      buyerSms(`Your order ${d.orderNumber} was delivered. Thank you for shopping!`);
      break;

    case "OrderCancelled":
    case "OrderRefused": {
      const refused = env.eventType === "OrderRefused";
      add({
        to: seller, kind: refused ? "ORDER_REFUSED" : "ORDER_CANCELLED", link: "/dashboard/orders", dedupe: eid,
        en: { title: `Order ${d.orderNumber} ${refused ? "refused" : "cancelled"}`, body: `${refused ? "The buyer refused delivery." : "The order was cancelled."} Stock was returned${d.paymentMethod === "COD" ? " and the fee hold released" : ""}.` },
        bn: { title: `অর্ডার ${d.orderNumber} ${refused ? "প্রত্যাখ্যাত" : "বাতিল"}`, body: `${refused ? "ক্রেতা ডেলিভারি নেননি।" : "অর্ডারটি বাতিল হয়েছে।"} স্টক ফেরত এসেছে${d.paymentMethod === "COD" ? " এবং ফি হোল্ড মুক্ত হয়েছে" : ""}।` },
      });
      if (!refused) buyerSms(`Your order ${d.orderNumber} was cancelled.`);
      break;
    }

    case "PaymentFailed":
      if (d.buyerPhone) buyerSms(`Payment for order ${d.orderNumber} failed. Please try again or choose Cash on Delivery.`);
      break;

    case "StockDepleted": {
      const day = new Date(env.timestamp).toISOString().slice(0, 10);
      add({
        to: seller, kind: "STOCK_OUT", link: "/dashboard/products", dedupe: `stock:${d.productId}:${day}`,
        en: { title: `"${d.name}" is out of stock`, body: "Restock it to keep selling." },
        bn: { title: `"${d.name}" স্টকে নেই`, body: "বিক্রি চালিয়ে যেতে স্টক যোগ করুন।" },
      });
      break;
    }

    case "WalletToppedUp":
      add({
        to: seller, kind: "WALLET_TOPUP", link: "/dashboard/wallet", dedupe: eid,
        en: { title: "Wallet topped up", body: `${taka(d.amount)} was added to your wallet (ref ${d.reference}).` },
        bn: { title: "ওয়ালেটে টাকা যোগ হয়েছে", body: `আপনার ওয়ালেটে ${takaBn(d.amount)} যোগ হয়েছে (রেফ ${d.reference})।` },
      });
      break;

    case "StoreStatusChanged": {
      // Admin actions only (suspend / ban / reinstate); nothing changes a status automatically.
      const copy = STATUS_COPY[d.to];
      if (!copy) break;
      add({
        to: seller, kind: `STORE_${d.to}`, email: true, link: "/dashboard/wallet", dedupe: eid,
        en: { title: `Store status: ${String(d.to).replace("_", " ")}`, body: `${copy.en}${d.reason ? ` Reason: ${d.reason}` : ""}` },
        bn: { title: `স্টোরের অবস্থা: ${d.to}`, body: `${copy.bn}${d.reason ? ` কারণ: ${d.reason}` : ""}` },
      });
      break;
    }

    case "PayoutGenerated": {
      const ok = d.status === "COMPLETED";
      add({
        to: seller, kind: ok ? "PAYOUT_PAID" : "PAYOUT_REJECTED", email: true, link: "/dashboard/wallet", dedupe: eid,
        en: { title: ok ? `Withdrawal ${d.withdrawalNumber} paid` : `Withdrawal ${d.withdrawalNumber} rejected`, body: ok ? `${taka(d.amount)} was sent to your payout account.` : `${taka(d.amount)} was returned to your wallet.${d.reason ? ` Reason: ${d.reason}` : ""}` },
        bn: { title: ok ? `উত্তোলন ${d.withdrawalNumber} পরিশোধিত` : `উত্তোলন ${d.withdrawalNumber} প্রত্যাখ্যাত`, body: ok ? `${takaBn(d.amount)} আপনার পেআউট অ্যাকাউন্টে পাঠানো হয়েছে।` : `${takaBn(d.amount)} আপনার ওয়ালেটে ফেরত দেওয়া হয়েছে।${d.reason ? ` কারণ: ${d.reason}` : ""}` },
      });
      break;
    }

    // ---- events produced by services that are not built yet; contracts documented in the tracker
    case "ManualPaymentReviewed": {
      const ok = d.status === "APPROVED";
      add({
        to: { userId: d.userId, storeId: d.storeId }, kind: ok ? "PAYMENT_APPROVED" : "PAYMENT_REJECTED", email: true, dedupe: eid,
        link: d.purpose === "WALLET_TOPUP" ? "/dashboard/wallet" : "/pro",
        en: { title: ok ? "Payment approved" : "Payment rejected", body: `Your ${d.purpose === "WALLET_TOPUP" ? "wallet top-up" : "Pro plan payment"} of ${taka(d.amount)} was ${ok ? "approved" : "rejected"}.${d.note ? ` Note: ${d.note}` : ""}` },
        bn: { title: ok ? "পেমেন্ট অনুমোদিত" : "পেমেন্ট প্রত্যাখ্যাত", body: `আপনার ${d.purpose === "WALLET_TOPUP" ? "ওয়ালেট টপ-আপ" : "প্রো প্ল্যান পেমেন্ট"} ${takaBn(d.amount)} ${ok ? "অনুমোদিত" : "প্রত্যাখ্যাত"} হয়েছে।${d.note ? ` মন্তব্য: ${d.note}` : ""}` },
      });
      break;
    }

    case "SubscriptionActivated":
    case "SubscriptionEnteredGrace":
    case "SubscriptionLapsed": {
      const planName = "Buyer Pro"; // the only plan: wholesale buyers pay a monthly fee, sellers pay nothing
      const kind = env.eventType === "SubscriptionActivated" ? "ACTIVE" : env.eventType === "SubscriptionLapsed" ? "LAPSED" : "GRACE";
      const copy = {
        ACTIVE: { en: `${planName} is active.`, bn: `${planName} সক্রিয় হয়েছে।` },
        GRACE: { en: `${planName} has expired. Pay again within the grace period to keep wholesale access.`, bn: `${planName} এর মেয়াদ শেষ হয়েছে। হোলসেল সুবিধা রাখতে গ্রেস সময়ের মধ্যে আবার পেমেন্ট করুন।` },
        LAPSED: { en: `${planName} has lapsed and wholesale prices are now locked.`, bn: `${planName} মেয়াদোত্তীর্ণ হয়েছে এবং এর সুবিধাগুলো বন্ধ হয়েছে।` },
      }[kind];
      add({
        to: { userId: d.userId, storeId: d.storeId }, kind: `SUBSCRIPTION_${kind}`, email: kind !== "ACTIVE", dedupe: eid,
        link: "/pro",
        en: { title: `${planName}: ${kind.toLowerCase()}`, body: copy.en },
        bn: { title: `${planName}: ${kind === "ACTIVE" ? "সক্রিয়" : kind === "GRACE" ? "গ্রেস পিরিয়ড" : "মেয়াদোত্তীর্ণ"}`, body: copy.bn },
      });
      break;
    }

    case "AdBookingRequested":
      add({
        to: { admins: true }, kind: "AD_REVIEW_NEEDED", link: "/admin/ads", dedupe: eid,
        en: { title: "Ad awaiting review", body: `${d.bookingNumber}: "${d.headline}" (${d.slot ?? "slot"}).` },
        bn: { title: "বিজ্ঞাপন পর্যালোচনার অপেক্ষায়", body: `${d.bookingNumber}: "${d.headline}"।` },
      });
      break;

    case "AdApproved":
    case "AdRejected": {
      const ok = env.eventType === "AdApproved";
      add({
        to: seller, kind: ok ? "AD_APPROVED" : "AD_REJECTED", email: true, link: "/dashboard/ads", dedupe: eid,
        en: { title: ok ? "Your ad was approved" : "Your ad was rejected", body: `${d.bookingNumber}: "${d.headline}".${d.note ? ` ${d.note}` : ""}` },
        bn: { title: ok ? "আপনার বিজ্ঞাপন অনুমোদিত হয়েছে" : "আপনার বিজ্ঞাপন প্রত্যাখ্যাত হয়েছে", body: `${d.bookingNumber}: "${d.headline}"।${d.note ? ` ${d.note}` : ""}` },
      });
      break;
    }

    case "AdExpired":
      add({
        to: seller, kind: "AD_EXPIRED", link: "/dashboard/ads", dedupe: eid,
        en: { title: "Your ad campaign ended", body: `${d.bookingNumber}: "${d.headline}" has finished.` },
        bn: { title: "আপনার বিজ্ঞাপন ক্যাম্পেইন শেষ হয়েছে", body: `${d.bookingNumber}: "${d.headline}" শেষ হয়েছে।` },
      });
      break;
  }
  return out;
}

/** Events this service reacts to (used to register handlers). */
export const NOTIFIABLE_EVENTS = [
  "UserRegistered", "StoreCreated", "OrderCreated", "OrderConfirmed", "OrderShipped", "OrderDelivered", "OrderCancelled",
  "OrderRefused", "PaymentFailed", "StockDepleted", "WalletToppedUp", "StoreStatusChanged", "PayoutGenerated",
  "ManualPaymentReviewed", "SubscriptionActivated", "SubscriptionEnteredGrace", "SubscriptionLapsed",
  "AdBookingRequested", "AdApproved", "AdRejected", "AdExpired",
] as const;
