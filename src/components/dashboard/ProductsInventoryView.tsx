"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/modules/i18n/LanguageContext";
import type { CategoryChoice } from "@/lib/catalogue/import";
import ProductFormFields from "./ProductFormFields";

interface ProductItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image: string | null;
  categoryId?: string | null;
  compareAtPrice?: number | null;
}

function categoryLabel(tree: CategoryChoice[], id: string | null | undefined, bn: boolean): string {
  if (!id) return "";
  const n = (c: CategoryChoice) => (bn && c.nameBn ? c.nameBn : c.nameEn);
  for (const d of tree) {
    if (d.id === id) return n(d);
    const s = d.children.find((c) => c.id === id);
    if (s) return `${n(d)} › ${n(s)}`;
  }
  return "";
}

export default function ProductsInventoryView({
  products,
  error,
  message,
  saved,
  categories = [],
  addProductAction,
  adjustStockAction,
  deleteProductAction,
  wholesale = false,
}: {
  wholesale?: boolean;
  products: ProductItem[];
  error?: string;
  message?: string;
  saved?: boolean;
  categories?: CategoryChoice[];
  addProductAction: (formData: FormData) => Promise<void>;
  adjustStockAction: (formData: FormData) => Promise<void>;
  deleteProductAction: (formData: FormData) => Promise<void>;
}) {
  const { t, formatMoney, toNumerals, language } = useLanguage();
  const bn = language === "bn";
  const services = categories.length > 0 || wholesale; // the services platform has categories, editing and import

  const errorText = (e: string) =>
    e === "custom" && message
      ? message
      : e === "wholesale"
      ? bn ? "পাইকারি তথ্য ঠিক করুন: দাম, ন্যূনতম পরিমাণ এবং ডিসকাউন্ট সঙ্গতিপূর্ণ হতে হবে।" : "Please check the wholesale details: the discount must be cheaper than the wholesale price and start above the minimum order."
      : e === "in-use"
      ? bn ? "এই পণ্যটি বিদ্যমান অর্ডারের অংশ, তাই মোছা যাবে না। এর স্টক ০ করে দিন।" : "This product is part of existing orders and cannot be deleted. Set its stock to 0 instead."
      : e === "image"
      ? bn ? "ছবিটি গ্রহণযোগ্য নয়। ৫ MB এর কম PNG, JPEG, GIF বা WebP ছবি দিন।" : "That image was not accepted. Use a PNG, JPEG, GIF or WebP file under 5 MB."
      : bn ? "অনুগ্রহ করে পণ্যের সঠিক নাম এবং বৈধ মূল্য প্রদান করুন।" : "Please provide a valid name and price.";

  const th: React.CSSProperties = { padding: "1rem 1.25rem", color: "#5c6b64", fontWeight: 600, fontSize: "0.8rem", textTransform: "uppercase" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1>{t.inventory}</h1>
          <p className="muted">
            {bn ? "আপনার পণ্যের ক্যাটালগ, মূল্য (টাকায়) এবং ইনভেন্টরি স্টক নিয়ন্ত্রণ করুন।" : "Manage your storefront products, Taka pricing, and active stock levels."}
          </p>
        </div>
        {services && (
          <Link href="/dashboard/products/import" className="button" style={{ background: "#fff", color: "#0c2b24", border: "1px solid rgba(0,0,0,0.15)" }}>
            {bn ? "CSV থেকে আমদানি" : "Import from CSV"}
          </Link>
        )}
      </div>

      {saved && <p style={{ color: "#16a34a", marginBottom: "1rem" }}>{bn ? "পণ্য সংরক্ষিত হয়েছে।" : "Product saved."}</p>}
      {error && <p className="error" style={{ marginBottom: "1rem" }}>{errorText(error)}</p>}

      <div
        className="card"
        style={{ marginBottom: "2.5rem", padding: "1.75rem", background: "var(--surface-muted)", border: "1px solid rgba(0, 0, 0, 0.08)", borderRadius: "20px", boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.04)" }}
      >
        <h3 style={{ margin: "0 0 1.25rem 0", fontSize: "1.1rem", fontWeight: 700, color: "#0c2b24" }}>{t.addProduct}</h3>
        <form action={addProductAction} className="stack" style={{ margin: 0, gap: "1.25rem" }}>
          <ProductFormFields categories={categories} wholesale={wholesale} />
          <button type="submit" className="button glow-button" style={{ alignSelf: "flex-start", padding: "0.75rem 1.75rem", fontSize: "0.95rem", borderRadius: "10px", marginTop: "0.5rem" }}>
            + {t.addProduct}
          </button>
        </form>
      </div>

      {products.length === 0 ? (
        <div className="card" style={{ padding: "3rem 1.5rem", textAlign: "center", background: "var(--surface-muted)", borderRadius: "20px" }}>
          <h3 style={{ margin: "0 0 0.5rem 0", color: "#0c2b24" }}>{bn ? "এখনও কোনো পণ্য নেই" : "No products in inventory"}</h3>
          <p className="muted" style={{ margin: 0 }}>
            {bn ? "উপরের ফর্মটি পূরণ করে প্রথম পণ্য যোগ করুন, অথবা CSV থেকে একসাথে অনেক পণ্য আমদানি করুন।" : "Use the form above to list your first product, or import many at once from a CSV file."}
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "auto", background: "#ffffff", borderRadius: "20px", boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.04)", border: "1px solid rgba(0, 0, 0, 0.08)" }}>
          <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(0, 0, 0, 0.08)", background: "#f3f8f2" }}>
                <th style={th}>{t.productName}</th>
                {services && <th style={th}>{bn ? "ক্যাটাগরি" : "Category"}</th>}
                <th style={th}>{t.priceTaka}</th>
                <th style={th}>{t.stockQty}</th>
                <th style={{ ...th, textAlign: "right" }}>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const cat = categoryLabel(categories, p.categoryId, bn);
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid rgba(0, 0, 0, 0.05)" }}>
                    <td style={{ padding: "1rem 1.25rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        {p.image ? (
                          <img src={p.image} alt={p.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 10, border: "1px solid rgba(0, 0, 0, 0.08)" }} />
                        ) : (
                          <div style={{ width: 48, height: 48, backgroundColor: "#e8efe6", borderRadius: 10 }} />
                        )}
                        <div>
                          <strong style={{ display: "block", color: "#0c2b24", fontSize: "0.95rem" }}>{p.name}</strong>
                          {p.description && <div className="muted small" style={{ fontSize: "0.8rem", marginTop: "0.15rem" }}>{p.description}</div>}
                        </div>
                      </div>
                    </td>
                    {services && (
                      <td style={{ padding: "1rem 1.25rem", fontSize: "0.85rem" }}>
                        {cat || <span style={{ color: "#b45309", background: "#fef3c7", padding: "0.15rem 0.5rem", borderRadius: 6, fontSize: "0.78rem" }}>{bn ? "ক্যাটাগরি নেই" : "No category"}</span>}
                      </td>
                    )}
                    <td style={{ padding: "1rem 1.25rem", fontWeight: 700, color: "#0c2b24", fontSize: "0.95rem" }}>
                      {formatMoney(p.price)}
                      {p.compareAtPrice ? <div className="muted" style={{ fontWeight: 400, fontSize: "0.78rem", textDecoration: "line-through" }}>{formatMoney(p.compareAtPrice)}</div> : null}
                    </td>
                    <td style={{ padding: "1rem 1.25rem" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                        <span className={p.stock === 0 ? "stock-badge out" : p.stock < 5 ? "stock-badge low" : "stock-badge ok"}>{toNumerals(p.stock)}</span>
                        <form action={adjustStockAction} style={{ display: "inline" }}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="delta" value={-1} />
                          <button type="submit" className="mini-button" aria-label="decrease stock">−</button>
                        </form>
                        <form action={adjustStockAction} style={{ display: "inline" }}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="delta" value={1} />
                          <button type="submit" className="mini-button" aria-label="increase stock">+</button>
                        </form>
                      </div>
                    </td>
                    <td style={{ padding: "1rem 1.25rem", textAlign: "right", whiteSpace: "nowrap" }}>
                      {services && (
                        <Link href={`/dashboard/products/${encodeURIComponent(p.id)}`} style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem", borderRadius: 6, background: "rgba(0,0,0,0.05)", color: "#0c2b24", textDecoration: "none", marginRight: "0.5rem", fontWeight: 500 }}>
                          {bn ? "সম্পাদনা" : "Edit"}
                        </Link>
                      )}
                      <form action={deleteProductAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="link-button danger" style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem", borderRadius: 6, backgroundColor: "rgba(239, 68, 68, 0.08)", color: "#dc2626", border: "none", fontWeight: 500, cursor: "pointer" }}>
                          {bn ? "মুছে ফেলুন" : "Delete"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
