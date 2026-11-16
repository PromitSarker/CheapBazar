/**
 * Buyer-side mobile API (v1). Everything the Flutter app needs: auth, home, marketplace,
 * storefronts, COD checkout, my orders, notifications and Buyer Pro.
 * Sellers and admins keep using the website back-office.
 *
 * Money and stock are decided by the services; this tier only authenticates, validates shapes,
 * rate-limits and translates. The session token is the identity-service opaque token.
 */
import { callService } from "@/lib/bff/client";
import { RateLimiter } from "@/lib/security/ratelimit";
import { getStorefrontViaServices } from "@/lib/bff/storefront";
import { productViaServices, suggestViaServices, searchViaServices, storeDirectoryWithLocation, marketplaceAds, buyerProPlan, buyerProStatus, myProPayments, submitProPayment, type Tab } from "@/lib/bff/browse";
import { categoriesWithCounts, homeShelves } from "@/lib/bff/catalog";
import { myOrdersViaServices, cancelMyOrderViaServices } from "@/lib/bff/orders";
import { inboxViaServices, markReadViaServices, unreadCountViaServices } from "@/lib/bff/notifications";
import { sponsoredForStorefront } from "@/lib/bff/ads";
import { locationPolicy, storeVisibility, visibilityMessage } from "@/lib/bff/location";
import { DISTRICTS, parseCoords, type Coords } from "../../../packages/geo";
import { ApiError, MobileRouter, needUser, str, type Ctx } from "./core";

export const router = new MobileRouter();

const loginLimit = new RateLimiter(15, 10 * 60_000);
const registerLimit = new RateLimiter(6, 10 * 60_000);
const orderByIp = new RateLimiter(10, 10 * 60_000);
const orderByPhone = new RateLimiter(5, 10 * 60_000);
const lookupLimit = new RateLimiter(30, 10 * 60_000);
const suggestLimit = new RateLimiter(90, 60_000);

/** The buyer's position from `?lat=&lng=` (null when missing or not a point in Bangladesh). Never stored. */
const locOf = (ctx: Ctx): Coords | null => parseCoords(ctx.query.get("lat"), ctx.query.get("lng"));

/**
 * A shop reached directly (store page, checkout) must be visible to this buyer under the admin's range limit.
 * Only a definite "no" blocks; if the aggregator cannot answer, the page still works (discovery is what the limit controls).
 */
async function assertShopVisible(slug: string, loc: Coords | null) {
  const v = await storeVisibility(slug, loc).catch(() => null);
  if (v && v.found && !v.visible) throw new ApiError(403, visibilityMessage(v), v.reason ?? "OUT_OF_RANGE");
}

const MIN_APP_VERSION = process.env.MOBILE_MIN_APP_VERSION || "1.0.0";
const digits = (s: string) => s.replace(/\D/g, "");

function mapOrder(o: any, canCancelOverride?: boolean) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    storeName: o.storeName,
    storeSlug: o.storeSlug,
    orderType: o.orderType,
    paymentMethod: o.paymentMethod,
    status: o.status,
    totalAmount: Number(o.totalAmount),
    createdAt: o.createdAt,
    trackingNumber: o.trackingNumber ?? null,
    courierName: o.courierName ?? null,
    shippingAddress: o.shippingAddress ?? "",
    shippingCity: o.shippingCity ?? "",
    buyerName: o.buyerName ?? "",
    buyerPhone: o.buyerPhone ?? "",
    items: (o.items ?? []).map((i: any) => ({
      productId: i.productId,
      name: i.productName ?? i.name,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice ?? 0),
      lineTotal: Math.round(Number(i.unitPrice ?? 0) * i.quantity * 100) / 100,
    })),
    canCancel: canCancelOverride ?? (o.status === "CONFIRMED" || o.status === "PENDING_PAYMENT"),
  };
}

// ------------------------------------------------------------------ meta

/** Range limit (admin setting) and the district list the app offers when GPS is off. Public. */
router.get("/location/config", async () => {
  const p = await locationPolicy();
  return {
    enabled: p.enabled,
    radiusKm: p.enabled ? p.radiusKm : null,
    districts: DISTRICTS.map((d) => ({ id: d.id, nameEn: d.en, nameBn: d.bn, lat: d.lat, lng: d.lng })),
  };
});

router.get("/config", () => ({
  appName: "Cheap-Bazar",
  currency: "BDT",
  currencySymbol: "৳",
  paymentMethods: ["COD"],
  onlinePaymentsEnabled: false,
  topupInstructions: process.env.TOPUP_INSTRUCTIONS || "",
  minAppVersion: MIN_APP_VERSION,
}));

// ------------------------------------------------------------------ auth

router.post("/auth/login", async (ctx) => {
  const email = str(ctx.body.email, 200).toLowerCase();
  const password = String(ctx.body.password ?? "");
  if (!email || !password) throw new ApiError(400, "Enter your email and password.", "VALIDATION");
  if (!loginLimit.allow(`${ctx.ip}|${email}`)) throw new ApiError(429, "Too many attempts. Please wait a few minutes.", "RATE_LIMITED");
  const r = await callService<any>("identity", "POST", "/auth/login", { email, password, ip: ctx.ip });
  return { token: r.token, expiresAt: r.expiresAt, user: r.user };
});

router.post("/auth/register", async (ctx) => {
  const email = str(ctx.body.email, 200).toLowerCase();
  const name = str(ctx.body.name, 100);
  const password = String(ctx.body.password ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name || password.length < 8) {
    throw new ApiError(400, "Enter your name, a valid email and a password of at least 8 characters.", "VALIDATION");
  }
  if (!registerLimit.allow(ctx.ip)) throw new ApiError(429, "Too many sign-ups from this network. Please try again later.", "RATE_LIMITED");
  // The app is for buyers; shop owners register on the website.
  const r = await callService<any>("identity", "POST", "/auth/register", { email, name, password, role: "BUYER", ip: ctx.ip });
  return { token: r.token, expiresAt: r.expiresAt, user: r.user };
});

router.post("/auth/logout", async (ctx) => {
  if (ctx.token) {
    try { await callService("identity", "POST", "/auth/logout", { token: ctx.token }); } catch { /* the token is dropped by the app regardless */ }
  }
  return { ok: true };
});

router.get("/me", async (ctx) => {
  const user = await needUser(ctx);
  const [pro, unread] = await Promise.all([buyerProStatus(user.id), unreadCountViaServices(user.id)]);
  return { user, pro, unread };
});

router.post("/me/delete", async (ctx) => {
  const user = await needUser(ctx);
  const password = String(ctx.body.password ?? "");
  if (!password) throw new ApiError(400, "Enter your password to confirm.", "VALIDATION");
  return callService("identity", "POST", `/users/${encodeURIComponent(user.id)}/delete`, { password });
});

// ---------------------------------------------------------- discovery

/** Public category tree (admin-managed) with live product counts. */
router.get("/categories", async (ctx) => ({ categories: await categoriesWithCounts(locOf(ctx)) }));

router.get("/home", async (ctx) => {
  const user = await ctx.user().catch(() => null);
  const loc = locOf(ctx);
  const geo = loc ? { lat: String(loc.lat), lng: String(loc.lng) } : {};
  const cats = categoriesWithCounts(loc);
  const [ads, stores, items, categories, shelves] = await Promise.allSettled([
    marketplaceAds("HOME_HERO"),
    storeDirectoryWithLocation(10, loc),
    searchViaServices("retail", { limit: "12", ...geo }, user?.id),
    cats,
    cats.then((c) => homeShelves(c, user?.id, loc)),
  ]);
  // `items` stays for apps released before categories existed; newer apps read `shelves` + `categories`.
  return {
    ads: ads.status === "fulfilled" ? ads.value : [],
    stores: stores.status === "fulfilled" ? stores.value.stores : [],
    // what the admin's range limit did to this request: the app prompts for a location when `required`
    location: stores.status === "fulfilled" ? stores.value.location : { enabled: false, radiusKm: null, required: false, applied: false },
    items: items.status === "fulfilled" ? items.value.items : [],
    categories: categories.status === "fulfilled" ? categories.value : [],
    shelves: shelves.status === "fulfilled" ? shelves.value : [],
  };
});

router.get("/browse", async (ctx) => {
  const user = await ctx.user().catch(() => null);
  const q = ctx.query;
  const tab: Tab = q.get("tab") === "wholesale" ? "wholesale" : "retail";
  const loc = locOf(ctx);
  const [res, ads] = await Promise.all([
    searchViaServices(
      tab,
      {
        ...(loc ? { lat: String(loc.lat), lng: String(loc.lng) } : {}),
        q: str(q.get("q"), 100) || undefined, storeId: str(q.get("store"), 64) || undefined, sort: str(q.get("sort"), 20) || undefined,
        page: str(q.get("page"), 5) || undefined, limit: str(q.get("limit"), 3) || "20",
        minPrice: str(q.get("min"), 10) || undefined, maxPrice: str(q.get("max"), 10) || undefined, inStock: str(q.get("stock"), 5) || undefined,
        categoryId: str(q.get("category"), 64) || undefined, brand: str(q.get("brand"), 60) || undefined,
        onSale: q.get("sale") === "1" || q.get("sale") === "true" ? "true" : undefined,
      },
      user?.id
    ),
    marketplaceAds("BROWSE_TOP"),
  ]);
  return { ...res, ads };
});

/** Type-ahead: matching product names plus matching categories (so "fruit" offers the Fruits aisle). */
router.get("/search/suggest", async (ctx) => {
  const term = str(ctx.query.get("q"), 60).toLowerCase();
  if (term.length < 2) return { suggestions: [], categories: [] };
  if (!suggestLimit.allow(ctx.ip)) throw new ApiError(429, "Too many searches. Please slow down.", "RATE_LIMITED");
  const loc = locOf(ctx);
  const [names, cats] = await Promise.allSettled([suggestViaServices(term, loc), categoriesWithCounts(loc)]);
  const matches: { id: string; nameEn: string; nameBn: string }[] = [];
  if (cats.status === "fulfilled") {
    for (const top of cats.value) {
      for (const c of [top, ...top.children]) {
        if (c.nameEn.toLowerCase().includes(term) || c.nameBn.toLowerCase().includes(term)) matches.push({ id: c.id, nameEn: c.nameEn, nameBn: c.nameBn });
      }
    }
  }
  return { suggestions: names.status === "fulfilled" ? names.value : [], categories: matches.slice(0, 3) };
});

/** Product page: the listing (fresh price/stock, paywall applied) plus similar products. */
router.get("/products/:id", async (ctx) => {
  const user = await ctx.user().catch(() => null);
  const id = str(ctx.params.id, 64);
  const loc = locOf(ctx);
  const r = await productViaServices(id, user?.id, loc);
  let similar: unknown[] = [];
  if (r.tab === "retail") {
    // same category first; otherwise more from the same shop
    const filter = r.item.categoryId ? { categoryId: r.item.categoryId } : { storeId: r.item.store.id };
    try {
      const s = await searchViaServices("retail", { ...filter, limit: "10", ...(loc ? { lat: String(loc.lat), lng: String(loc.lng) } : {}) }, user?.id);
      similar = s.items.filter((i) => i.productId !== id).slice(0, 8);
    } catch { /* the page works without the extra row */ }
  }
  return { tab: r.tab, item: r.item, paywall: r.paywall, similar };
});

router.get("/stores/:slug", async (ctx) => {
  const r = await getStorefrontViaServices(ctx.params.slug.toLowerCase());
  if (!r) throw new ApiError(404, "Store not found.", "NOT_FOUND");
  await assertShopVisible(r.store.slug, locOf(ctx)); // 403 when the shop is outside the admin's range limit
  const banner = r.store.status === "ACTIVE" ? await sponsoredForStorefront(r.store.id) : null;
  return {
    store: { id: r.store.id, name: r.store.name, slug: r.store.slug, status: r.store.status, acceptsOrders: r.store.status === "ACTIVE" },
    products: r.products,
    banner,
  };
});

// ---------------------------------------------------------- checkout

router.post("/orders", async (ctx: Ctx) => {
  const b = ctx.body;
  const user = await ctx.user().catch(() => null);
  const name = str(b.buyer?.name, 100);
  const phone = str(b.buyer?.phone, 20);
  const address = str(b.shipping?.address, 300);
  const city = str(b.shipping?.city, 80) || "Dhaka";
  const slug = str(b.storeSlug, 80).toLowerCase();
  const orderType = String(b.orderType ?? "RETAIL").toUpperCase() === "WHOLESALE" ? "WHOLESALE" : "RETAIL";
  if (!name || !phone || !address || !slug) throw new ApiError(400, "Please fill in your name, phone and delivery address.", "VALIDATION");
  if (!/^\+?[0-9]{10,15}$/.test(phone.replace(/[\s-]/g, ""))) throw new ApiError(400, "Enter a valid mobile number.", "VALIDATION");
  const rawItems: any[] = Array.isArray(b.items) ? b.items : [];
  if (!rawItems.length || rawItems.length > 50) throw new ApiError(400, "Your bag is empty.", "VALIDATION");
  const items = rawItems.map((i) => ({ productId: str(i?.productId, 64), quantity: Number(i?.quantity) }));
  if (items.some((i) => !i.productId || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 500)) {
    throw new ApiError(400, "Invalid quantity in your bag.", "VALIDATION");
  }
  if (orderType === "WHOLESALE" && !user) throw new ApiError(401, "Log in with a Buyer Pro account to place a wholesale order.", "LOGIN_REQUIRED");
  // The buyer's position rides along with the order (`location: {lat, lng}`); a shop they cannot see cannot be ordered from.
  await assertShopVisible(slug, parseCoords(b.location?.lat, b.location?.lng));
  if (!orderByIp.allow(ctx.ip) || !orderByPhone.allow(digits(phone))) {
    throw new ApiError(429, "Too many orders from this phone or network. Please wait a few minutes.", "RATE_LIMITED");
  }
  const idem = (ctx.req.headers.get("idempotency-key") || "").slice(0, 64) || undefined;
  const order = await callService<any>("order", "POST", "/orders", {
    storeSlug: slug,
    paymentMethod: "COD",
    orderType,
    buyer: { id: user?.id ?? null, name, email: str(b.buyer?.email, 200), phone },
    shipping: { address, city },
    items,
    idempotencyKey: idem,
  }, { timeoutMs: 20_000 });
  return { order: mapOrder(order) };
});

/** Track an order: the owner (logged in) or anyone who knows the order number AND the phone it was placed with. */
router.get("/orders/lookup", async (ctx) => {
  if (!lookupLimit.allow(ctx.ip)) throw new ApiError(429, "Too many lookups. Please wait a few minutes.", "RATE_LIMITED");
  const number = str(ctx.query.get("orderNumber"), 40).toUpperCase();
  const phone = digits(str(ctx.query.get("phone"), 20));
  if (!number) throw new ApiError(400, "Enter an order number.", "VALIDATION");
  const user = await ctx.user().catch(() => null);
  let o: any;
  try {
    o = await callService<any>("order", "GET", `/orders/by-number/${encodeURIComponent(number)}`);
  } catch {
    throw new ApiError(404, "Order not found.", "NOT_FOUND");
  }
  const mine = !!user && o.buyerId === user.id;
  const phoneOk = phone.length >= 10 && digits(String(o.buyerPhone)).endsWith(phone.slice(-10));
  if (!mine && !phoneOk) throw new ApiError(404, "Order not found.", "NOT_FOUND");
  return { order: mapOrder(o, mine ? undefined : false) };
});

router.get("/my/orders", async (ctx) => {
  const user = await needUser(ctx);
  const orders = await myOrdersViaServices(user.id);
  return { orders };
});

router.post("/my/orders/:id/cancel", async (ctx) => {
  const user = await needUser(ctx);
  const r = await cancelMyOrderViaServices(user.id, ctx.params.id);
  if (!r.ok) throw new ApiError(409, r.error || "This order can no longer be cancelled.", "CANNOT_CANCEL");
  return { ok: true };
});

// ----------------------------------------------------- notifications

router.get("/notifications", async (ctx) => {
  const user = await needUser(ctx);
  const lang = ctx.query.get("lang") === "bn" ? "bn" : "en";
  return inboxViaServices(user.id, lang, 50);
});

router.get("/notifications/unread", async (ctx) => {
  const user = await needUser(ctx);
  return { unread: await unreadCountViaServices(user.id) };
});

router.post("/notifications/read", async (ctx) => {
  const user = await needUser(ctx);
  if (ctx.body.all === true) return markReadViaServices(user.id, { all: true });
  const ids = Array.isArray(ctx.body.ids) ? ctx.body.ids.map((x: unknown) => str(x, 64)).filter(Boolean).slice(0, 100) : [];
  if (!ids.length) return { updated: 0 };
  return markReadViaServices(user.id, { ids });
});

// ---------------------------------------------------------- Buyer Pro

router.get("/pro", async (ctx) => {
  const user = await needUser(ctx);
  const [plan, status, payments] = await Promise.all([buyerProPlan().catch(() => null), buyerProStatus(user.id), myProPayments(user.id).catch(() => [])]);
  return {
    plan,
    status,
    instructions: process.env.TOPUP_INSTRUCTIONS || "",
    payments: payments.slice(0, 10).map((p: any) => ({ id: p.id, method: p.method, trxId: p.trxId, amount: Number(p.amount), status: p.status, createdAt: p.createdAt })),
  };
});

router.post("/pro/pay", async (ctx) => {
  const user = await needUser(ctx);
  const method = str(ctx.body.method, 20).toUpperCase();
  const trxId = str(ctx.body.trxId, 64);
  if (!["BKASH", "NAGAD", "ROCKET", "BANK"].includes(method)) throw new ApiError(400, "Choose a payment method.", "VALIDATION");
  if (!/^[A-Za-z0-9-]{4,64}$/.test(trxId)) throw new ApiError(400, "Enter the transaction ID from your payment receipt.", "VALIDATION");
  const r = await submitProPayment(user.id, method, trxId);
  if (!r.ok) throw new ApiError(400, r.error, "PAYMENT");
  return { ok: true, duplicate: r.duplicate };
});
