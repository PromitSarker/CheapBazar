"use client";

import React, { useState } from "react";

/** One-click-open wholesale order form for an unlocked product (COD; the service enforces MOQ, caps and Pro). */
export default function WholesaleOrder({
  storeSlug, productId, moq, productName,
}: { storeSlug: string; productId: string; moq: number; productName: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; href?: string } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          storeSlug, orderType: "WHOLESALE", paymentMethod: "COD",
          buyerName: f.get("name"), buyerPhone: f.get("phone"), buyerEmail: f.get("email") || undefined,
          shippingAddress: f.get("address"), shippingCity: f.get("city") || "Dhaka",
          items: [{ id: productId, quantity: Number(f.get("qty")) }],
        }),
      });
      const j = await res.json();
      if (!res.ok) setMsg({ ok: false, text: j.error || "Could not place the order." });
      else setMsg({ ok: true, text: `Order ${j.orderNumber} placed.`, href: j.redirectUrl });
    } catch {
      setMsg({ ok: false, text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button type="button" className="button button-small glow-button" onClick={() => setOpen(true)}>Order wholesale</button>;
  const box = { padding: "0.45rem 0.6rem", borderRadius: 6, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "inherit", width: "100%" } as const;
  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "0.4rem", marginTop: "0.5rem" }} aria-label={`Wholesale order for ${productName}`}>
      <input style={box} name="qty" type="number" min={moq} defaultValue={moq} required aria-label={`Quantity (minimum ${moq})`} />
      <input style={box} name="name" placeholder="Your name" required />
      <input style={box} name="phone" placeholder="Phone (01XXXXXXXXX)" required />
      <input style={box} name="email" type="email" placeholder="Email (optional)" />
      <input style={box} name="address" placeholder="Delivery address" required />
      <input style={box} name="city" placeholder="City" defaultValue="Dhaka" />
      <button type="submit" className="button button-small glow-button" disabled={busy}>{busy ? "Placing…" : "Place wholesale order (Cash on Delivery)"}</button>
      {msg && (
        <p className={msg.ok ? "success" : "error"} style={{ margin: 0 }}>
          {msg.text} {msg.href && <a href={msg.href}>View order</a>}
        </p>
      )}
    </form>
  );
}
