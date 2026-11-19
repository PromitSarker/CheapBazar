"use client";

import React from "react";
import { CartProvider, useCart } from "@/components/cart/CartContext";
import CartDrawer from "@/components/cart/CartDrawer";
import { useLanguage } from "@/modules/i18n/LanguageContext";
import { CartButton, SponsoredSlot, StockNote, StoreLogo, themeStyle, type ProductVM, type NetworkAdVM, type SponsoredVM, type StoreBrand } from "./StoreBits";

/**
 * Classic: centred, editorial. Logo above the name (fixed), cart top-right,
 * products as a single quiet list.
 */
function ClassicContent({ store, products, sponsored, network }: { store: StoreBrand; products: ProductVM[]; sponsored?: SponsoredVM | null; network?: NetworkAdVM }) {
  const { addToCart } = useCart();
  const { t, formatMoney } = useLanguage();

  return (
    <div className="tpl tpl-classic" style={themeStyle(store)}>
      <header className="tpl-classic-head">
        <div className="tpl-classic-brand">
          <StoreLogo store={store} size={72} />
          <h1>{store.name}</h1>
          <p className="tpl-tagline">{t.classicTagline}</p>
        </div>
        <div className="tpl-classic-cart">
          <CartButton label={t.bag} />
        </div>
      </header>

      <SponsoredSlot network={network} sponsored={sponsored} notice={t.featuredNotice} />

      <main className="tpl-body">
        {products.length === 0 ? (
          <p className="tpl-empty">{t.noProductsListed}</p>
        ) : (
          <ul className="tpl-classic-list">
            {products.map((p) => (
              <li key={p.id} className="tpl-classic-item">
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt={p.name} className="tpl-classic-thumb" />
                ) : (
                  <span className="tpl-classic-thumb tpl-thumb-empty" aria-hidden="true">{p.name.slice(0, 1)}</span>
                )}
                <div className="tpl-classic-info">
                  <strong>{p.name}</strong>
                  {p.description && <p className="tpl-desc">{p.description}</p>}
                  <StockNote stock={p.stock} />
                </div>
                <div className="tpl-classic-buy">
                  <span className="tpl-price">{formatMoney(p.price)}</span>
                  {p.stock > 0 && (
                    <button className="tpl-button" type="button" onClick={() => addToCart(p)}>
                      {t.addToCart}
                    </button>
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

export default function TemplateClassic(props: { store: StoreBrand; products: ProductVM[]; sponsored?: SponsoredVM | null; network?: NetworkAdVM }) {
  return (
    <CartProvider>
      <ClassicContent {...props} />
    </CartProvider>
  );
}
