"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { DISTRICTS, districtById, roundCoord } from "../../../packages/geo";

const COOKIE = "cb_loc";

function saveCookie(lat: number, lng: number, label: string) {
  const v = `${roundCoord(lat)}_${roundCoord(lng)}_${label}`;
  document.cookie = `${COOKIE}=${encodeURIComponent(v)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export interface BuyerLocationProps {
  /** Current choice, from the cookie (server-side). */
  current: { lat: number; lng: number; label: string } | null;
  /** Admin's range in km, or null when the range limit is off. */
  radiusKm: number | null;
  /** Start with the chooser open (used on the "set your location" prompt). */
  open?: boolean;
  /** Render as a small header chip (default) or as a full-width block. */
  variant?: "chip" | "block";
}

/**
 * Lets a buyer say where they are: GPS ("use my current location") or, when GPS is off or refused, a district.
 * The choice lives in a cookie rounded to ~110 m; the server reads it on every page, nothing is sent to sellers.
 */
export default function BuyerLocation({ current, radiusKm, open: startOpen = false, variant = "chip" }: BuyerLocationProps) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = !current ? "Set location" : current.label === "gps" ? "Near me" : districtById(current.label)?.en ?? "Near me";

  function choose(lat: number, lng: number, how: string) {
    saveCookie(lat, lng, how);
    setOpen(false);
    setError(null);
    router.refresh();
  }

  function useGps() {
    setError(null);
    if (!("geolocation" in navigator)) return setError("This browser cannot share your location. Choose your district instead.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setBusy(false); choose(pos.coords.latitude, pos.coords.longitude, "gps"); },
      (err) => {
        setBusy(false);
        setError(err.code === err.PERMISSION_DENIED ? "Location permission was denied. Choose your district instead." : "Could not get your location. Choose your district instead.");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60_000 }
    );
  }

  const panel = (
    <div className="card" style={{ padding: "1rem", minWidth: 260, maxWidth: 360, ...(variant === "chip" ? { position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 50, boxShadow: "0 8px 30px rgba(0,0,0,.12)" } : {}) }}>
      <strong style={{ display: "block", marginBottom: 4 }}>Where are you?</strong>
      <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.85rem" }}>
        {radiusKm ? `You will see shops within ${radiusKm} km of you.` : "We show you the shops closest to you first."}
      </p>
      <button type="button" className="button button-small glow-button" onClick={useGps} disabled={busy} style={{ width: "100%" }}>
        {busy ? "Finding you…" : "Use my current location"}
      </button>
      <div className="muted" style={{ textAlign: "center", fontSize: "0.8rem", margin: "0.6rem 0" }}>or choose your district</div>
      <select
        aria-label="District"
        defaultValue=""
        onChange={(e) => { const d = DISTRICTS.find((x) => x.id === e.target.value); if (d) choose(d.lat, d.lng, d.id); }}
        style={{ width: "100%" }}
      >
        <option value="" disabled>Select district…</option>
        {DISTRICTS.map((d) => <option key={d.id} value={d.id}>{d.en}</option>)}
      </select>
      {error && <p className="error" style={{ marginTop: "0.75rem", fontSize: "0.85rem", padding: "0.5rem 0.75rem" }}>{error}</p>}
      <p className="muted" style={{ fontSize: "0.75rem", margin: "0.75rem 0 0" }}>Your location stays in this browser and is never shared with shops.</p>
    </div>
  );

  if (variant === "block") return panel;
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="link-button nav-link"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Your location: ${label}. Change`}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: current ? 500 : 700 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" />
        </svg>
        {label}
      </button>
      {open && panel}
    </div>
  );
}
