"use client";

import React from "react";
import { useCart } from "@/components/cart/CartContext";
import { useLanguage } from "@/modules/i18n/LanguageContext";
import SponsoredBanner from "@/components/sponsored/SponsoredBanner";
import { themeOrDefault } from "@/lib/storefront-theme";

export type SponsoredVM = { headline: string; imageUrl: string; targetUrl: string };
export type ProductVM = { id: string; name: string; description: string; price: number; stock: number; image?: string | null };
export type StoreBrand = { name: string; slug: string; logoUrl?: string | null; themeColor?: string | null };

/** Sets the one themeable variable; the value is always a known preset, never raw input. */
export function themeStyle(store: StoreBrand): React.CSSProperties {
  return { ["--store-accent" as string]: themeOrDefault(store.themeColor) };
}

/** The logo slot. Position is fixed by the template; the seller only supplies the image. */
export function StoreLogo({ store, size }: { store: StoreBrand; size: number }) {
  const box = { width: size, height: size } as const;
  if (store.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={store.logoUrl} alt={`${store.name} logo`} className="tpl-logo" style={box} />;
  }
  return (
    <span className="tpl-logo tpl-logo-mono" style={{ ...box, fontSize: size * 0.42 }} aria-hidden="true">
      {store.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function CartButton({ label }: { label: string }) {
  const { openCart, totalCount } = useCart();
  const { toNumerals } = useLanguage();
  return (
    <button type="button" onClick={openCart} className="tpl-cart">
      <span>{label}</span>
      {totalCount > 0 && <span className="tpl-cart-count">{toNumerals(totalCount)}</span>}
    </button>
  );
}

/** undefined = legacy placeholder; null = no ad; object = a real paid banner. */
export function SponsoredSlot({ sponsored, notice }: { sponsored?: SponsoredVM | null; notice: string }) {
  const { t } = useLanguage();
  if (sponsored === undefined) {
    return (
      <div className="tpl-note sponsored-banner">
        <span><strong>{t.sponsored}:</strong> {notice}</span>
      </div>
    );
  }
  if (!sponsored) return null;
  return <SponsoredBanner ad={sponsored} label={t.sponsored} accent="var(--store-accent)" />;
}

export function StockNote({ stock }: { stock: number }) {
  const { t, toNumerals } = useLanguage();
  if (stock === 0) return <span className="tpl-soldout">{t.soldOut}</span>;
  if (stock < 5) return <span className="tpl-low">{t.onlyLeft.replace("{count}", toNumerals(stock))}</span>;
  return null;
}
