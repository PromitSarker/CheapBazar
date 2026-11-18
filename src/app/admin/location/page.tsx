import Link from "next/link";
import { servicesEnabled } from "@/lib/bff/client";
import { allStoresViaServices } from "@/lib/bff/admin";
import { locationPolicy } from "@/lib/bff/location";
import { requireRole } from "@/modules/identity/service";
import { saveRange } from "./actions";

export const dynamic = "force-dynamic";

const PRESETS = [5, 10, 25, 50, 100, 200];

export default async function AdminLocationPage({ searchParams }: { searchParams: { error?: string; done?: string } }) {
  await requireRole("ADMIN");
  if (!servicesEnabled()) {
    return (
      <div>
        <h1>Shop Range</h1>
        <p className="muted">This screen is part of the new platform and is not enabled yet.</p>
      </div>
    );
  }

  const [policy, stores] = await Promise.all([locationPolicy(), allStoresViaServices()]);
  const withPin = stores.filter((s) => s.hasLocation).length;
  const without = stores.filter((s) => !s.hasLocation);
  const isPreset = PRESETS.includes(policy.radiusKm);

  return (
    <div>
      <Link href="/admin" className="muted" style={{ fontSize: "0.85rem", textDecoration: "none" }}>&larr; Admin Overview</Link>
      <h1>Shop Range</h1>
      <p className="muted" style={{ marginBottom: "1.25rem", maxWidth: 680 }}>
        Choose how far a buyer can see shops. When the limit is on, a buyer only sees shops whose pin is within the range of their own location
        (website and app). Buyers must share their location to see anything. When it is off, everyone sees every shop, nearest first when their location is known.
      </p>

      {searchParams.error && <p className="error">{searchParams.error}</p>}
      {searchParams.done && <p style={{ color: "green", marginBottom: "1rem" }}>{searchParams.done}.</p>}

      <form action={saveRange} className="card" style={{ padding: "1.25rem", maxWidth: 520, border: "1px solid #e2e8dc", background: "#fff", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontWeight: 600 }}>
          <input type="checkbox" name="enabled" defaultChecked={policy.enabled} style={{ width: 18, height: 18 }} />
          Only show shops within the range below
        </label>

        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: "0.5rem", padding: 0 }}>Range</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {PRESETS.map((km) => (
              <label key={km} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0.4rem 0.75rem", border: "1px solid #c5d0c0", borderRadius: 8, cursor: "pointer" }}>
                <input type="radio" name="preset" value={String(km)} defaultChecked={policy.radiusKm === km} /> {km} km
              </label>
            ))}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0.4rem 0.75rem", border: "1px solid #c5d0c0", borderRadius: 8 }}>
              <input type="radio" name="preset" value="custom" defaultChecked={!isPreset} /> Custom
              <input name="custom" type="number" min={1} max={500} step="0.5" defaultValue={isPreset ? "" : policy.radiusKm} placeholder="km" style={{ width: 80, padding: "0.25rem 0.4rem", border: "1px solid #c5d0c0", borderRadius: 6 }} />
            </label>
          </div>
          <small className="muted" style={{ display: "block", marginTop: "0.5rem" }}>Straight-line distance, from 1 to 500 km.</small>
        </fieldset>

        <button type="submit" className="button" style={{ alignSelf: "flex-start" }}>Save</button>
        <small className="muted">
          Now: <strong>{policy.enabled ? `ON, ${policy.radiusKm} km` : "OFF"}</strong>
          {policy.updatedAt ? ` · last changed ${new Date(policy.updatedAt).toLocaleString("en-GB")}${policy.updatedBy ? ` by ${policy.updatedBy}` : ""}` : " · never changed"}
        </small>
      </form>

      <h3 style={{ margin: "2rem 0 0.5rem" }}>Shop locations</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        {withPin} of {stores.length} shop{stores.length === 1 ? "" : "s"} {withPin === 1 ? "has" : "have"} a location.
        {policy.enabled && without.length > 0 ? " Shops without one are hidden from buyers while the limit is on." : ""}
      </p>
      {without.length > 0 && (
        <div className="card" style={{ padding: "0.75rem 1rem", border: "1px solid #fde68a", background: "#fffbeb", maxWidth: 520 }}>
          <strong style={{ display: "block", marginBottom: 4 }}>Waiting for a location</strong>
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {without.map((s) => <li key={s.id}>{s.name} <span className="muted">({s.owner.email})</span></li>)}
          </ul>
          <small className="muted" style={{ display: "block", marginTop: 6 }}>Sellers see a banner in their dashboard asking them to add it.</small>
        </div>
      )}
    </div>
  );
}
