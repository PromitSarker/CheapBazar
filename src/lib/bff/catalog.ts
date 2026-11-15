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
let cache: { at: number; value: CategoryOut[] } | null = null;
export function resetCategoryCache() { cache = null; }

/** Public category tree with counts. Cached for a minute; serves the last good copy if the services are down. */
export async function categoriesWithCounts(): Promise<CategoryOut[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const [tree, search] = await Promise.all([
      callService<{ categories: CategoryNode[] }>("catalog", "GET", "/categories", undefined, { timeoutMs: 2500 }),
      searchViaServices("retail", { limit: "1" }).catch(() => null),
    ]);
    const value = withCounts(tree.categories, (search?.facets as any)?.categories ?? []);
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return cache?.value ?? [];
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
export async function homeShelves(cats: CategoryOut[], viewerId?: string): Promise<Shelf[]> {
  const busiest = cats.filter((c) => c.count > 0).sort((a, b) => b.count - a.count).slice(0, 3);
  const jobs: Array<Promise<Shelf>> = [
    searchViaServices("retail", { onSale: "true", sort: "discount", limit: SHELF_SIZE }, viewerId).then((r) => ({
      key: "deals", title: { en: "Deals & offers", bn: "অফার ও ডিল" }, onSale: true, items: r.items,
    })),
    searchViaServices("retail", { limit: SHELF_SIZE }, viewerId).then((r) => ({
      key: "new", title: { en: "New arrivals", bn: "নতুন পণ্য" }, items: r.items,
    })),
    ...busiest.map((c) =>
      searchViaServices("retail", { categoryId: c.id, limit: SHELF_SIZE }, viewerId).then((r) => ({
        key: `cat:${c.id}`, title: { en: c.nameEn, bn: c.nameBn || c.nameEn }, categoryId: c.id, items: r.items,
      }))
    ),
  ];
  const settled = await Promise.allSettled(jobs);
  return settled.flatMap((s) => (s.status === "fulfilled" && s.value.items.length > 0 ? [s.value] : []));
}
