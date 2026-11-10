"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/modules/i18n/LanguageContext";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";
import { logout } from "@/app/(auth)/actions";
import type { UserSession } from "@/modules/identity/types";

export default function SiteHeader({ user, marketplace = false }: { user: UserSession | null; marketplace?: boolean }) {
  const { t, language } = useLanguage();

  return (
    <div className="header-wrapper">
      <header className="site-header">
        <Link href="/" className="brand">
          {t.brand}
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
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
            {user ? (
              <>
                {user.role === "ADMIN" && (
                  <Link href="/admin" className="nav-link" style={{ color: "#f87171", fontWeight: 600 }}>
                    🛡️ {t.adminPortal}
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
                <Link href="/signup" className="button button-small glow-button">
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
