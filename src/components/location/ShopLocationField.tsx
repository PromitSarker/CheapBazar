"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { DISTRICTS, districtById, nearestDistrict, parseCoords } from "../../../packages/geo";

const LEAFLET_VERSION = "1.9.4";
const LEAFLET_JS = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.min.js`;
const LEAFLET_CSS = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${LEAFLET_VERSION}/leaflet.min.css`;
const DHAKA = { lat: 23.8103, lng: 90.4125 };

declare global { interface Window { L?: any } }

function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[data-leaflet]`)) {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = LEAFLET_CSS; css.setAttribute("data-leaflet", "1");
      document.head.appendChild(css);
    }
    const existing = document.querySelector<HTMLScriptElement>("script[data-leaflet]");
    const s = existing ?? document.createElement("script");
    s.addEventListener("load", () => (window.L ? resolve(window.L) : reject(new Error("leaflet missing"))));
    s.addEventListener("error", () => reject(new Error("leaflet failed to load")));
    if (!existing) { s.src = LEAFLET_JS; s.async = true; s.setAttribute("data-leaflet", "1"); document.body.appendChild(s); }
  });
}

export interface ShopLocationDefaults { latitude?: number | null; longitude?: number | null; district?: string | null; address?: string | null }

/**
 * The "where is your shop" part of a form: pin on a map (drag it, click it, or use the phone/PC location), a district and a
 * street/area line. Submits `latitude`, `longitude`, `district` and `address` with the form; latitude/longitude are required.
 * If the map cannot load (blocked network) the coordinates stay editable by hand, so the form never gets stuck.
 */
export default function ShopLocationField({ defaults = {} }: { defaults?: ShopLocationDefaults }) {
  const start = parseCoords(defaults.latitude, defaults.longitude);
  // The two text boxes are the source of truth (they are what gets submitted); the pin is whatever they currently describe.
  const [latText, setLatText] = useState(start ? String(start.lat) : "");
  const [lngText, setLngText] = useState(start ? String(start.lng) : "");
  const pin = parseCoords(latText, lngText);
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const [district, setDistrict] = useState<string>(defaults.district && districtById(defaults.district) ? defaults.district : start ? nearestDistrict(start).id : "");
  const [mapState, setMapState] = useState<"loading" | "ready" | "failed">("loading");
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);

  const place = useCallback((lat: number, lng: number, opts: { fly?: boolean; setDistrict?: boolean; moveOnly?: boolean } = {}) => {
    const c = parseCoords(lat, lng);
    if (!c) { setGpsMsg("That point is outside Bangladesh. Move the pin to your shop."); return; }
    setGpsMsg(null);
    if (!opts.moveOnly) { // typed coordinates are left exactly as typed; only the marker follows
      setLatText(String(Math.round(c.lat * 1e5) / 1e5));
      setLngText(String(Math.round(c.lng * 1e5) / 1e5));
      if (opts.setDistrict !== false) setDistrict(nearestDistrict(c).id);
    }
    const L = window.L;
    if (map.current && L) {
      if (!marker.current) {
        marker.current = L.marker([c.lat, c.lng], { draggable: true }).addTo(map.current);
        marker.current.on("dragend", () => { const p = marker.current.getLatLng(); place(p.lat, p.lng); });
      } else marker.current.setLatLng([c.lat, c.lng]);
      if (opts.fly) map.current.setView([c.lat, c.lng], Math.max(map.current.getZoom(), 15));
    }
  }, []);

  useEffect(() => {
    let dead = false;
    loadLeaflet()
      .then((L) => {
        if (dead || !box.current || map.current) return;
        const first = pin ?? DHAKA;
        map.current = L.map(box.current, { scrollWheelZoom: false }).setView([first.lat, first.lng], pin ? 15 : 11);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map.current);
        map.current.on("click", (e: any) => place(e.latlng.lat, e.latlng.lng));
        if (pin) place(pin.lat, pin.lng, { setDistrict: false });
        setMapState("ready");
        setTimeout(() => map.current?.invalidateSize(), 200);
      })
      .catch(() => !dead && setMapState("failed"));
    return () => { dead = true; if (map.current) { map.current.remove(); map.current = null; marker.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function useGps() {
    setGpsMsg(null);
    if (!("geolocation" in navigator)) return setGpsMsg("This browser cannot share your location. Click the map or pick your district.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setBusy(false); place(pos.coords.latitude, pos.coords.longitude, { fly: true }); },
      (err) => { setBusy(false); setGpsMsg(err.code === err.PERMISSION_DENIED ? "Location permission was denied. Click the map or pick your district." : "Could not get your location. Click the map or pick your district."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function pickDistrict(id: string) {
    setDistrict(id);
    const d = districtById(id);
    // Only move the pin to the district centre when the seller has not placed one yet: never undo a precise pin.
    if (d && !pinRef.current) { place(d.lat, d.lng, { fly: true, setDistrict: false }); map.current?.setView([d.lat, d.lng], 12); }
    else if (d && map.current) map.current.setView([d.lat, d.lng], map.current.getZoom());
  }

  const field: React.CSSProperties = { padding: "0.6rem 0.8rem", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, width: "100%", fontSize: "0.95rem" };

  return (
    <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <legend style={{ fontWeight: 600, marginBottom: "0.4rem", padding: 0 }}>Shop location</legend>
      <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
        Buyers see shops by distance, so the pin must be exactly where your shop is. Use your current location while you are at the shop, or drag the pin on the map.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" className="button button-small glow-button" onClick={useGps} disabled={busy}>
          {busy ? "Finding you…" : "Use my current location"}
        </button>
        <select aria-label="District" name="district" value={district} onChange={(e) => pickDistrict(e.target.value)} style={{ ...field, width: "auto", flex: "1 1 180px" }} required>
          <option value="" disabled>District…</option>
          {DISTRICTS.map((d) => <option key={d.id} value={d.id}>{d.en}</option>)}
        </select>
      </div>
      {gpsMsg && <p className="error" style={{ margin: 0, fontSize: "0.88rem" }}>{gpsMsg}</p>}

      <div style={{ position: "relative" }}>
        <div ref={box} aria-label="Map: drag the pin to your shop" style={{ height: 300, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: "#eef2f6" }} />
        {mapState === "loading" && <div className="muted" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>Loading map…</div>}
      </div>
      {mapState === "failed" && (
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>The map could not load. Use &ldquo;Use my current location&rdquo; or type the coordinates below.</p>
      )}
      <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
        {pin ? "Pin placed. Drag it to fine-tune." : latText || lngText ? "Those coordinates are not inside Bangladesh." : "Not placed yet: click the map, drag the pin, or use your current location."}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <label style={{ fontSize: "0.82rem" }}>
          Latitude
          <input name="latitude" required inputMode="decimal" value={latText} placeholder="23.8103" style={field}
            onChange={(e) => { setLatText(e.target.value); const c = parseCoords(e.target.value, lngText); if (c) place(c.lat, c.lng, { fly: true, moveOnly: true }); }} />
        </label>
        <label style={{ fontSize: "0.82rem" }}>
          Longitude
          <input name="longitude" required inputMode="decimal" value={lngText} placeholder="90.4125" style={field}
            onChange={(e) => { setLngText(e.target.value); const c = parseCoords(latText, e.target.value); if (c) place(c.lat, c.lng, { fly: true, moveOnly: true }); }} />
        </label>
      </div>

      <label style={{ fontSize: "0.9rem" }}>
        Street / area (shown to buyers)
        <input name="address" defaultValue={defaults.address ?? ""} maxLength={200} placeholder="House 12, Road 5, Dhanmondi" style={field} />
      </label>
    </fieldset>
  );
}
