import BuyerLocation from "./BuyerLocation";

/** Shown instead of results when the admin's range limit is on and the buyer has not said where they are. */
export default function LocationGate({ radiusKm, shopName }: { radiusKm: number | null; shopName?: string }) {
  return (
    <div style={{ maxWidth: 440, margin: "3rem auto", padding: "0 1rem", textAlign: "center" }}>
      <h2 style={{ marginBottom: 6 }}>{shopName ? `See ${shopName}` : "Shops near you"}</h2>
      <p className="muted" style={{ marginBottom: "1.25rem" }}>
        {radiusKm
          ? `Cheap-Bazar shows shops within ${radiusKm} km of you. Tell us where you are to see what is available.`
          : "Tell us where you are to see what is available."}
      </p>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <BuyerLocation current={null} radiusKm={radiusKm} variant="block" />
      </div>
    </div>
  );
}
