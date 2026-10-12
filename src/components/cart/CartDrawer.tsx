"use client";

import React, { useState } from "react";
import { useCart } from "./CartContext";
import { useLanguage } from "@/modules/i18n/LanguageContext";

export default function CartDrawer({ storeName }: { storeName: string }) {
  const { items, isOpen, closeCart, removeFromCart, updateQuantity, subtotal, totalCount, clearCart } = useCart();
  const { t, formatMoney, toNumerals } = useLanguage();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutComplete, setCheckoutComplete] = useState(false);

  if (!isOpen) return null;

  const handleCheckout = () => {
    setIsCheckingOut(true);
    // Simulate instantaneous checkout flow with stock reservation
    setTimeout(() => {
      setIsCheckingOut(false);
      setCheckoutComplete(true);
      clearCart();
    }, 1200);
  };

  return (
    <div className="cart-backdrop" onClick={closeCart} style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      backdropFilter: "blur(4px)",
      zIndex: 9999,
      display: "flex",
      justifyContent: "flex-end",
      animation: "fadeIn 0.2s ease-out"
    }}>
      <aside
        className="cart-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "420px",
          height: "100%",
          backgroundColor: "#161618",
          color: "#f4f4f5",
          boxShadow: "-10px 0 30px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          padding: "1.5rem",
          overflowY: "auto",
          borderLeft: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h2 style={{ fontSize: "1.25rem", margin: 0, fontWeight: 600 }}>{t.shoppingBag}</h2>
            <span style={{
              backgroundColor: "rgba(255,255,255,0.1)",
              borderRadius: "999px",
              padding: "0.15rem 0.6rem",
              fontSize: "0.8rem",
              fontWeight: 500
            }}>
              {toNumerals(totalCount)}
            </span>
          </div>
          <button
            onClick={closeCart}
            type="button"
            style={{
              background: "none",
              border: "none",
              color: "#a1a1aa",
              fontSize: "1.5rem",
              cursor: "pointer",
              lineHeight: 1,
              padding: "0.25rem"
            }}
          >
            &times;
          </button>
        </div>

        {checkoutComplete ? (
          <div style={{ padding: "3rem 1rem", textAlign: "center", margin: "auto" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎉</div>
            <h3 style={{ fontSize: "1.3rem", marginBottom: "0.5rem" }}>{t.orderReservedTitle}</h3>
            <p style={{ color: "#a1a1aa", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
              {t.orderReservedDesc} (<strong>{storeName}</strong>)
            </p>
            <button
              onClick={() => { setCheckoutComplete(false); closeCart(); }}
              className="button glow-button"
              style={{ width: "100%" }}
            >
              {t.continueShopping}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: "4rem 1rem", textAlign: "center", margin: "auto" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem", opacity: 0.5 }}>🛍️</div>
            <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>{t.emptyCartTitle}</h3>
            <p style={{ color: "#71717a", fontSize: "0.9rem" }}>{t.emptyCartSub}</p>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "1rem 0" }}>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
                {items.map((item) => (
                  <li
                    key={item.id}
                    style={{
                      display: "flex",
                      gap: "1rem",
                      alignItems: "center",
                      backgroundColor: "rgba(255,255,255,0.03)",
                      padding: "0.75rem",
                      borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.06)"
                    }}
                  >
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        style={{ width: "56px", height: "56px", objectFit: "cover", borderRadius: "6px" }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "56px",
                          height: "56px",
                          backgroundColor: "rgba(255,255,255,0.08)",
                          borderRadius: "6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "1.2rem"
                        }}
                      >
                        📦
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: "block", fontSize: "0.95rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.name}
                      </strong>
                      <span style={{ color: "#e4e4e7", fontSize: "0.85rem" }}>{formatMoney(item.price)} {t.each}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.4rem" }}>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, -1)}
                          style={{
                            background: "rgba(255,255,255,0.1)",
                            border: "none",
                            color: "white",
                            width: "24px",
                            height: "24px",
                            borderRadius: "4px",
                            cursor: "pointer"
                          }}
                        >
                          -
                        </button>
                        <span style={{ fontSize: "0.9rem", minWidth: "16px", textAlign: "center" }}>{toNumerals(item.quantity)}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, 1)}
                          disabled={item.quantity >= item.maxStock}
                          style={{
                            background: "rgba(255,255,255,0.1)",
                            border: "none",
                            color: "white",
                            width: "24px",
                            height: "24px",
                            borderRadius: "4px",
                            cursor: item.quantity >= item.maxStock ? "not-allowed" : "pointer",
                            opacity: item.quantity >= item.maxStock ? 0.4 : 1
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{formatMoney(item.price * item.quantity)}</div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#ef4444",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                          marginTop: "0.5rem",
                          padding: 0
                        }}
                      >
                        {t.remove}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "1rem", marginTop: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.9rem", color: "#a1a1aa" }}>
                <span>{t.subtotal}</span>
                <span>{formatMoney(subtotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", fontSize: "1.1rem", fontWeight: 700 }}>
                <span>{t.total}</span>
                <span style={{ color: "#38bdf8" }}>{formatMoney(subtotal)}</span>
              </div>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={isCheckingOut}
                className="button glow-button"
                style={{ width: "100%", padding: "0.85rem", fontSize: "1rem" }}
              >
                {isCheckingOut ? t.reservingStock : `${t.proceedToCheckout} (${formatMoney(subtotal)})`}
              </button>
              <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#71717a", marginTop: "0.75rem" }}>
                {t.stockHoldNotice}
              </p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
