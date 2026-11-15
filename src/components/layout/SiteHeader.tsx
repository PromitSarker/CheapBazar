"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/modules/i18n/LanguageContext";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import { logout } from "@/app/(auth)/actions";
import type { UserSession } from "@/modules/identity/types";

export default function SiteHeader({ user, marketplace = false, unread = 0 }: { user: UserSession | null; marketplace?: boolean; unread?: number }) {
  const { t, language } = useLanguage();

  return (
    <div className="header-wrapper">
      <header className="site-header">
        <Link href="/" className="brand">
          {t.brand}
        </Link>
        <div className="header-actions">
          <LanguageSwitcher />
          <nav>
            {marketplace && (
              <Link href="/browse" className="nav-link">{language === "bn" ? "মার্কেটপ্লেস" : "Marketplace"}</Link>
            )}
            {marketplace && user && user.role !== "ADMIN" && (
              <Link href="/pro" className="nav-link">Buyer Pro</Link>
            )}
            {marketplace && user && user.role !== "ADMIN" && (
              <Link href="/orders" className="nav-link">My orders</Link>
            )}
            {marketplace && user && (
              <Link
                href="/notifications"
                className="nav-link"
                aria-label={(language === "bn" ? "নোটিফিকেশন" : "Notifications") + (unread > 0 ? ` (${unread})` : "")}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "middle" }}>
                  <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {unread > 0 && (
                  <span data-testid="bell-count" style={{ marginLeft: 6, background: "var(--text-primary)", color: "#fff", borderRadius: 999, fontSize: "0.7rem", fontWeight: 600, minWidth: 18, height: 18, lineHeight: "18px", textAlign: "center", padding: "0 5px", display: "inline-block" }}>
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            )}
            {user ? (
              <>
                {user.role === "ADMIN" && (
                  <Link href="/admin" className="nav-link" style={{ color: "var(--danger)", fontWeight: 600 }}>
                    {t.adminPortal}
                  </Link>
                )}
                {user.role === "SELLER" && (
                  <Link href="/dashboard" className="nav-link">
                    {t.dashboard}
                  </Link>
                )}
                {user.role === "BUYER" && (
                  <Link href="/#explore" className="nav-link">
                    {t.exploreStores}
                  </Link>
                )}
                <form action={logout} className="inline-form">
                  <button type="submit" className="link-button nav-link">
                    {t.logout} ({user.name.split(" ")[0]})
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="nav-link">
                  {t.login}
                </Link>
                <Link href="/signup" className="button button-small">
                  {t.getStarted}
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
    </div>
  );
}
