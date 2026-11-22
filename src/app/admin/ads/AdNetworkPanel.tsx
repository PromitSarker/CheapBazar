import { adNetworkStatus } from "@/lib/adnetwork";

const NAMES: Record<string, string> = {
  home: "Home page", browse: "Marketplace top", browse_side: "Marketplace sidebar", store: "Storefront", product: "App product page",
};

function Dot({ ok }: { ok: boolean }) {
  return <span aria-hidden style={{ display: "inline-block", width: 8, height: 8, borderRadius: 99, marginRight: 8, background: ok ? "var(--link)" : "var(--border)" }} />;
}

/** Read-only status of the Google ad networks. Credentials live in the server's .env, never in the page. */
export default function AdNetworkPanel() {
  const s = adNetworkStatus();
  return (
    <section className="card" style={{ padding: "1.25rem", marginBottom: "2rem" }} aria-labelledby="adnet-h">
      <h2 id="adnet-h" style={{ marginTop: 0 }}>Google ads</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Seller-booked banners always come first. Where none is live, Google fills the spot. Nothing is shown for a placement that is not set up.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
        <div>
          <strong><Dot ok={s.adsense.enabled} />Website — AdSense</strong>
          <p className="muted small" style={{ margin: "0.35rem 0" }}>
            {s.adsense.enabled ? <>Publisher <code>{s.adsense.client}</code>. <a href="/ads.txt">ads.txt</a> is served.</> : <>Not connected. Set <code>ADSENSE_CLIENT</code> on the server.</>}
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.9rem" }}>
            {s.adsense.placements.map((p) => <li key={p.placement}><Dot ok={p.ready} />{NAMES[p.placement]} <span className="muted small">{p.ready ? "ready" : "no unit id"}</span></li>)}
          </ul>
        </div>
        <div>
          <strong><Dot ok={s.admob.enabled} />App — AdMob</strong>
          <p className="muted small" style={{ margin: "0.35rem 0" }}>
            {s.admob.enabled ? (s.admob.testUnits ? "ON with Google's TEST units (not earning)." : "ON.") : <>Off. Set <code>ADMOB_ENABLED=true</code> and the banner unit ids.</>}
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.9rem" }}>
            {s.admob.placements.map((p) => <li key={p.placement}><Dot ok={p.ready} />{NAMES[p.placement] ?? p.placement} <span className="muted small">{p.ready ? "ready" : "no unit id"}</span></li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
