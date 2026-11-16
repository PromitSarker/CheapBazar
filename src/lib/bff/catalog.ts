/**
 * Category tree + home shelves for the apps. The tree is owned by the catalog-service (admin-managed);
 * product counts come from the aggregator's category facets so the app can hide empty departments.
 * Everything here degrades gracefully: a catalog or search outage must never break the home screen.
 */
import { callService } from "./client";
import { searchViaServices, type BrowseItem } from "./browse";

export interface CategoryNode {
  id: string; parentId: string | null; slug: string; nameEn: string; nameBn: string; icon: string;
  sortOrder: number; active: boolean; children: CategoryNode[];
}
export interface CategoryOut {
  id: string; parentId: string | null; slug: string; nameEn: string; nameBn: string; icon: string; count: number; children: CategoryOut[];
}
export interface CategoryFacet { categoryId: string; parentCategoryId: string | null; count: number }

/** Pure: attach live product counts. A top-level count includes everything beneath it. */
export function withCounts(tree: CategoryNode[], facets: CategoryFacet[]): CategoryOut[] {
  const direct = new Map<string, number>();
  const underParent = new Map<string, number>();
  for (const f of facets) {
    direct.set(f.categoryId, (direct.get(f.categoryId) ?? 0) + f.count);
    if (f.parentCategoryId) underParent.set(f.parentCategoryId, (underParent.get(f.parentCategoryId) ?? 0) + f.count);
  }
  return tree.map((top) => ({
    id: top.id, parentId: top.parentId, slug: top.slug, nameEn: top.nameEn, nameBn: top.nameBn, icon: top.icon,
    count: (direct.get(top.id) ?? 0) + (underParent.get(top.id) ?? 0),
    children: top.children.map((c) => ({
      id: c.id, parentId: c.parentId, slug: c.slug, nameEn: c.nameEn, nameBn: c.nameBn, icon: c.icon,
      count: direct.get(c.id) ?? 0, children: [],
    })),
  }));
}

const TTL_MS = 60_000;
// Counts depend on where the buyer is once the range limit is on, so the cache is per ~1 km square ("" = no position).
const cache = new Map<string, { at: number; value: CategoryOut[] }>();
export function resetCategoryCache() { cache.clear(); }
type Loc = { lat: number; lng: number } | null | undefined;
const locKey = (l: Loc) => (l ? `${l.lat.toFixed(2)},${l.lng.toFixed(2)}` : "");

/** Public category tree with counts. Cached for a minute; serves the last good copy if the services are down. */
export async function categoriesWithCounts(loc?: Loc): Promise<CategoryOut[]> {
  const key = locKey(loc);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const [tree, search] = await Promise.all([
      callService<{ categories: CategoryNode[] }>("catalog", "GET", "/categories", undefined, { timeoutMs: 2500 }),
      searchViaServices("retail", { limit: "1", ...(loc ? { lat: String(loc.lat), lng: String(loc.lng) } : {}) }).catch(() => null),
    ]);
    const value = withCounts(tree.categories, (search?.facets as any)?.categories ?? []);
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 200) cache.delete(cache.keys().next().value as string);
    return value;
  } catch {
    return hit?.value ?? [];
  }
}

export interface Shelf {
  key: string;
  title: { en: string; bn: string };
  categoryId?: string;
  onSale?: boolean;
  items: BrowseItem[];
}

const SHELF_SIZE = "10";

/** Home shelves: deals, new arrivals and the busiest departments. Empty shelves are dropped. */
export async function homeShelves(cats: CategoryOut[], viewerId?: string, loc?: Loc): Promise<Shelf[]> {
  const geo = loc ? { lat: String(loc.lat), lng: String(loc.lng) } : {};
  const busiest = cats.filter((c) => c.count > 0).sort((a, b) => b.count - a.count).slice(0, 3);
  const jobs: Array<Promise<Shelf>> = [
    searchViaServices("retail", { onSale: "true", sort: "discount", limit: SHELF_SIZE, ...geo }, viewerId).then((r) => ({
      key: "deals", title: { en: "Deals & offers", bn: "অফার ও ডিল" }, onSale: true, items: r.items,
    })),
    searchViaServices("retail", { limit: SHELF_SIZE, ...geo }, viewerId).then((r) => ({
      key: "new", title: { en: "New arrivals", bn: "নতুন পণ্য" }, items: r.items,
    })),
    ...busiest.map((c) =>
      searchViaServices("retail", { categoryId: c.id, limit: SHELF_SIZE, ...geo }, viewerId).then((r) => ({
        key: `cat:${c.id}`, title: { en: c.nameEn, bn: c.nameBn || c.nameEn }, categoryId: c.id, items: r.items,
      }))
    ),
  ];
  const settled = await Promise.allSettled(jobs);
  return settled.flatMap((s) => (s.status === "fulfilled" && s.value.items.length > 0 ? [s.value] : []));
}
