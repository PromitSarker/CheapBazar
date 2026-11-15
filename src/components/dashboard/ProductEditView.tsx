"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/modules/i18n/LanguageContext";
import type { CategoryChoice } from "@/lib/catalogue/import";
import ProductFormFields, { type ProductInitial } from "./ProductFormFields";

export default function ProductEditView({
  id, initial, categories, wholesale, action, error, message,
}: { id: string; initial: ProductInitial; categories: CategoryChoice[]; wholesale: boolean; action: (fd: FormData) => Promise<void>; error?: string; message?: string }) {
  const { language } = useLanguage();
  const bn = language === "bn";
  return (
    <div>
      <Link href="/dashboard/products" className="muted" style={{ fontSize: "0.85rem", textDecoration: "none" }}>&larr; {bn ? "সব পণ্য" : "All products"}</Link>
      <h1 style={{ marginTop: "0.4rem" }}>{bn ? "পণ্য সম্পাদনা" : "Edit product"}</h1>
      {error && (
        <p className="error" style={{ marginBottom: "1rem" }}>
          {error === "custom" && message ? message : error === "image"
            ? (bn ? "ছবিটি গ্রহণযোগ্য নয়। ৫ MB এর কম PNG, JPEG, GIF বা WebP ছবি দিন।" : "That image was not accepted. Use a PNG, JPEG, GIF or WebP file under 5 MB.")
            : (bn ? "অনুগ্রহ করে পণ্যের সঠিক নাম এবং বৈধ মূল্য দিন।" : "Please provide a valid name and price.")}
        </p>
      )}
      <div className="card" style={{ padding: "1.75rem", background: "var(--surface-muted)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 20 }}>
        <form action={action} className="stack" style={{ margin: 0, gap: "1.25rem" }}>
          <input type="hidden" name="id" value={id} />
          <ProductFormFields categories={categories} wholesale={wholesale} initial={initial} />
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button type="submit" className="button glow-button" style={{ padding: "0.75rem 1.75rem", borderRadius: 10 }}>{bn ? "সংরক্ষণ করুন" : "Save changes"}</button>
            <Link href="/dashboard/products" className="button" style={{ background: "#fff", color: "#09090b", border: "1px solid rgba(0,0,0,0.15)", padding: "0.75rem 1.5rem", borderRadius: 10 }}>{bn ? "বাতিল" : "Cancel"}</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
