/**
 * Merchant-portal data through the services (identity: store, catalog: products,
 * order: orders, ledger: store status). Used only when USE_SERVICES=true.
 * Every call is scoped by the store id of the logged-in seller, and the services
 * re-check that scope themselves.
 */
import { callService, ServiceCallError } from "./client";
import type { TenantResolution, StoreStatus } from "@/modules/identity/types";

const q = encodeURIComponent;

async function statusOf(storeId: string): Promise<StoreStatus> {
  try {
    const w = await callService<{ status?: string }>("ledger", "GET", `/wallets/${storeId}/status`);
    return (w?.status as StoreStatus) || "ACTIVE";
  } catch {
    return "ACTIVE";
  }
}

export async function storeForOwner(ownerId: string): Promise<TenantResolution | null> {
  try {
    const s = await callService<any>("identity", "GET", `/stores/by-owner/${q(ownerId)}`);
    return {
      id: s.id, name: s.name, slug: s.slug, template: s.template,
      status: await statusOf(s.id), customDomain: s.customDomain ?? null, ownerId: s.ownerId,
    };
  } catch (e) {
    if (e instanceof ServiceCallError && e.status === 404) return null;
    throw e;
  }
}

export async function tenantBySlugOrDomain(identifier: string): Promise<TenantResolution | null> {
  try {
    const s = await callService<any>("identity", "GET", `/tenants/resolve?domain=${q(identifier)}`);
    return {
      id: s.id, name: s.name, slug: s.slug, template: s.template,
      status: await statusOf(s.id), customDomain: s.customDomain ?? null, ownerId: s.ownerId,
    };
  } catch (e) {
    if (e instanceof ServiceCallError && e.status === 404) return null;
    throw e;
  }
}

/** "ok" or a short error code the onboarding page already understands. */
export async function createStoreViaServices(ownerId: string, name: string, slug: string, template: string): Promise<"ok" | "slug-taken" | "invalid" | "exists"> {
  try {
    await callService("identity", "POST", "/stores", { ownerId, name, slug, template });
    return "ok";
  } catch (e) {
    if (e instanceof ServiceCallError) {
      if (e.code === "SLUG_TAKEN") return "slug-taken";
      if (e.code === "STORE_EXISTS") return "exists";
      if (e.status === 400 || e.status === 403) return "invalid";
    }
    throw e;
  }
}

// ---------------------------------------------------------------- products

export interface PortalProduct { id: string; name: string; description: string; price: number; stock: number; image: string | null }

export async function listProductsViaServices(storeId: string): Promise<PortalProduct[]> {
  const r = await callService<{ products: any[] }>("catalog", "GET", `/stores/${q(storeId)}/products`);
  return (r.products ?? []).map((p) => ({
    id: p.productId, name: p.name, description: p.description ?? "", price: Number(p.price), stock: p.stock, image: p.image ?? null,
  }));
}

export async function createProductViaServices(
  storeId: string,
  p: { name: string; description: string; price: number; stock: number; image: string | null; channel?: string; moq?: number; wholesalePrice?: number; tiers?: { minQty: number; unitPrice: number }[] }
): Promise<{ ok: boolean }> {
  try {
    await callService("catalog", "POST", `/stores/${q(storeId)}/products`, p);
    return { ok: true };
  } catch (e) {
    if (e instanceof ServiceCallError && e.status === 400) return { ok: false };
    throw e;
  }
}

export async function adjustStockViaServices(storeId: string, productId: string, delta: number): Promise<void> {
  try {
    await callService("catalog", "POST", `/products/${q(productId)}/stock-adjust`, { storeId, delta });
  } catch (e) {
    if (e instanceof ServiceCallError && (e.status === 400 || e.status === 404)) return; // nothing to adjust
    throw e;
  }
}

export async function deleteProductViaServices(storeId: string, productId: string): Promise<"ok" | "in-use" | "missing"> {
  try {
    await callService("catalog", "DELETE", `/products/${q(productId)}?storeId=${q(storeId)}`);
    return "ok";
  } catch (e) {
    if (e instanceof ServiceCallError) {
      if (e.code === "IN_USE") return "in-use";
      if (e.status === 404) return "missing";
    }
    throw e;
  }
}

// ------------------------------------------------------------------ orders

export interface PortalOrder {
  rawId: string; id: string; customer: string; items: string; total: number;
  paymentMethod: string; status: string; date: string;
}

export async function listOrdersViaServices(storeId: string): Promise<PortalOrder[]> {
  const r = await callService<{ orders: any[] }>("order", "GET", `/stores/${q(storeId)}/orders?limit=50`);
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "numeric", hour12: true });
  return (r.orders ?? []).map((o) => ({
    rawId: o.id,
    id: o.orderNumber,
    customer: `${o.buyerName} (${o.buyerPhone})`,
    items: (o.items ?? []).map((i: any) => `${i.quantity}x ${i.productName}`).join(", ") || "No items",
    total: Number(o.totalAmount),
    paymentMethod: o.paymentMethod === "SSLCOMMERZ" ? "SSLCommerz (Online)" : "Cash On Delivery (COD)",
    status: o.status,
    date: fmt.format(new Date(o.createdAt)),
  }));
}

export async function updateOrderStatusViaServices(
  storeId: string, actorId: string, orderId: string, to: string
): Promise<{ status: number; body: any }> {
  try {
    const cur = await callService<any>("order", "GET", `/orders/${q(orderId)}`);
    if (cur.storeId !== storeId) return { status: 404, body: { error: "Order not found" } };
    const next = await callService<any>("order", "PATCH", `/orders/${q(orderId)}/status`, {
      to, source: "SELLER", actor: actorId, storeId,
    });
    return { status: 200, body: { success: true, orderNumber: next.orderNumber, previousStatus: cur.status, newStatus: next.status } };
  } catch (e) {
    if (e instanceof ServiceCallError) {
      if (e.status >= 500) return { status: 503, body: { error: "Could not update the order right now. Please try again." } };
      return { status: e.status, body: { error: e.message } };
    }
    throw e;
  }
}
