/**
 * Public storefront data from the services (identity: store, ledger: status,
 * catalog: products). Same view-model shape the monolith's catalog module returns,
 * so the templates do not change. Used only when USE_SERVICES=true.
 */
import { callService, ServiceCallError } from "./client";

export interface StoreVM {
  id: string;
  name: string;
  slug: string;
  template: string;
  status: string;
  customDomain?: string | null;
}
export interface ProductVM {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  image?: string | null;
}

export async function getStorefrontViaServices(identifier: string): Promise<{ store: StoreVM; products: ProductVM[] } | null> {
  let tenant: any;
  try {
    // "domain" matches a custom domain first, then falls back to the slug.
    tenant = await callService("identity", "GET", `/tenants/resolve?domain=${encodeURIComponent(identifier)}`);
  } catch (e) {
    if (e instanceof ServiceCallError && e.status === 404) return null;
    throw e;
  }

  let status = "ACTIVE";
  try {
    const w = await callService<{ status?: string }>("ledger", "GET", `/wallets/${tenant.id}/status`);
    if (w?.status) status = w.status;
  } catch {
    /* ledger unreachable: show the shop; ordering is still checked by order-service */
  }

  const store: StoreVM = {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    template: tenant.template,
    status,
    customDomain: tenant.customDomain ?? null,
  };

  // Suspended/paused shops do not need a catalog (the page shows a notice instead).
  if (["SUSPENDED", "BANNED", "PAUSED", "DELISTED"].includes(status)) return { store, products: [] };

  const r = await callService<{ products: any[] }>("catalog", "GET", `/stores/${tenant.id}/products?channel=RETAIL`);
  const products: ProductVM[] = (r.products ?? []).map((p) => ({
    id: p.productId,
    name: p.name,
    description: p.description ?? "",
    price: Number(p.price),
    stock: p.stock,
    image: p.image ?? null,
  }));
  return { store, products };
}
