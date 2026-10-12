"use client";

import React from "react";
import { useLanguage } from "@/modules/i18n/LanguageContext";

export default function AdsView({ storeSlug }: { storeSlug: string }) {
  const { t, formatMoney, toNumerals, language } = useLanguage();

  const adSlots = [
    {
      id: "slot-storefront-top",
      name: language === "bn" ? "স্টোরফ্রন্ট হেডার ব্যানার" : "Storefront Header Banner",
      placement: language === "bn" ? "সরাসরি স্টোরফ্রন্ট (/store/[slug])" : "Direct Storefront (/store/[slug])",
      pricePerDay: 1000.00,
      availability: language === "bn" ? "এখনই খালি আছে" : "Available Now",
    },
    {
      id: "slot-aggregator-spotlight",
      name: language === "bn" ? "মার্কেটপ্লেস টপ স্পটলাইট" : "Buyer Aggregator Top Spotlight",
      placement: language === "bn" ? "প্ল্যাটফর্ম মার্কেটপ্লেস ফিড" : "Platform Marketplace Feed",
      pricePerDay: 2500.00,
      availability: language === "bn" ? "এখনই খালি আছে" : "Available Now",
    },
    {
      id: "slot-wholesale-sidebar",
      name: language === "bn" ? "পাইকারি স্পটলাইট ব্যানার" : "Pro Wholesale Deals Spotlight",
      placement: language === "bn" ? "পাইকারি ক্রেতাদের ট্যাব" : "Wholesale Buyers Tab",
      pricePerDay: 3500.00,
      availability: language === "bn" ? "পরবর্তী সপ্তাহে খালি হবে" : "Available Next Week",
    },
  ];

  const existingCampaigns = [
    {
      id: "AD-501",
      slot: language === "bn" ? "স্টোরফ্রন্ট হেডার ব্যানার" : "Storefront Header Banner",
      dates: language === "bn" ? "১০ অক্টো – ১৭ অক্টো, ২০২৬" : "Oct 10 – Oct 17, 2026",
      status: "ACTIVE",
      headline: language === "bn" ? "৳ ৫০০ টাকার বেশি অর্ডারে ফ্রি ডেলিভারি" : "Free Local Pickup on Orders Over ৳ 500",
      fee: 7000.00,
    },
    {
      id: "AD-502",
      slot: language === "bn" ? "মার্কেটপ্লেস টপ স্পটলাইট" : "Buyer Aggregator Top Spotlight",
      dates: language === "bn" ? "১৮ অক্টো – ২৫ অক্টো, ২০২৬" : "Oct 18 – Oct 25, 2026",
      status: "PENDING_REVIEW",
      headline: language === "bn" ? "আর্টিসান বেকারি আইটেম ও কেক" : "Artisan Fermented Breads & Croissants",
      fee: 17500.00,
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1>{t.adManagerTitle}</h1>
          <p className="muted">{t.adManagerSub}</p>
        </div>
      </div>

      <h2>{t.availableAdInventory}</h2>
      <div className="card-grid" style={{ marginBottom: "2rem" }}>
        {adSlots.map((slot) => (
          <div key={slot.id} className="card" style={{ padding: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
              <strong style={{ fontSize: "1rem" }}>{slot.name}</strong>
              <span style={{ color: "#38bdf8", fontWeight: 700 }}>
                {formatMoney(slot.pricePerDay)} / {language === "bn" ? "দিন" : "day"}
              </span>
            </div>
            <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 1rem 0" }}>
              📍 {slot.placement}
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", color: "#4ade80" }}>● {slot.availability}</span>
              <button type="button" className="button button-small button-outline">
                {t.bookSlot}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
        <h3 style={{ margin: "0 0 1rem 0" }}>{t.bookNewCampaign}</h3>
        <form className="stack" style={{ maxWidth: "600px" }}>
          <label>
            {language === "bn" ? "বিজ্ঞাপন স্লট নির্বাচন করুন" : "Select Ad Slot"}
            <select
              name="slotId"
              defaultValue="slot-storefront-top"
              style={{
                padding: "0.6rem",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "6px",
                color: "white",
              }}
            >
              <option value="slot-storefront-top">
                {language === "bn" ? `স্টোরফ্রন্ট হেডার ব্যানার (${formatMoney(1000)}/দিন)` : `Storefront Header Banner (${formatMoney(1000)}/day)`}
              </option>
              <option value="slot-aggregator-spotlight">
                {language === "bn" ? `মার্কেটপ্লেস টপ স্পটলাইট (${formatMoney(2500)}/দিন)` : `Buyer Aggregator Top Spotlight (${formatMoney(2500)}/day)`}
              </option>
              <option value="slot-wholesale-sidebar">
                {language === "bn" ? `পাইকারি স্পটলাইট ব্যানার (${formatMoney(3500)}/দিন)` : `Pro Wholesale Deals Spotlight (${formatMoney(3500)}/day)`}
              </option>
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <label>
              {language === "bn" ? "শুরুর তারিখ" : "Start Date"}
              <input type="date" name="startDate" defaultValue="2026-10-15" />
            </label>
            <label>
              {language === "bn" ? "শেষ তারিখ" : "End Date"}
              <input type="date" name="endDate" defaultValue="2026-10-22" />
            </label>
          </div>
          <label>
            {language === "bn" ? "বিজ্ঞাপনের ট্যাগলাইন / শিরোনাম" : "Ad Tagline / Announcement"}
            <input
              name="headline"
              placeholder={language === "bn" ? "যেমন: উইকেন্ড স্পেশাল: সকল পণ্যে ২০% ছাড়" : "e.g., Weekend Special: 20% off all pastries"}
            />
          </label>
          <label>
            {language === "bn" ? "গন্তব্য লিংক" : "Destination Link"}
            <input name="targetUrl" placeholder={`/store/${storeSlug}`} defaultValue={`/store/${storeSlug}`} />
          </label>
          <button type="button" className="button glow-button">
            {language === "bn" ? "অ্যাডমিন অনুমোদনের জন্য জমা দিন" : "Submit for Admin Moderation"}
          </button>
          <small className="muted">
            {language === "bn"
              ? "অনুমোদনের পর বিজ্ঞাপন খরচ সরাসরি আপনার বিক্রেতা ওয়ালেট থেকে কর্তন করা হবে।"
              : "Charges are billed directly to your Seller Wallet upon approval. Date collision prevention is enforced."}
          </small>
        </form>
      </div>

      <h2>{t.yourCampaigns}</h2>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
              <th style={{ padding: "0.85rem 1rem" }}>{language === "bn" ? "ক্যাম্পেইন আইডি" : "Campaign ID"}</th>
              <th style={{ padding: "0.85rem 1rem" }}>{language === "bn" ? "স্লট" : "Slot"}</th>
              <th style={{ padding: "0.85rem 1rem" }}>{language === "bn" ? "শিরোনাম" : "Headline"}</th>
              <th style={{ padding: "0.85rem 1rem" }}>{language === "bn" ? "মেয়াদ" : "Dates"}</th>
              <th style={{ padding: "0.85rem 1rem" }}>{language === "bn" ? "চার্জ" : "Fee"}</th>
              <th style={{ padding: "0.85rem 1rem" }}>{t.status}</th>
            </tr>
          </thead>
          <tbody>
            {existingCampaigns.map((camp) => (
              <tr key={camp.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>{toNumerals(camp.id)}</td>
                <td style={{ padding: "0.85rem 1rem" }}>{camp.slot}</td>
                <td style={{ padding: "0.85rem 1rem", color: "#e4e4e7" }}>{camp.headline}</td>
                <td style={{ padding: "0.85rem 1rem", color: "#a1a1aa", fontSize: "0.85rem" }}>{camp.dates}</td>
                <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>{formatMoney(camp.fee)}</td>
                <td style={{ padding: "0.85rem 1rem" }}>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                      backgroundColor: camp.status === "ACTIVE" ? "rgba(34, 197, 94, 0.15)" : "rgba(234, 179, 8, 0.15)",
                      color: camp.status === "ACTIVE" ? "#4ade80" : "#facc15",
                    }}
                  >
                    {camp.status === "ACTIVE" ? (language === "bn" ? "সক্রিয়" : "ACTIVE") : (language === "bn" ? "পর্যালোচনাধীন" : "PENDING_REVIEW")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
