"use client";

import React from "react";
import { CartProvider, useCart } from "@/components/cart/CartContext";
import CartDrawer from "@/components/cart/CartDrawer";
import { useLanguage } from "@/modules/i18n/LanguageContext";
import { CartButton, SponsoredSlot, StockNote, StoreLogo, themeStyle, type ProductVM, type SponsoredVM, type StoreBrand } from "./StoreBits";

/**
 * Modern: left-aligned bar with the logo and name (fixed), cart on the right,
 * a short intro line, then a product grid.
 */
function ModernContent({ store, products, sponsored }: { store: StoreBrand; products: ProductVM[]; sponsored?: SponsoredVM | null }) {
  const { addToCart } = useCart();
  const { t, formatMoney } = useLanguage();

  return (
    <div className="tpl tpl-modern" style={themeStyle(store)}>
      <header className="tpl-modern-bar">
        <div className="tpl-modern-brand">
          <StoreLogo store={store} size={40} />
          <span className="tpl-modern-name">{store.name}</span>
        </div>
        <CartButton label={t.cart} />
      </header>

      <section className="tpl-modern-intro">
        <h1>{t.modernTagline}</h1>
      </section>

      <SponsoredSlot sponsored={sponsored} notice={t.flashDealNotice} />

      <main className="tpl-body">
        {products.length === 0 ? (
          <p className="tpl-empty">{t.noProductsListed}</p>
        ) : (
          <div className="tpl-modern-grid">
            {products.map((p) => (
              <article key={p.id} className="tpl-modern-card">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt={p.name} className="tpl-modern-thumb" />
                ) : (
                  <div className="tpl-modern-thumb tpl-thumb-empty" aria-hidden="true">{p.name.slice(0, 1)}</div>
                )}
                <div className="tpl-modern-body">
                  <h3>{p.name}</h3>
                  {p.description && <p className="tpl-desc tpl-clamp">{p.description}</p>}
                  <StockNote stock={p.stock} />
                  <div className="tpl-modern-row">
                    <span className="tpl-price">{formatMoney(p.price)}</span>
                    {p.stock > 0 && (
                      <button className="tpl-button solid" type="button" onClick={() => addToCart(p)}>
                        {t.addToCart}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <CartDrawer storeName={store.name} storeSlug={store.slug} />
      <footer className="tpl-footer">{t.poweredBy}</footer>
    </div>
  );
}

export default function TemplateModern(props: { store: StoreBrand; products: ProductVM[]; sponsored?: SponsoredVM | null }) {
  return (
    <CartProvider>
      <ModernContent {...props} />
    </CartProvider>
  );
}
