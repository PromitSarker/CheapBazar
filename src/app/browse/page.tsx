import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { servicesEnabled } from "@/lib/bff/client";
import { searchViaServices, marketplaceAds, type BrowseItem, type Tab } from "@/lib/bff/browse";
import AdSlot from "@/components/ads/AdSlot";
import WholesaleOrder from "@/components/browse/WholesaleOrder";
import LocationGate from "@/components/location/LocationGate";
import { getBuyerLocation, locQuery } from "@/lib/location";
import { districtById } from "../../../packages/geo";

export const dynamic = "force-dynamic";

const taka = (n: number) => `৳${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function BrowsePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  if (!servicesEnabled()) notFound(); // the marketplace is part of the new platform
  const tab: Tab = searchParams.tab === "wholesale" ? "wholesale" : "retail";
  const user = await getCurrentUser();
  const loc = getBuyerLocation();
  const [res, top, side] = await Promise.all([
    searchViaServices(tab, { q: searchParams.q, storeId: searchParams.store, sort: searchParams.sort, page: searchParams.page, minPrice: searchParams.min, maxPrice: searchParams.max, inStock: searchParams.stock, ...locQuery(loc) }, user?.id),
    marketplaceAds("BROWSE_TOP"),
    marketplaceAds("BROWSE_SIDEBAR"),
  ]);

  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { tab, q: searchParams.q, store: searchParams.store, sort: searchParams.sort, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/browse?${p.toString()}`;
  };
  const locked = res.paywall?.locked;
  // The admin's range limit is on and this buyer has not said where they are: ask instead of showing an empty marketplace.
  if (res.location?.required) return <LocationGate radiusKm={res.location.radiusKm} />;
  const nearLabel = loc ? (loc.label === "gps" ? "you" : districtById(loc.label)?.en ?? "you") : null;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <h1 style={{ fontSize: "2rem" }}>Marketplace</h1>
      <p className="muted">
        Shop across every store. Wholesale prices are for Buyer Pro members.
        {res.location?.applied && res.location.radiusKm ? ` Showing shops within ${res.location.radiusKm} km of ${nearLabel}.` : ""}
      </p>

      <nav style={{ display: "flex", gap: "0.5rem", margin: "1rem 0" }} aria-label="Marketplace tabs">
        <Link href={href({ tab: "retail", store: undefined, page: undefined })} className={`button button-small ${tab === "retail" ? "glow-button" : "button-outline"}`}>Retail</Link>
        <Link href={href({ tab: "wholesale", store: undefined, page: undefined })} className={`button button-small ${tab === "wholesale" ? "glow-button" : "button-outline"}`}>Wholesale (Pro)</Link>
      </nav>

      <AdSlot sold={top} placement="browse" max={1} accent="var(--link)" />

      <form method="get" action="/browse" className="toolbar">
        <input type="hidden" name="tab" value={tab} />
        <input name="q" defaultValue={searchParams.q} placeholder="Search products or stores" />
        {!locked && (
          <select name="sort" defaultValue={searchParams.sort || "relevance"}>
            <option value="relevance">Newest / relevance</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="name">Name</option>
          </select>
        )}
        <button type="submit" className="button button-small glow-button">Search</button>
      </form>

      {locked && (
        <div className="card" role="note" style={{ padding: "1.25rem", marginBottom: "1.25rem", background: "var(--surface-muted)", borderColor: "var(--border-hover)" }}>
          <h3 style={{ margin: "0 0 0.4rem 0" }}>Wholesale prices are for Buyer Pro members</h3>
          <p className="muted" style={{ margin: "0 0 0.8rem 0" }}>
            {res.paywall?.reason === "LOGIN_REQUIRED" ? "Log in, then upgrade to see wholesale prices, minimum quantities and volume discounts." : "Upgrade to Buyer Pro to see wholesale prices, minimum quantities and volume discounts."}
          </p>
          {res.paywall?.reason === "LOGIN_REQUIRED"
            ? <Link href="/login" className="button button-small glow-button">Log in</Link>
            : <Link href="/pro" className="button button-small glow-button">Upgrade to Buyer Pro</Link>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 240px", gap: "1.25rem" }} className="browse-grid">
        <div>
          <p className="muted" style={{ marginBottom: "0.75rem" }}>{res.total} product{res.total === 1 ? "" : "s"}{searchParams.q ? ` for “${searchParams.q}”` : ""}</p>
          {res.items.length === 0 && <p className="muted">Nothing found. Try a different search.</p>}
          <div className="card-grid">
            {res.items.map((it: BrowseItem) => (
              <article key={it.productId} className="card" style={{ padding: "1rem" }}>
                {it.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.image} alt="" style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 6, marginBottom: 8 }} />}
                <strong>{it.name}</strong>
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  by <Link href={`/store/${it.store.slug}`}>{it.store.name}</Link>
                  {it.store.distanceKm != null ? ` · ${it.store.distanceKm} km away` : it.store.district ? ` · ${districtById(it.store.district)?.en ?? ""}` : ""}
                </div>
                {tab === "retail" ? (
                  <>
                    <div style={{ margin: "0.4rem 0", fontWeight: 700, color: "var(--text-primary)" }}>{taka(it.price ?? 0)}</div>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>{it.inStock ? `${it.stock} in stock` : "Out of stock"}</div>
                    <Link href={`/store/${it.store.slug}`} className="button button-small button-outline" style={{ marginTop: 8 }}>Open store</Link>
                  </>
                ) : it.locked ? (
                  <div className="muted" style={{ margin: "0.5rem 0", fontSize: "0.9rem" }}>Price and minimum order are hidden. Buyer Pro unlocks them.</div>
                ) : (
                  <>
                    <div style={{ margin: "0.4rem 0", fontWeight: 700, color: "var(--text-primary)" }}>{taka(it.wholesalePrice ?? 0)} <small className="muted">each</small></div>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>Minimum order: {it.moq} · {it.inStock ? "In stock" : "Out of stock"}</div>
                    {it.tiers && it.tiers.length > 0 && (
                      <ul style={{ margin: "0.4rem 0", paddingLeft: "1rem", fontSize: "0.8rem" }}>
                        {it.tiers.map((t) => <li key={t.minQty}>{t.minQty}+ units: {taka(t.unitPrice)}</li>)}
                      </ul>
                    )}
                    {user ? <WholesaleOrder storeSlug={it.store.slug} productId={it.productId} moq={it.moq ?? 1} productName={it.name} /> : <Link href="/login" className="button button-small button-outline">Log in to order</Link>}
                  </>
                )}
              </article>
            ))}
          </div>

          {res.pages > 1 && (
            <nav style={{ display: "flex", gap: "0.5rem", margin: "1.25rem 0", alignItems: "center" }} aria-label="Pages">
              {res.page > 1 && <Link href={href({ page: String(res.page - 1) })} className="button button-small button-outline">← Previous</Link>}
              <span className="muted">Page {res.page} of {res.pages}</span>
              {res.page < res.pages && <Link href={href({ page: String(res.page + 1) })} className="button button-small button-outline">Next →</Link>}
            </nav>
          )}
        </div>

        <aside>
          {res.facets.stores.length > 0 && (
            <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
              <strong>Stores</strong>
              <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0 0", fontSize: "0.9rem" }}>
                {searchParams.store && <li><Link href={href({ store: undefined, page: undefined })}>All stores</Link></li>}
                {res.facets.stores.map((s) => (
                  <li key={s.storeId}><Link href={href({ store: s.storeId, page: undefined })}>{s.name}</Link> <span className="muted">({s.count})</span></li>
                ))}
              </ul>
            </div>
          )}
          <AdSlot sold={side} placement="browse_side" max={2} accent="var(--link)" />
        </aside>
      </div>
    </div>
  );
}
