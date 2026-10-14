"use client";

import React, { useState } from "react";
import { useCart } from "./CartContext";
import { useLanguage } from "@/modules/i18n/LanguageContext";

interface CartDrawerProps {
  storeName: string;
  storeSlug?: string;
}

export default function CartDrawer({ storeName, storeSlug = "demo-bakery" }: CartDrawerProps) {
  const { items, isOpen, closeCart, removeFromCart, updateQuantity, subtotal, totalCount, clearCart } = useCart();
  const { t, formatMoney, toNumerals } = useLanguage();

  const [step, setStep] = useState<"CART" | "CHECKOUT">("CART");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCity, setShippingCity] = useState("Dhaka");
  const [paymentMethod, setPaymentMethod] = useState<"SSLCOMMERZ" | "COD">("SSLCOMMERZ");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleProceedToDetails = () => {
    setErrorMessage(null);
    setStep("CHECKOUT");
  };

  const handleBackToCart = () => {
    setErrorMessage(null);
    setStep("CART");
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerName.trim() || !buyerPhone.trim() || !shippingAddress.trim()) {
      setErrorMessage("Please fill in your name, mobile number, and delivery address.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeSlug,
          buyerName,
          buyerPhone,
          shippingAddress,
          shippingCity,
          paymentMethod,
          items: items.map((it) => ({ id: it.id, quantity: it.quantity })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create order");
      }

      // Clear cart
      clearCart();

      // Redirect buyer
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } catch (err: any) {
      console.error("Order submit failed:", err);
      setErrorMessage(err.message || "An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="cart-backdrop"
      onClick={closeCart}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "flex-end",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <aside
        className="cart-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "460px",
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
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h2 style={{ fontSize: "1.25rem", margin: 0, fontWeight: 600 }}>
              {step === "CHECKOUT" ? "Checkout Details" : t.shoppingBag}
            </h2>
            <span style={{
              backgroundColor: "rgba(255,255,255,0.1)",
              borderRadius: "999px",
              padding: "0.15rem 0.6rem",
              fontSize: "0.8rem",
              fontWeight: 500,
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
              padding: "0.25rem",
            }}
          >
            &times;
          </button>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: "4rem 1rem", textAlign: "center", margin: "auto" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "1rem", opacity: 0.5 }}>🛍️</div>
            <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>{t.emptyCartTitle}</h3>
            <p style={{ color: "#a1a1aa", fontSize: "0.85rem", marginBottom: "1.5rem" }}>{t.emptyCartSub}</p>
            <button onClick={closeCart} className="button" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
              {t.continueShopping}
            </button>
          </div>
        ) : step === "CART" ? (
          /* STEP 1: CART ITEMS REVIEW */
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "1rem 0" }}>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {items.map((item) => (
                  <li
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      padding: "0.85rem 0",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "0.95rem", fontWeight: 600 }}>{item.name}</h4>
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "#a1a1aa" }}>
                        {formatMoney(item.price)} {t.each}
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          style={{
                            width: "24px",
                            height: "24px",
                            background: "rgba(255,255,255,0.1)",
                            border: "none",
                            color: "#fff",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          -
                        </button>
                        <span style={{ fontSize: "0.85rem", fontWeight: 600, minWidth: "18px", textAlign: "center" }}>
                          {toNumerals(item.quantity)}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          disabled={item.quantity >= item.maxStock}
                          style={{
                            width: "24px",
                            height: "24px",
                            background: "rgba(255,255,255,0.1)",
                            border: "none",
                            color: "#fff",
                            borderRadius: "4px",
                            cursor: item.quantity >= item.maxStock ? "not-allowed" : "pointer",
                            opacity: item.quantity >= item.maxStock ? 0.4 : 1,
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
                          padding: 0,
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
                onClick={handleProceedToDetails}
                className="button glow-button"
                style={{ width: "100%", padding: "0.85rem", fontSize: "1rem" }}
              >
                {t.proceedToCheckout} &rarr;
              </button>
              <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#71717a", marginTop: "0.75rem" }}>
                {t.stockHoldNotice}
              </p>
            </div>
          </>
        ) : (
          /* STEP 2: CHECKOUT SHIPPING & PAYMENT FORM */
          <form onSubmit={handleSubmitOrder} style={{ flex: 1, display: "flex", flexDirection: "column", paddingTop: "1rem" }}>
            <div style={{ flex: 1, overflowY: "auto", paddingRight: "0.25rem" }}>
              <button
                type="button"
                onClick={handleBackToCart}
                style={{
                  background: "none",
                  border: "none",
                  color: "#38bdf8",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  marginBottom: "1rem",
                  padding: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
              >
                &larr; Back to Bag ({toNumerals(totalCount)} items)
              </button>

              {errorMessage && (
                <div style={{
                  backgroundColor: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "6px",
                  padding: "0.75rem",
                  color: "#f87171",
                  fontSize: "0.85rem",
                  marginBottom: "1rem",
                }}>
                  {errorMessage}
                </div>
              )}

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.35rem" }}>
                  Your Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tanvir Ahmed"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#fff",
                    fontSize: "0.9rem",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.35rem" }}>
                  Mobile Number (Bangladesh) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="017XXXXXXXX"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#fff",
                    fontSize: "0.9rem",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.35rem" }}>
                  Delivery Address *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="House #, Road #, Area, Landmark"
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "6px",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#fff",
                    fontSize: "0.9rem",
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.35rem" }}>
                  City / District
                </label>
                <select
                  value={shippingCity}
                  onChange={(e) => setShippingCity(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "6px",
                    backgroundColor: "#27272a",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#fff",
                    fontSize: "0.9rem",
                  }}
                >
                  <option value="Dhaka">Dhaka</option>
                  <option value="Chittagong">Chittagong</option>
                  <option value="Sylhet">Sylhet</option>
                  <option value="Rajshahi">Rajshahi</option>
                  <option value="Khulna">Khulna</option>
                  <option value="Barishal">Barishal</option>
                  <option value="Rangpur">Rangpur</option>
                  <option value="Mymensingh">Mymensingh</option>
                </select>
              </div>

              {/* PAYMENT METHOD CHOOSER */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", color: "#d4d4d8", marginBottom: "0.5rem" }}>
                  Payment Method
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {/* SSLCOMMERZ */}
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.75rem",
                      padding: "0.75rem",
                      borderRadius: "6px",
                      border: paymentMethod === "SSLCOMMERZ" ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.1)",
                      backgroundColor: paymentMethod === "SSLCOMMERZ" ? "rgba(56, 189, 248, 0.08)" : "rgba(255,255,255,0.02)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="SSLCOMMERZ"
                      checked={paymentMethod === "SSLCOMMERZ"}
                      onChange={() => setPaymentMethod("SSLCOMMERZ")}
                      style={{ marginTop: "0.25rem" }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "#fff" }}>
                        SSLCommerz (Online / Instant)
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "#a1a1aa", marginTop: "0.15rem" }}>
                        Cards (VISA, Mastercard), bKash, Nagad, Rocket, Upay & Net Banking.
                      </div>
                    </div>
                  </label>

                  {/* CASH ON DELIVERY */}
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.75rem",
                      padding: "0.75rem",
                      borderRadius: "6px",
                      border: paymentMethod === "COD" ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.1)",
                      backgroundColor: paymentMethod === "COD" ? "rgba(56, 189, 248, 0.08)" : "rgba(255,255,255,0.02)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="COD"
                      checked={paymentMethod === "COD"}
                      onChange={() => setPaymentMethod("COD")}
                      style={{ marginTop: "0.25rem" }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "#fff" }}>
                        Cash On Delivery (COD)
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "#a1a1aa", marginTop: "0.15rem" }}>
                        Pay cash when courier delivers the package to your door.
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "1rem", marginTop: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem", fontSize: "1.1rem", fontWeight: 700 }}>
                <span>Order Total</span>
                <span style={{ color: "#38bdf8" }}>{formatMoney(subtotal)}</span>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="button glow-button"
                style={{ width: "100%", padding: "0.85rem", fontSize: "1rem" }}
              >
                {isSubmitting
                  ? "Connecting Gateway..."
                  : paymentMethod === "SSLCOMMERZ"
                  ? `Pay ${formatMoney(subtotal)} via SSLCommerz`
                  : `Confirm COD Order (${formatMoney(subtotal)})`}
              </button>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}
