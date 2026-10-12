"use client";

import React from "react";
import { useLanguage } from "@/modules/i18n/LanguageContext";

export default function OverviewView({
  storeSlug,
  template,
  productCount,
  unitsInStock,
  lowStockCount,
}: {
  storeSlug: string;
  template: string;
  productCount: number;
  unitsInStock: number;
  lowStockCount: number;
}) {
  const { t, toNumerals } = useLanguage();

  const stats = [
    { label: t.productsHeader, value: toNumerals(productCount) },
    { label: t.unitsInStock, value: toNumerals(unitsInStock) },
    { label: t.lowStock, value: toNumerals(lowStockCount) },
  ];

  return (
    <div>
      <h1>{t.overview}</h1>
      <p className="muted" style={{ marginBottom: "1.5rem" }}>
        {t.yourStoreLivesAt}{" "}
        <a href={`/store/${storeSlug}`} style={{ color: "#38bdf8" }}>
          /store/{storeSlug}
        </a>{" "}
        {t.usingTemplate} <strong>{template}</strong>.
      </p>
      <div className="stat-grid">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <span className="stat-value">{s.value}</span>
            <span className="muted">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
