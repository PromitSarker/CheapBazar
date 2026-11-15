/**
 * Category tree + product editing for the web back-office (seller dashboard and admin), through the
 * catalog-service. Used only when USE_SERVICES=true. Seller calls are scoped by the logged-in store id;
 * admin calls re-check the ADMIN role themselves.
 */
import { callService, ServiceCallError } from "./client";
import { requireRole } from "@/modules/identity/service";
import type { CategoryChoice } from "@/lib/catalogue/import";

const q = encodeURIComponent;

export type Result = { ok: true } | { ok: false; error: string };

/** Customer-readable message from a 4xx; anything else is "try again later". */
function fail(e: unknown): Result {
  if (e instanceof ServiceCallError) {
    if (e.status >= 400 && e.status < 500) return { ok: false, error: e.message };
    return { ok: false, error: "The catalogue service is unavailable right now. Please try again shortly." };
  }
  throw e;
}

// ----------------------------------------------------------------- seller

interface TreeNode { id: string; slug: string; nameEn: string; nameBn: string; children: TreeNode[] }
const choice = (n: TreeNode): CategoryChoice => ({ id: n.id, slug: n.slug, nameEn: n.nameEn, nameBn: n.nameBn, children: (n.children ?? []).map(choice) });

/** Active categories a seller may pick from. Empty (not an error) if the service is down: the form shows a notice. */
export async function categoryChoices(): Promise<CategoryChoice[]> {
  try {
    const r = await callService<{ categories: TreeNode[] }>("catalog", "GET", "/categories", undefined, { timeoutMs: 3000 });
    return r.categories.map(choice);
  } catch {
    return [];
  }
}

export interface SellerProduct {
  id: string; name: string; description: string; price: number; compareAtPrice: number | null; stock: number;
  images: string[]; categoryId: string | null; brand: string; unit: string;
  channel: string; moq: number; wholesalePrice: number | null; tiers: { minQty: number; unitPrice: number }[];
}

/** The seller's own product, or null when it does not exist or belongs to another shop. */
export async function getSellerProduct(storeId: string, id: string): Promise<SellerProduct | null> {
  try {
    const p = await callService<any>("catalog", "GET", `/products/${q(id)}`);
    if (p.storeId !== storeId) return null;
    return {
      id: p.productId, name: p.name, description: p.description ?? "", price: Number(p.price),
      compareAtPrice: p.compareAtPrice == null ? null : Number(p.compareAtPrice), stock: p.stock,
      images: Array.isArray(p.images) ? p.images : p.image ? [p.image] : [],
      categoryId: p.categoryId ?? null, brand: p.brand ?? "", unit: p.unit ?? "",
      channel: p.channel, moq: p.moq, wholesalePrice: p.wholesalePrice == null ? null : Number(p.wholesalePrice), tiers: p.tiers ?? [],
    };
  } catch (e) {
    if (e instanceof ServiceCallError && e.status === 404) return null;
    throw e;
  }
}

export async function updateProductViaServices(storeId: string, id: string, patch: Record<string, unknown>): Promise<Result> {
  try {
    await callService("catalog", "PATCH", `/products/${q(id)}`, { ...patch, storeId });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Names (lower-case) of everything the shop already sells: the import skips duplicates so a double click cannot double-list. */
export async function existingProductNames(storeId: string): Promise<Set<string>> {
  const r = await callService<{ products: { name: string }[] }>("catalog", "GET", `/stores/${q(storeId)}/products`);
  return new Set((r.products ?? []).map((p) => p.name.trim().toLowerCase()));
}

// ------------------------------------------------------------------ admin

export interface AdminCategory {
  id: string; parentId: string | null; slug: string; nameEn: string; nameBn: string; icon: string;
  sortOrder: number; active: boolean; productCount: number; children: AdminCategory[];
}

export async function adminCategoryTree(): Promise<AdminCategory[]> {
  await requireRole("ADMIN");
  const r = await callService<{ categories: AdminCategory[] }>("catalog", "GET", "/admin/categories");
  return r.categories;
}

export async function adminCreateCategory(body: { nameEn: string; nameBn: string; icon?: string; parentId?: string; sortOrder?: number }): Promise<Result> {
  await requireRole("ADMIN");
  try { await callService("catalog", "POST", "/admin/categories", body); return { ok: true }; } catch (e) { return fail(e); }
}

export async function adminUpdateCategory(id: string, body: Record<string, unknown>): Promise<Result> {
  await requireRole("ADMIN");
  try { await callService("catalog", "PATCH", `/admin/categories/${q(id)}`, body); return { ok: true }; } catch (e) { return fail(e); }
}

export async function adminDeleteCategory(id: string): Promise<Result> {
  await requireRole("ADMIN");
  try { await callService("catalog", "DELETE", `/admin/categories/${q(id)}`); return { ok: true }; } catch (e) { return fail(e); }
}

export interface UnfiledProduct { id: string; storeId: string; storeName: string; name: string; price: number; image: string | null }

/** Products nobody has put in a category yet, with their shop's name for context. */
export async function adminUnfiledProducts(): Promise<UnfiledProduct[]> {
  await requireRole("ADMIN");
  const [prods, stores] = await Promise.all([
    callService<{ products: any[] }>("catalog", "GET", "/admin/products?uncategorized=true&limit=200"),
    callService<{ stores: { storeId: string; name: string }[] }>("aggregator", "GET", "/aggregator/stores?limit=100").catch(() => ({ stores: [] })),
  ]);
  const names = new Map(stores.stores.map((s) => [s.storeId, s.name]));
  return prods.products.map((p) => ({
    id: p.productId, storeId: p.storeId, storeName: names.get(p.storeId) ?? p.storeId.slice(0, 8),
    name: p.name, price: Number(p.price), image: p.image ?? null,
  }));
}

export async function adminAssignCategory(productId: string, storeId: string, categoryId: string): Promise<Result> {
  await requireRole("ADMIN");
  try { await callService("catalog", "PATCH", `/products/${q(productId)}`, { storeId, categoryId }); return { ok: true }; } catch (e) { return fail(e); }
}
