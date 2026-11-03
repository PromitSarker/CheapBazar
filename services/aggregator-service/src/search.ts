import type { Entitlements } from "./entitlements";
import type { Runner } from "./db";

/** Stores whose products appear in the aggregator ("Delisted: removed from aggregator"). */
const VISIBLE_STATUSES = `('ACTIVE','WARNING','COD_BLOCKED')`;

export type Tab = "retail" | "wholesale";

export interface SearchParams {
  q?: string;
  storeId?: string;
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
    `s."status" IN ${VISIBLE_STATUSES}`,
    wholesale ? `l."channel" IN ('WHOLESALE','BOTH') AND s."sellerPlanActive" = true` : `l."channel" IN ('RETAIL','BOTH')`,
  ];

  const terms = (p.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  for (const t of terms) {
    const ph = arg(`%${escapeLike(t)}%`);
    where.push(`(l."searchText" LIKE ${ph} ESCAPE '\\' OR lower(s."name") LIKE ${ph} ESCAPE '\\')`);
  }
  if (p.inStock === "true") where.push(`l."stock" > 0`);

  // Price filters/sorts would let a locked viewer infer hidden wholesale prices.
  const priceCol = wholesale ? `l."wholesalePrice"` : `l."price"`;
  const priceControlsAllowed = unlocked;
  const min = priceControlsAllowed ? numOrNull(p.minPrice) : null;
  const max = priceControlsAllowed ? numOrNull(p.maxPrice) : null;
  if (min !== null) where.push(`${priceCol} >= ${arg(min)}`);
  if (max !== null) where.push(`${priceCol} <= ${arg(max)}`);

  const baseWhere = where.join(" AND ");
  const baseArgCount = args.length; // everything after this index is not part of the facet query
  const storeWhere = p.storeId ? ` AND l."storeId" = ${arg(p.storeId)}` : "";

  let order = `l."productCreatedAt" DESC, l."productId"`;
  if (p.sort === "price_asc" && priceControlsAllowed) order = `${priceCol} ASC, l."productId"`;
  else if (p.sort === "price_desc" && priceControlsAllowed) order = `${priceCol} DESC, l."productId"`;
  else if (p.sort === "name") order = `lower(l."name") ASC, l."productId"`;
  else if (terms.length && (p.sort === undefined || p.sort === "relevance")) {
    order = `(CASE WHEN l."name" ILIKE ${arg(`${escapeLike(terms[0])}%`)} ESCAPE '\\' THEN 0 ELSE 1 END), l."productCreatedAt" DESC, l."productId"`;
  }

  const limit = Math.min(Math.max(Number(p.limit) || 24, 1), 48);
  const page = Math.max(Number(p.page) || 1, 1);

  const from = `FROM "ListingIndex" l JOIN "StoreProjection" s ON s."storeId" = l."storeId"`;
  const total = Number(
    (await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*)::bigint AS n ${from} WHERE ${baseWhere}${storeWhere}`, ...args))[0].n
  );
  const rows = await db.$queryRawUnsafe<Row[]>(
    `SELECT l."productId", l."storeId", l."name", l."description", l."image", l."price", l."stock", l."channel", l."moq",
            l."wholesalePrice", l."tiers", s."slug" AS "storeSlug", s."name" AS "storeName"
       ${from} WHERE ${baseWhere}${storeWhere}
       ORDER BY ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    ...args
  );

  // Facets: stores matching everything EXCEPT the store filter itself.
  const facetArgs = args.slice(0, baseArgCount);
  const facets = (
    await db.$queryRawUnsafe<{ storeId: string; slug: string; name: string; n: bigint }[]>(
      `SELECT s."storeId", s."slug", s."name", COUNT(*)::bigint AS n ${from} WHERE ${baseWhere}
        GROUP BY s."storeId", s."slug", s."name" ORDER BY COUNT(*) DESC, s."name" LIMIT 20`,
      ...facetArgs
    )
  ).map((f) => ({ storeId: f.storeId, slug: f.slug, name: f.name, count: Number(f.n) }));

  const items = rows.map((r) => {
    const store = { id: r.storeId, slug: r.storeSlug, name: r.storeName };
    const base = { productId: r.productId, name: r.name, description: r.description, image: r.image, store, inStock: r.stock > 0 };
    if (!wholesale) return { ...base, price: Number(r.price), stock: r.stock, channel: r.channel };
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
    facets: { stores: facets },
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
      WHERE s."slug" <> '' AND s."status" IN ${VISIBLE_STATUSES}${like}
      GROUP BY s."storeId", s."slug", s."name", s."template", s."customDomain"
      ORDER BY n DESC, s."name" LIMIT ${limit}`,
    ...args
  );
  return rows.map((r) => ({ storeId: r.storeId, slug: r.slug, name: r.name, template: r.template, customDomain: r.customDomain, productCount: Number(r.n) }));
}
