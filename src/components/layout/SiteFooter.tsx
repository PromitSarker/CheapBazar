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
              {language === "bn" ? "🔒 ১০০% সুরক্ষিত ও নিরাপদ" : "🔒 100% Safe & Secure"}
            </span>
            <span style={{ fontSize: "0.75rem", background: "rgba(59, 130, 246, 0.1)", color: "#2563eb", padding: "3px 8px", borderRadius: "99px", fontWeight: 600 }}>
              {language === "bn" ? "🇧🇩 ৬৪ জেলায় ডেলিভারি সুবিধা" : "🇧🇩 All 64 Districts Supported"}
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
              <Link href="/signup">{language === "bn" ? "১ মিনিটে শুরু করুন" : "Start in 1 Minute"}</Link>
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
              <span className="small muted">{language === "bn" ? "টাকার শতভাগ সঠিক হিসাব" : "Accurate Balance & Accounts"}</span>
            </li>
            <li>
              <span className="small muted">{language === "bn" ? "বিকাশ ও ব্যাংক উত্তোলন" : "Direct bKash & Bank Payouts"}</span>
            </li>
            <li>
              <span className="small muted">{language === "bn" ? "সারা দেশে ক্যাশ অন ডেলিভারি" : "Nationwide Cash on Delivery"}</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom-bar">
        <span>© 2026 {t.brand}. {language === "bn" ? "সর্বস্বত্ব সংরক্ষিত।" : "All rights reserved."}</span>
      </div>
    </footer>
  );
}
