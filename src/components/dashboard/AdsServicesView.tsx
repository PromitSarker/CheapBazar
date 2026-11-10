"use client";

import React from "react";
import { useLanguage } from "@/modules/i18n/LanguageContext";
import type { AdBooking, AdSlot } from "@/lib/bff/ads";

const STATUS_BN: Record<string, string> = {
  PENDING_REVIEW: "পর্যালোচনাধীন", APPROVED: "অনুমোদিত", ACTIVE: "সক্রিয়", REJECTED: "প্রত্যাখ্যাত",
  CANCELLED: "বাতিল", EXPIRED: "মেয়াদোত্তীর্ণ", SUSPENDED: "স্থগিত",
};

export default function AdsServicesView({
  slots, bookings, storeSlug, minDate, defaultEnd, error, booked, cancelled, bookAction, cancelAction,
}: {
  slots: AdSlot[]; bookings: AdBooking[]; storeSlug: string; minDate: string; defaultEnd: string;
  error?: string; booked?: string; cancelled?: boolean;
  bookAction: (f: FormData) => Promise<void>; cancelAction: (f: FormData) => Promise<void>;
}) {
  const { t, formatMoney, language } = useLanguage();
  const bn = language === "bn";
  const input = { padding: "0.6rem", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "white" } as const;

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1>{t.adManagerTitle}</h1>
        <p className="muted">{t.adManagerSub}</p>
      </div>

      {error && <p className="error">{error}</p>}
      {booked && <p className="success" style={{ color: "#4ade80" }}>{bn ? `বিজ্ঞাপন ${booked} জমা হয়েছে। অ্যাডমিন অনুমোদনের পর ওয়ালেট থেকে চার্জ কাটা হবে।` : `Ad ${booked} submitted. Your wallet is charged when an admin approves it.`}</p>}
      {cancelled && <p className="success" style={{ color: "#4ade80" }}>{bn ? "অনুরোধ বাতিল হয়েছে।" : "Request cancelled."}</p>}

      <h2>{t.availableAdInventory}</h2>
      <div className="card-grid" style={{ marginBottom: "2rem" }}>
        {slots.map((s) => (
          <div key={s.code} className="card" style={{ padding: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <strong>{s.name}</strong>
              <span style={{ color: "#38bdf8", fontWeight: 700 }}>{formatMoney(s.pricePerDay)} / {bn ? "দিন" : "day"}</span>
            </div>
            <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
              📍 {s.placement === "STOREFRONT" ? (bn ? "স্টোরফ্রন্ট" : "Storefronts") : (bn ? "মার্কেটপ্লেস" : "Marketplace")} · {bn ? "ধারণক্ষমতা" : "capacity"} {s.capacity}
            </p>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
        <h3 style={{ margin: "0 0 1rem 0" }}>{t.bookNewCampaign}</h3>
        <form action={bookAction} className="stack" style={{ maxWidth: 600 }}>
          <label>
            {bn ? "বিজ্ঞাপন স্লট" : "Ad slot"}
            <select name="slot" defaultValue={slots[0]?.code} style={input}>
              {slots.map((s) => <option key={s.code} value={s.code}>{s.name} ({formatMoney(s.pricePerDay)}/{bn ? "দিন" : "day"})</option>)}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <label>{bn ? "শুরুর তারিখ" : "Start date"}<input type="date" name="startDate" min={minDate} defaultValue={minDate} required /></label>
            <label>{bn ? "শেষ তারিখ" : "End date"}<input type="date" name="endDate" min={minDate} defaultValue={defaultEnd} required /></label>
          </div>
          <label>
            {bn ? "শিরোনাম (৩–৮০ অক্ষর)" : "Headline (3–80 characters)"}
            <input name="headline" required minLength={3} maxLength={80} placeholder={bn ? "যেমন: সব পণ্যে ২০% ছাড়" : "e.g., Weekend Special: 20% off"} />
          </label>
          <label>
            {bn ? "ব্যানার ছবি (PNG, JPEG, GIF বা WebP, ৫ MB এর কম)" : "Banner image (PNG, JPEG, GIF or WebP, under 5 MB)"}
            <input type="file" name="image" accept="image/png,image/jpeg,image/gif,image/webp" required />
          </label>
          <label>
            {bn ? "গন্তব্য লিংক" : "Destination link"}
            <input name="targetUrl" defaultValue={`/store/${storeSlug}`} />
          </label>
          <button type="submit" className="button glow-button">{bn ? "অ্যাডমিন অনুমোদনের জন্য জমা দিন" : "Submit for admin approval"}</button>
          <small className="muted">
            {bn ? "অনুমোদনের পর বিজ্ঞাপন খরচ আপনার ওয়ালেট থেকে কাটা হবে। একই স্লটে তারিখ মিলে গেলে বুকিং হবে না।" : "The cost is charged to your seller wallet when an admin approves. A slot cannot be double-booked."}
          </small>
        </form>
      </div>

      <h2>{t.yourCampaigns}</h2>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
              {[bn ? "আইডি" : "ID", bn ? "স্লট" : "Slot", bn ? "শিরোনাম" : "Headline", bn ? "মেয়াদ" : "Dates", bn ? "চার্জ" : "Fee", t.status, ""].map((h, i) => <th key={i} style={{ padding: "0.85rem 1rem" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 && <tr><td colSpan={7} style={{ padding: "1rem", textAlign: "center" }} className="muted">{bn ? "এখনও কোনো ক্যাম্পেইন নেই।" : "No campaigns yet."}</td></tr>}
            {bookings.map((b) => (
              <tr key={b.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>{b.bookingNumber}</td>
                <td style={{ padding: "0.85rem 1rem" }}>{b.slot?.name}</td>
                <td style={{ padding: "0.85rem 1rem" }}>{b.headline}{b.reviewNote && b.status === "REJECTED" ? <small className="muted" style={{ display: "block" }}>{b.reviewNote}</small> : null}</td>
                <td style={{ padding: "0.85rem 1rem", color: "#a1a1aa", fontSize: "0.85rem" }}>{b.startDate} → {b.endDate}</td>
                <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>{formatMoney(b.totalPrice)}</td>
                <td style={{ padding: "0.85rem 1rem" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.2rem 0.5rem", borderRadius: 4, backgroundColor: b.status === "ACTIVE" ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)", color: b.status === "ACTIVE" ? "#4ade80" : "#facc15" }}>
                    {bn ? STATUS_BN[b.status] ?? b.status : b.status}
                  </span>
                </td>
                <td style={{ padding: "0.85rem 1rem" }}>
                  {b.status === "PENDING_REVIEW" && (
                    <form action={cancelAction}><input type="hidden" name="id" value={b.id} /><button type="submit" className="button button-small button-outline">{bn ? "বাতিল" : "Cancel"}</button></form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
