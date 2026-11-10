import React from "react";

/** A real, paid banner from ad-service. Plain <a> so it works inside both storefront templates. */
export default function SponsoredBanner({
  ad, label, accent,
}: { ad: { headline: string; imageUrl: string; targetUrl: string }; label: string; accent: string }) {
  return (
    <a
      className="sponsored-banner"
      href={ad.targetUrl}
      rel="sponsored noopener"
      style={{
        marginTop: "1.25rem", padding: "0.5rem 1rem", borderRadius: 8, border: `1px solid ${accent}55`,
        display: "flex", alignItems: "center", gap: "0.9rem", textDecoration: "none", color: "inherit", fontSize: "0.9rem",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ad.imageUrl} alt="" width={56} height={56} style={{ objectFit: "cover", borderRadius: 6 }} />
      <strong style={{ flex: 1 }}>{ad.headline}</strong>
      <span style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: accent, fontWeight: 600 }}>{label}</span>
    </a>
  );
}
