"use client";

import React from "react";
import { CartProvider, useCart } from "@/components/cart/CartContext";
import CartDrawer from "@/components/cart/CartDrawer";
import { useLanguage } from "@/modules/i18n/LanguageContext";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";

type ProductVM = { id: string; name: string; description: string; price: number; stock: number; image?: string | null };

function ClassicContent({
  store,
  products,
}: {
  store: { name: string; slug: string };
  products: ProductVM[];
}) {
  const { addToCart, openCart, totalCount } = useCart();
  const { t, formatMoney, toNumerals } = useLanguage();

  return (
    <div className="tpl tpl-classic">
      <header className="tpl-classic-header" style={{ position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1>{store.name}</h1>
            <p className="tpl-tagline">{t.classicTagline}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <LanguageSwitcher />
            <button
              type="button"
              onClick={openCart}
              className="button glow-button"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem" }}
            >
              <span>🛍️ {t.bag}</span>
              {totalCount > 0 && (
                <span style={{
                  background: "white",
                  color: "#18181b",
                  borderRadius: "999px",
                  padding: "0.1rem 0.5rem",
                  fontSize: "0.8rem",
                  fontWeight: 700
                }}>
                  {toNumerals(totalCount)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Sponsored ad slot placeholder (Diagram 5) */}
        <div className="sponsored-banner" style={{
          marginTop: "1.25rem",
          padding: "0.75rem 1rem",
          borderRadius: "8px",
          background: "linear-gradient(90deg, rgba(234, 88, 12, 0.15) 0%, rgba(249, 115, 22, 0.05) 100%)",
          border: "1px dashed rgba(249, 115, 22, 0.4)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.85rem"
        }}>
          <span>✨ <strong>{t.sponsored}:</strong> {t.featuredNotice}</span>
          <span style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#f97316", fontWeight: 600 }}>{t.sponsored}</span>
        </div>
      </header>

      <main className="tpl-body">
        {products.length === 0 ? (
          <p className="tpl-empty">{t.noProductsListed}</p>
        ) : (
          <ul className="tpl-classic-list">
            {products.map((p) => (
              <li key={p.id} className="tpl-classic-item" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                {p.image && <img src={p.image} alt={p.name} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px' }} />}
                <div style={{ flex: 1 }}>
                  <strong>{p.name}</strong>
                  {p.description && <p className="tpl-desc">{p.description}</p>}
                </div>
                <div className="tpl-classic-buy">
                  <span className="tpl-price">{formatMoney(p.price)}</span>
                  {p.stock > 0 ? (
                    <button
                      className="tpl-button"
                      type="button"
                      onClick={() => addToCart(p)}
                      title={t.addToCart}
                    >
                      {t.addToCart}
                    </button>
                  ) : (
                    <span className="tpl-soldout">{t.soldOut}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <CartDrawer storeName={store.name} storeSlug={store.slug} />
      <footer className="tpl-footer">{t.poweredBy}</footer>
    </div>
  );
}

export default function TemplateClassic(props: {
  store: { name: string; slug: string };
  products: ProductVM[];
}) {
  return (
    <CartProvider>
      <ClassicContent {...props} />
    </CartProvider>
  );
}
