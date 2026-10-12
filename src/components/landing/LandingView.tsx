"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/modules/i18n/LanguageContext";

interface StoreItem {
  id: string;
  name: string;
  slug: string;
  productCount: number;
}

export default function LandingView({ stores }: { stores: StoreItem[] }) {
  const { t, toNumerals } = useLanguage();

  return (
    <div className="landing">
      <section className="hero animate-slide-up" style={{ animationDelay: "0ms" }}>
        <div className="hero-badge">
          <span className="hero-badge-dot"></span>
          {t.heroBadge}
        </div>
        <h1>
          {t.heroHeading1} <br />
          <span className="text-gradient">{t.heroHeadingGradient}</span>
        </h1>
        <p>{t.heroDesc}</p>
        <div className="hero-actions">
          <Link href="/signup" className="button glow-button hero-button">
            {t.startForFree}
          </Link>
          <Link href="#explore" className="button button-outline hero-button">
            {t.viewDemo}
          </Link>
        </div>
      </section>

      <section className="section bento-section animate-slide-up" style={{ animationDelay: "200ms" }} id="explore">
        <div className="bento-header">
          <h2>{t.creatorsSectionTitle}</h2>
          <p className="muted">{t.creatorsSectionSub}</p>
        </div>

        {stores.length === 0 ? (
          <div className="empty-state">
            <p className="muted">{t.noStores}</p>
          </div>
        ) : (
          <div className="card-grid">
            {stores.map((s) => (
              <Link key={s.id} href={`/store/${s.slug}`} className="card store-card group">
                <div className="card-content">
                  <div className="card-icon">🛍️</div>
                  <strong>{s.name}</strong>
                  <span className="muted">
                    {toNumerals(s.productCount)} {t.productsCount}
                  </span>
                </div>
                <div className="card-gradient-overlay"></div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
