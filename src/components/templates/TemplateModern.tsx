"use client";

import React from "react";
import { CartProvider, useCart } from "@/components/cart/CartContext";
import CartDrawer from "@/components/cart/CartDrawer";
import { useLanguage } from "@/modules/i18n/LanguageContext";
import LanguageSwitcher from "@/components/i18n/LanguageSwitcher";

type ProductVM = { id: string; name: string; description: string; price: number; stock: number; image?: string | null };

function ModernContent({
  store,
  products,
}: {
  store: { name: string; slug: string };
  products: ProductVM[];
}) {
  const { addToCart, openCart, totalCount } = useCart();
  const { t, formatMoney, toNumerals } = useLanguage();

  return (
    <div className="tpl tpl-modern">
      <section className="tpl-modern-hero" style={{ position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1>{store.name}</h1>
            <p>{t.modernTagline}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <LanguageSwitcher />
            <button
              type="button"
              onClick={openCart}
              className="button glow-button"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 1.2rem" }}
            >
              <span>🛍️ {t.cart}</span>
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
          marginTop: "1.5rem",
          padding: "0.75rem 1.25rem",
          borderRadius: "8px",
          background: "linear-gradient(90deg, rgba(59, 130, 246, 0.15) 0%, rgba(147, 51, 234, 0.1) 100%)",
          border: "1px dashed rgba(96, 165, 250, 0.4)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.85rem"
        }}>
          <span>⚡ <strong>{t.sponsored}:</strong> {t.flashDealNotice}</span>
          <span style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#60a5fa", fontWeight: 600 }}>{t.sponsored}</span>
        </div>
      </section>

      <main className="tpl-body">
        {products.length === 0 ? (
          <p className="tpl-empty">{t.noProductsListed}</p>
        ) : (
          <div className="tpl-modern-grid">
            {products.map((p) => (
              <article key={p.id} className="tpl-modern-card">
                {p.image ? (
                  <img src={p.image} alt={p.name} className="tpl-modern-thumb" style={{ objectFit: 'cover', width: '100%' }} />
                ) : (
                  <div className="tpl-modern-thumb" aria-hidden>
                    {p.name.slice(0, 1)}
                  </div>
                )}
                <h3>{p.name}</h3>
                {p.description && <p className="tpl-desc">{p.description}</p>}
                <div className="tpl-modern-row">
                  <span className="tpl-price">{formatMoney(p.price)}</span>
                  {p.stock === 0 ? (
                    <span className="tpl-soldout">{t.soldOut}</span>
                  ) : (
                    <>
                      {p.stock < 5 && (
                        <span className="tpl-low">
                          {t.onlyLeft.replace("{count}", toNumerals(p.stock))}
                        </span>
                      )}
                      <button
                        className="tpl-button dark"
                        type="button"
                        onClick={() => addToCart(p)}
                        title={t.addToCart}
                      >
                        {t.addToCart}
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <CartDrawer storeName={store.name} />
      <footer className="tpl-footer">{t.poweredBy}</footer>
    </div>
  );
}

export default function TemplateModern(props: {
  store: { name: string; slug: string };
  products: ProductVM[];
}) {
  return (
    <CartProvider>
      <ModernContent {...props} />
    </CartProvider>
  );
}
