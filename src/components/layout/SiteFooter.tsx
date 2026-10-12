"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/modules/i18n/LanguageContext";

export default function SiteFooter() {
  const { t, language } = useLanguage();

  return (
    <footer className="footer-container">
      <div className="footer-top-grid">
        {/* Brand Information */}
        <div className="footer-brand-info">
          <Link href="/" className="brand" style={{ fontSize: "1.35rem" }}>
            {t.brand}
          </Link>
          <p>{t.footerAbout}</p>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", background: "rgba(16, 185, 129, 0.1)", color: "#059669", padding: "3px 8px", borderRadius: "99px", fontWeight: 600 }}>
              ✓ Postgres RLS Isolated
            </span>
            <span style={{ fontSize: "0.75rem", background: "rgba(59, 130, 246, 0.1)", color: "#2563eb", padding: "3px 8px", borderRadius: "99px", fontWeight: 600 }}>
              🇧🇩 BDT (৳) Native
            </span>
          </div>
        </div>

        {/* Platform Column */}
        <div className="footer-col">
          <h5>{t.footerPlatform}</h5>
          <ul className="footer-links">
            <li>
              <Link href="#explore">{t.exploreStores}</Link>
            </li>
            <li>
              <Link href="/signup">{t.createStore}</Link>
            </li>
            <li>
              <Link href="/#pricing">{language === "bn" ? "প্রাইসিং প্ল্যান" : "Pricing Plans"}</Link>
            </li>
            <li>
              <Link href="/store/demo-bakery">{language === "bn" ? "ডেমো স্টোরফ্রন্ট" : "Live Demo Store"}</Link>
            </li>
          </ul>
        </div>

        {/* Merchants Column */}
        <div className="footer-col">
          <h5>{t.footerMerchants}</h5>
          <ul className="footer-links">
            <li>
              <Link href="/login">{t.login}</Link>
            </li>
            <li>
              <Link href="/dashboard">{t.dashboard}</Link>
            </li>
            <li>
              <Link href="/dashboard/products">{t.inventory}</Link>
            </li>
            <li>
              <Link href="/dashboard/ads">{t.adManager}</Link>
            </li>
            <li>
              <Link href="/dashboard/wallet">{t.walletLedger}</Link>
            </li>
          </ul>
        </div>

        {/* Trust & Administration Column */}
        <div className="footer-col">
          <h5>{t.footerSecurity}</h5>
          <ul className="footer-links">
            <li>
              <Link href="/admin">{t.adminPortal}</Link>
            </li>
            <li>
              <span className="small muted">{language === "bn" ? "ডাবল-এন্ট্রি লেজার ইঞ্জিন" : "Double-Entry Ledger"}</span>
            </li>
            <li>
              <span className="small muted">{language === "bn" ? "১৫-মিনিট স্টক লক গ্যারান্টি" : "15-Min Stock Lock"}</span>
            </li>
            <li>
              <span className="small muted">{language === "bn" ? "এজ ডোমেন রাউটার" : "Edge Tenant Resolver"}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom-bar">
        <span>© 2026 {t.brand}. {language === "bn" ? "সর্বস্বত্ব সংরক্ষিত।" : "All rights reserved."}</span>
        <span>{t.footerMadeWith}</span>
      </div>
    </footer>
  );
}
