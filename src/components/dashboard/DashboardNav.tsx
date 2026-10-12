"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/modules/i18n/LanguageContext";

export default function DashboardNav({
  storeName,
  storeStatus,
  storeSlug,
}: {
  storeName: string;
  storeStatus: string;
  storeSlug: string;
}) {
  const { t, language } = useLanguage();
  const pathname = usePathname();

  // Initial letter for the avatar monogram
  const storeInitial = storeName ? storeName.charAt(0).toUpperCase() : "S";

  const navItems = [
    {
      href: "/dashboard",
      label: t.overview,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="7" height="9" x="3" y="3" rx="1" />
          <rect width="7" height="5" x="14" y="3" rx="1" />
          <rect width="7" height="9" x="14" y="12" rx="1" />
          <rect width="7" height="5" x="3" y="16" rx="1" />
        </svg>
      ),
    },
    {
      href: "/dashboard/products",
      label: t.inventory,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m7.5 4.27 9 5.15" />
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      ),
    },
    {
      href: "/dashboard/orders",
      label: t.orders,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      ),
    },
    {
      href: "/dashboard/wallet",
      label: t.walletLedger,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
          <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
        </svg>
      ),
    },
    {
      href: "/dashboard/ads",
      label: t.adManager,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 11 18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
      ),
    },
    {
      href: "/dashboard/settings",
      label: t.settings,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
    },
  ];

  const statusLabel =
    language === "bn"
      ? storeStatus === "ACTIVE"
        ? "সক্রিয় স্টোর"
        : storeStatus === "WARNING"
        ? "সতর্কতা"
        : storeStatus === "COD_BLOCKED"
        ? "সিওডি বন্ধ"
        : storeStatus
      : storeStatus === "ACTIVE"
      ? "Active Store"
      : storeStatus;

  const statusClass =
    storeStatus === "ACTIVE"
      ? "active"
      : storeStatus === "WARNING"
      ? "warning"
      : "error";

  return (
    <aside className="dash-nav">
      {/* Top Store Identity Card */}
      <div className="dash-nav-header">
        <div className="dash-store-identity">
          <div className="dash-store-avatar">{storeInitial}</div>
          <div className="dash-store-details">
            <span className="dash-store-name" title={storeName}>
              {storeName}
            </span>
            <span className="dash-store-type">
              {language === "bn" ? "মার্চেন্ট প্যানেল" : "Merchant Portal"}
            </span>
          </div>
        </div>

        <div className={`dash-status-pill ${statusClass}`}>
          <span className="dash-status-dot" />
          <span>{statusLabel}</span>
        </div>
      </div>

      {/* Navigation Links */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div className="dash-nav-section-title">
          {language === "bn" ? "ওয়ার্কস্পেস মেনু" : "Workspace Menu"}
        </div>
        <nav className="dash-nav-list">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`dash-nav-item ${isActive ? "active" : ""}`}
              >
                <span className="dash-nav-icon">{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {isActive && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      opacity: 0.6,
                      fontWeight: 700,
                    }}
                  >
                    ›
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Area: Live Store Link Card & Currency Pill */}
      <div className="dash-nav-footer">
        <a
          href={`/store/${storeSlug}`}
          target="_blank"
          rel="noreferrer"
          className="dash-live-store-card"
        >
          <div className="dash-live-store-card-header">
            <span className="dash-live-store-label">
              {language === "bn" ? "লাইভ স্টোর দেখুন" : "Live Storefront"}
            </span>
            <span className="dash-live-store-link">
              <span>{language === "bn" ? "ভিজিট" : "Visit"}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6" />
                <path d="M10 14 21 3" />
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              </svg>
            </span>
          </div>
          <span className="dash-live-store-url">/store/{storeSlug}</span>
        </a>

        <div className="dash-currency-badge">
          <span>{language === "bn" ? "মুদ্রা:" : "Currency:"}</span>
          <strong>৳ BDT ({language === "bn" ? "টাকা" : "Taka"})</strong>
        </div>
      </div>
    </aside>
  );
}
