import type { Entitlements } from "./entitlements";
import type { Runner } from "./db";

/** Stores whose products appear in the aggregator ("Delisted: removed from aggregator"). */
// A store is visible unless an admin suspended or banned it (nothing else hides a store).
const HIDDEN_STATUSES = `('SUSPENDED','BANNED')`;

export type Tab = "retail" | "wholesale";

export interface SearchParams {
  q?: string;
  storeId?: string;
  /** Exactly one listing (product page); still subject to store visibility and the wholesale paywall. */
  productId?: string;
  /** Top-level OR sub-category id (a top-level id also matches everything beneath it). */
  categoryId?: string;
  brand?: string;
  /** "true" = only products that have a crossed-out original price (retail tab only). */
  onSale?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  sort?: string;
  page?: string;
  limit?: string;
  viewerId?: string;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
const numOrNull = (v?: string) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

interface Row {
  productId: string; storeId: string; name: string; description: string; image: string | null;
  price: any; stock: number; channel: string; moq: number; wholesalePrice: any; tiers: any;
  images: any; categoryId: string | null; parentCategoryId: string | null; brand: string | null; unit: string | null; compareAtPrice: any;
  storeSlug: string; storeName: string;
}

export async function search(db: Runner, ent: Entitlements, tab: Tab, p: SearchParams) {
  const wholesale = tab === "wholesale";
  // Paywall: only a verified active Buyer Pro sees wholesale prices. Everyone else gets a preview.
  // Defense in depth: any entitlement failure (not just a clean "no") means LOCKED.
  const unlocked = wholesale ? !!p.viewerId && (await ent.buyerProActive(p.viewerId).catch(() => false)) : true;

  const args: any[] = [];
  const arg = (v: any) => (args.push(v), `$${args.length}`);
  const where: string[] = [
    `l."deleted" = false`,
    `s."slug" <> ''`,
    `s."status" NOT IN ${HIDDEN_STATUSES}`,
    wholesale ? `l."channel" IN ('WHOLESALE','BOTH')` : `l."channel" IN ('RETAIL','BOTH')`,
  ];

  const terms = (p.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  for (const t of terms) {
    const ph = arg(`%${escapeLike(t)}%`);
    where.push(`(l."searchText" LIKE ${ph} ESCAPE '\\' OR lower(s."name") LIKE ${ph} ESCAPE '\\')`);
  }
  if (p.inStock === "true") where.push(`l."stock" > 0`);
  if (p.productId) where.push(`l."productId" = ${arg(String(p.productId).slice(0, 64))}`);
  if (p.onSale === "true" && !wholesale) where.push(`l."compareAtPrice" IS NOT NULL AND l."compareAtPrice" > l."price"`);

  // Price filters/sorts would let a locked viewer infer hidden wholesale prices.
  const priceCol = wholesale ? `l."wholesalePrice"` : `l."price"`;
  const priceControlsAllowed = unlocked;
  const min = priceControlsAllowed ? numOrNull(p.minPrice) : null;
  const max = priceControlsAllowed ? numOrNull(p.maxPrice) : null;
  if (min !== null) where.push(`${priceCol} >= ${arg(min)}`);
  if (max !== null) where.push(`${priceCol} <= ${arg(max)}`);

  const baseWhere = where.join(" AND ");
  const baseArgCount = args.length; // everything after this index is not part of the facet query
  const catArg = p.categoryId ? arg(p.categoryId) : null; // one placeholder, used twice
  const catWhere = catArg ? ` AND (l."categoryId" = ${catArg} OR l."parentCategoryId" = ${catArg})` : "";
  const brandArg = p.brand ? arg(p.brand.toLowerCase().slice(0, 60)) : null;
  const brandWhere = brandArg ? ` AND lower(l."brand") = ${brandArg}` : "";
  const storeWhere = p.storeId ? ` AND l."storeId" = ${arg(p.storeId)}` : "";

  let order = `l."productCreatedAt" DESC, l."productId"`;
  if (p.sort === "price_asc" && priceControlsAllowed) order = `${priceCol} ASC, l."productId"`;
  else if (p.sort === "price_desc" && priceControlsAllowed) order = `${priceCol} DESC, l."productId"`;
  else if (p.sort === "discount" && !wholesale) order = `(CASE WHEN l."compareAtPrice" > l."price" THEN (l."compareAtPrice" - l."price") / l."compareAtPrice" ELSE 0 END) DESC, l."productCreatedAt" DESC, l."productId"`;
  else if (p.sort === "name") order = `lower(l."name") ASC, l."productId"`;
  else if (terms.length && (p.sort === undefined || p.sort === "relevance")) {
    order = `(CASE WHEN l."name" ILIKE ${arg(`${escapeLike(terms[0])}%`)} ESCAPE '\\' THEN 0 ELSE 1 END), l."productCreatedAt" DESC, l."productId"`;
  }

  const limit = Math.min(Math.max(Number(p.limit) || 24, 1), 48);
  const page = Math.max(Number(p.page) || 1, 1);

  const from = `FROM "ListingIndex" l JOIN "StoreProjection" s ON s."storeId" = l."storeId"`;
  const total = Number(
    (await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*)::bigint AS n ${from} WHERE ${baseWhere}${storeWhere}${catWhere}${brandWhere}`, ...args))[0].n
  );
  const rows = await db.$queryRawUnsafe<Row[]>(
    `SELECT l."productId", l."storeId", l."name", l."description", l."image", l."price", l."stock", l."channel", l."moq",
            l."wholesalePrice", l."tiers", l."images", l."categoryId", l."parentCategoryId", l."brand", l."unit", l."compareAtPrice",
            s."slug" AS "storeSlug", s."name" AS "storeName"
       ${from} WHERE ${baseWhere}${storeWhere}${catWhere}${brandWhere}
       ORDER BY ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    ...args
  );

  // Facets. Each one is computed with every filter EXCEPT its own, so the user can see what switching it would give.
  const facetArgs = args.slice(0, baseArgCount);
  const facetWhere = (withStore: boolean, withCat: boolean, withBrand: boolean) => {
    const a = [...facetArgs];
    let sql = baseWhere;
    if (withStore && p.storeId) { a.push(p.storeId); sql += ` AND l."storeId" = $${a.length}`; }
    if (withCat && p.categoryId) { a.push(p.categoryId); sql += ` AND (l."categoryId" = $${a.length} OR l."parentCategoryId" = $${a.length})`; }
    if (withBrand && p.brand) { a.push(p.brand.toLowerCase().slice(0, 60)); sql += ` AND lower(l."brand") = $${a.length}`; }
    return { sql, args: a };
  };
  const sf = facetWhere(false, true, true);
  const stores = (
    await db.$queryRawUnsafe<{ storeId: string; slug: string; name: string; n: bigint }[]>(
      `SELECT s."storeId", s."slug", s."name", COUNT(*)::bigint AS n ${from} WHERE ${sf.sql}
        GROUP BY s."storeId", s."slug", s."name" ORDER BY COUNT(*) DESC, s."name" LIMIT 20`,
      ...sf.args
    )
  ).map((f) => ({ storeId: f.storeId, slug: f.slug, name: f.name, count: Number(f.n) }));

  const cf = facetWhere(true, false, true);
  const categories = (
    await db.$queryRawUnsafe<{ categoryId: string; parentCategoryId: string | null; n: bigint }[]>(
      `SELECT l."categoryId", l."parentCategoryId", COUNT(*)::bigint AS n ${from} WHERE ${cf.sql} AND l."categoryId" IS NOT NULL
        GROUP BY l."categoryId", l."parentCategoryId"`,
      ...cf.args
    )
  ).map((c) => ({ categoryId: c.categoryId, parentCategoryId: c.parentCategoryId, count: Number(c.n) }));

  const bf = facetWhere(true, true, false);
  const brands = (
    await db.$queryRawUnsafe<{ brand: string; n: bigint }[]>(
      `SELECT MIN(l."brand") AS brand, COUNT(*)::bigint AS n ${from} WHERE ${bf.sql} AND l."brand" IS NOT NULL
        GROUP BY lower(l."brand") ORDER BY COUNT(*) DESC, MIN(l."brand") LIMIT 20`,
      ...bf.args
    )
  ).map((b) => ({ brand: b.brand, count: Number(b.n) }));

  const items = rows.map((r) => {
    const store = { id: r.storeId, slug: r.storeSlug, name: r.storeName };
    const images: string[] = Array.isArray(r.images) ? r.images : [];
    const base = {
      productId: r.productId, name: r.name, description: r.description, image: r.image, images, store, inStock: r.stock > 0,
      categoryId: r.categoryId, parentCategoryId: r.parentCategoryId, brand: r.brand, unit: r.unit,
    };
    if (!wholesale) {
      const price = Number(r.price);
      const was = r.compareAtPrice == null ? null : Number(r.compareAtPrice);
      const onSale = was !== null && was > price;
      return {
        ...base, price, stock: r.stock, channel: r.channel,
        compareAtPrice: onSale ? was : null,
        discountPct: onSale ? Math.max(1, Math.round(((was! - price) / was!) * 100)) : 0,
      };
    }
    if (!unlocked) return { ...base, locked: true as const };
    return {
      ...base, locked: false as const,
      wholesalePrice: Number(r.wholesalePrice), moq: r.moq,
      tiers: (r.tiers as Array<{ minQty: number; unitPrice: number }>) ?? [],
    };
  });

  return {
    tab, items, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit,
    paywall: wholesale ? { locked: !unlocked, reason: unlocked ? null : p.viewerId ? "BUYER_PRO_REQUIRED" : "LOGIN_REQUIRED" } : null,
    facets: { stores, categories, brands },
  };
}

/** Public store directory (home page / explore): visible stores with their retail product counts. */
export async function storeDirectory(db: Runner, q: { q?: string; limit?: string }) {
  const args: any[] = [];
  let like = "";
  if (q.q) {
    args.push(`%${escapeLike(q.q.toLowerCase())}%`);
    like = ` AND (lower(s."name") LIKE $1 ESCAPE '\\' OR s."slug" LIKE $1 ESCAPE '\\')`;
  }
  const limit = Math.min(Math.max(Number(q.limit) || 24, 1), 100);
  const rows = await db.$queryRawUnsafe<{ storeId: string; slug: string; name: string; template: string; customDomain: string | null; n: bigint }[]>(
    `SELECT s."storeId", s."slug", s."name", s."template", s."customDomain",
            COUNT(l."productId") FILTER (WHERE l."deleted" = false AND l."channel" IN ('RETAIL','BOTH'))::bigint AS n
       FROM "StoreProjection" s LEFT JOIN "ListingIndex" l ON l."storeId" = s."storeId"
      WHERE s."slug" <> '' AND s."status" NOT IN ${HIDDEN_STATUSES}${like}
      GROUP BY s."storeId", s."slug", s."name", s."template", s."customDomain"
      ORDER BY n DESC, s."name" LIMIT ${limit}`,
    ...args
  );
  return rows.map((r) => ({ storeId: r.storeId, slug: r.slug, name: r.name, template: r.template, customDomain: r.customDomain, productCount: Number(r.n) }));
}

/**
 * Type-ahead for the search box: up to `limit` distinct product names (prefix matches first) from visible
 * retail listings. Names only, never prices, so it cannot leak anything behind the wholesale paywall.
 */
export async function suggest(db: Runner, q: { q?: string; limit?: string }) {
  const term = (q.q ?? "").toLowerCase().trim().slice(0, 60);
  if (term.length < 2) return { suggestions: [] as string[] };
  const limit = Math.min(Math.max(Number(q.limit) || 6, 1), 10);
  const like = `%${escapeLike(term)}%`;
  const prefix = `${escapeLike(term)}%`;
  const rows = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM (
       SELECT DISTINCT ON (lower(l."name")) l."name" AS name,
              (CASE WHEN lower(l."name") LIKE $2 ESCAPE '\\' THEN 0 ELSE 1 END) AS rank
         FROM "ListingIndex" l JOIN "StoreProjection" s ON s."storeId" = l."storeId"
        WHERE l."deleted" = false AND l."name" <> '' AND s."slug" <> '' AND s."status" NOT IN ${HIDDEN_STATUSES}
          AND l."channel" IN ('RETAIL','BOTH') AND l."searchText" LIKE $1 ESCAPE '\\'
        ORDER BY lower(l."name")
     ) t ORDER BY rank, name LIMIT ${limit}`,
    like, prefix
  );
  return { suggestions: rows.map((r) => r.name) };
}
