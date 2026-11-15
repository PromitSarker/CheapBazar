"use client";

import React from "react";
import { useLanguage } from "@/modules/i18n/LanguageContext";
import type { CategoryChoice } from "@/lib/catalogue/import";
import CategoryPicker from "./CategoryPicker";
import ImagePicker from "./ImagePicker";

export interface ProductInitial {
  name?: string; description?: string; price?: number; compareAtPrice?: number | null; stock?: number;
  categoryId?: string | null; brand?: string; unit?: string; images?: string[];
  channel?: string; moq?: number; wholesalePrice?: number | null; tiers?: { minQty: number; unitPrice: number }[];
}

const input: React.CSSProperties = { padding: "0.75rem 1rem", background: "#fff", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, color: "#09090b", fontSize: "0.95rem", width: "100%" };
const lab: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.4rem" };
const cap: React.CSSProperties = { fontSize: "0.85rem", fontWeight: 600, color: "#27272a" };
const hint: React.CSSProperties = { fontSize: "0.78rem", color: "#71717a", fontWeight: 400 };

/** Every manual-entry field for a product. Used by "Add product" and by the edit page. */
export default function ProductFormFields({ categories, wholesale, initial = {} }: { categories: CategoryChoice[]; wholesale: boolean; initial?: ProductInitial }) {
  const { t, language } = useLanguage();
  const bn = language === "bn";
  const tier = initial.tiers?.[0];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem" }}>
      <label style={lab}>
        <span style={cap}>{t.productName} <span style={{ color: "#ef4444" }}>*</span></span>
        <input name="name" required maxLength={140} defaultValue={initial.name} placeholder={bn ? "যেমন: বাটার ক্রোয়েসাঁ" : "e.g., Artisan Butter Croissant"} style={input} />
      </label>

      <div style={{ ...lab, gridColumn: "1 / -1" }}>
        <span style={cap}>{bn ? "ক্যাটাগরি" : "Category"} <span style={{ color: "#ef4444" }}>*</span> <span style={hint}>{bn ? "— ক্রেতারা এখান থেকেই আপনার পণ্য খুঁজে পাবেন" : "— this is how shoppers find your product"}</span></span>
        <CategoryPicker categories={categories} defaultValue={initial.categoryId} language={language} />
      </div>

      <label style={lab}>
        <span style={cap}>{t.priceTaka} <span style={{ color: "#ef4444" }}>*</span></span>
        <input name="price" type="number" step="0.01" min="0.01" required defaultValue={initial.price} placeholder={bn ? "২২০" : "220"} style={input} />
      </label>

      <label style={lab}>
        <span style={cap}>{bn ? "আগের দাম (কাটা দাম)" : "Original price"} <span style={hint}>{bn ? "ঐচ্ছিক — ছাড় দেখাতে" : "optional, shows a discount"}</span></span>
        <input name="compareAtPrice" type="number" step="0.01" min="0" defaultValue={initial.compareAtPrice ?? ""} placeholder={bn ? "বিক্রয়মূল্যের চেয়ে বেশি" : "higher than the selling price"} style={input} />
      </label>

      <label style={lab}>
        <span style={cap}>{t.stockQty} <span style={{ color: "#ef4444" }}>*</span></span>
        <input name="stock" type="number" min="0" step="1" defaultValue={initial.stock ?? 10} style={input} />
      </label>

      <label style={lab}>
        <span style={cap}>{bn ? "ব্র্যান্ড" : "Brand"} <span style={hint}>{bn ? "ঐচ্ছিক" : "optional"}</span></span>
        <input name="brand" maxLength={60} defaultValue={initial.brand} style={input} />
      </label>

      <label style={lab}>
        <span style={cap}>{bn ? "প্যাক সাইজ / একক" : "Pack size / unit"} <span style={hint}>{bn ? "যেমন: ৫০০ গ্রাম, সাইজ M" : "e.g. 500 g, Size M"}</span></span>
        <input name="unit" maxLength={30} defaultValue={initial.unit} style={input} />
      </label>

      <div style={{ ...lab, gridColumn: "1 / -1" }}>
        <span style={cap}>{bn ? "পণ্যের ছবি" : "Photos"}</span>
        <ImagePicker existing={initial.images ?? []} language={language} />
      </div>

      <label style={{ ...lab, gridColumn: "1 / -1" }}>
        <span style={cap}>{t.productDesc}</span>
        <textarea name="description" rows={3} maxLength={4000} defaultValue={initial.description} style={{ ...input, resize: "vertical", fontFamily: "inherit" }}
          placeholder={bn ? "যেমন: খাঁটি ফ্রেঞ্চ বাটার দিয়ে তৈরি ক্রিস্পি ও সুস্বাদু ক্রোয়েসাঁ।" : "e.g., Laminated for 72 hours with European cultured butter."} />
      </label>

      {wholesale && (
        <fieldset style={{ gridColumn: "1 / -1", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, padding: "0.9rem 1rem", display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <legend style={{ ...cap, padding: "0 0.4rem" }}>{bn ? "পাইকারি (Buyer Pro ক্রেতাদের জন্য)" : "Wholesale (for Buyer Pro members)"}</legend>
          <label style={{ ...lab, gap: "0.3rem", fontSize: "0.85rem" }}>
            {bn ? "বিক্রয় চ্যানেল" : "Sold as"}
            <select name="channel" defaultValue={initial.channel ?? "RETAIL"} style={{ padding: "0.6rem", borderRadius: 8 }}>
              <option value="RETAIL">{bn ? "শুধু খুচরা" : "Retail only"}</option>
              <option value="BOTH">{bn ? "খুচরা ও পাইকারি" : "Retail and wholesale"}</option>
              <option value="WHOLESALE">{bn ? "শুধু পাইকারি" : "Wholesale only"}</option>
            </select>
          </label>
          <label style={{ ...lab, gap: "0.3rem", fontSize: "0.85rem" }}>
            {bn ? "পাইকারি দাম (প্রতি একক)" : "Wholesale price (each)"}
            <input name="wholesalePrice" type="number" min="0" step="0.01" defaultValue={initial.wholesalePrice ?? ""} style={{ padding: "0.6rem", borderRadius: 8 }} />
          </label>
          <label style={{ ...lab, gap: "0.3rem", fontSize: "0.85rem" }}>
            {bn ? "সর্বনিম্ন অর্ডার (MOQ)" : "Minimum order (MOQ)"}
            <input name="moq" type="number" min="1" defaultValue={initial.moq ?? 1} style={{ padding: "0.6rem", borderRadius: 8 }} />
          </label>
          <label style={{ ...lab, gap: "0.3rem", fontSize: "0.85rem" }}>
            {bn ? "ডিসকাউন্ট: কমপক্ষে (ঐচ্ছিক)" : "Volume discount from qty (optional)"}
            <input name="tierQty" type="number" min="2" defaultValue={tier?.minQty ?? ""} style={{ padding: "0.6rem", borderRadius: 8 }} />
          </label>
          <label style={{ ...lab, gap: "0.3rem", fontSize: "0.85rem" }}>
            {bn ? "ডিসকাউন্ট দাম (প্রতি একক)" : "Discounted price (each)"}
            <input name="tierPrice" type="number" min="0" step="0.01" defaultValue={tier?.unitPrice ?? ""} style={{ padding: "0.6rem", borderRadius: 8 }} />
          </label>
        </fieldset>
      )}
    </div>
  );
}
