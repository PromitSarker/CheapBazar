"use client";

import React, { useState, useRef } from "react";
import { useLanguage } from "@/modules/i18n/LanguageContext";

interface ProductItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image: string | null;
}

export default function ProductsInventoryView({
  products,
  error,
  addProductAction,
  adjustStockAction,
  deleteProductAction,
}: {
  products: ProductItem[];
  error?: string;
  addProductAction: (formData: FormData) => Promise<void>;
  adjustStockAction: (formData: FormData) => Promise<void>;
  deleteProductAction: (formData: FormData) => Promise<void>;
}) {
  const { t, formatMoney, toNumerals, language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileSize, setSelectedFileSize] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
      setSelectedFileName(file.name);
      const sizeKb = (file.size / 1024).toFixed(0);
      setSelectedFileSize(
        file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${sizeKb} KB`
      );
    } else {
      clearFile();
    }
  };

  const clearFile = () => {
    setPreviewUrl(null);
    setSelectedFileName(null);
    setSelectedFileSize(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1>{t.inventory}</h1>
          <p className="muted">
            {language === "bn"
              ? "আপনার পণ্যের ক্যাটালগ, মূল্য (টাকায়) এবং ইনভেন্টরি স্টক নিয়ন্ত্রণ করুন।"
              : "Manage your storefront products, Taka pricing, and active stock levels."}
          </p>
        </div>
      </div>

      {error && (
        <p className="error" style={{ marginBottom: "1rem" }}>
          {language === "bn"
            ? "অনুগ্রহ করে পণ্যের সঠিক নাম এবং বৈধ মূল্য প্রদান করুন।"
            : "Please provide a valid name and price."}
        </p>
      )}

      {/* Modern Product Creation Card */}
      <div
        className="card"
        style={{
          marginBottom: "2.5rem",
          padding: "1.75rem",
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(0, 0, 0, 0.08)",
          borderRadius: "20px",
          boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
          <span style={{ fontSize: "1.2rem" }}>✨</span>
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#09090b" }}>
            {t.addProduct}
          </h3>
        </div>

        <form action={addProductAction} className="stack" style={{ margin: 0, gap: "1.25rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            {/* Product Name */}
            <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#27272a" }}>
                {t.productName} <span style={{ color: "#ef4444" }}>*</span>
              </span>
              <input
                name="name"
                placeholder={language === "bn" ? "যেমন: বাটার ক্রোয়েসাঁ" : "e.g., Artisan Butter Croissant"}
                required
                style={{
                  padding: "0.75rem 1rem",
                  background: "#ffffff",
                  border: "1px solid rgba(0, 0, 0, 0.12)",
                  borderRadius: "10px",
                  color: "#09090b",
                  fontSize: "0.95rem",
                }}
              />
            </label>

            {/* Price (Taka) */}
            <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#27272a" }}>
                {t.priceTaka} <span style={{ color: "#ef4444" }}>*</span>
              </span>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <span
                  style={{
                    position: "absolute",
                    left: "1rem",
                    color: "#71717a",
                    fontWeight: 600,
                    fontSize: "0.95rem",
                    pointerEvents: "none",
                  }}
                >
                  ৳
                </span>
                <input
                  name="price"
                  type="number"
                  step="1"
                  min="0"
                  placeholder={language === "bn" ? "২২০" : "220"}
                  required
                  style={{
                    padding: "0.75rem 1rem 0.75rem 2.2rem",
                    background: "#ffffff",
                    border: "1px solid rgba(0, 0, 0, 0.12)",
                    borderRadius: "10px",
                    color: "#09090b",
                    fontSize: "0.95rem",
                    width: "100%",
                  }}
                />
              </div>
            </label>

            {/* Stock Quantity */}
            <label style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#27272a" }}>
                {t.stockQty} <span style={{ color: "#ef4444" }}>*</span>
              </span>
              <input
                name="stock"
                type="number"
                min="0"
                step="1"
                placeholder="20"
                defaultValue={10}
                style={{
                  padding: "0.75rem 1rem",
                  background: "#ffffff",
                  border: "1px solid rgba(0, 0, 0, 0.12)",
                  borderRadius: "10px",
                  color: "#09090b",
                  fontSize: "0.95rem",
                }}
              />
            </label>

            {/* Custom Image Upload Field */}
            <div className="custom-file-upload">
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#27272a" }}>
                {language === "bn" ? "পণ্যের ছবি" : "Product Image"}
              </span>

              {/* Hidden Native File Input */}
              <input
                ref={fileInputRef}
                name="image"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />

              {/* Custom Uploader Trigger or Preview */}
              {!previewUrl ? (
                <div
                  className="file-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  title={language === "bn" ? "ছবি আপলোড করতে ক্লিক করুন" : "Click to upload an image"}
                >
                  <div className="file-dropzone-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                    </svg>
                  </div>
                  <div>
                    <span className="file-dropzone-text">
                      {language === "bn" ? "ছবি নির্বাচন করুন" : "Upload Image"}
                    </span>
                    <span className="file-dropzone-sub" style={{ display: "block" }}>
                      {language === "bn" ? "পিএনজি, জেপিজি বা ওয়েবপি" : "PNG, JPG, or WebP"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="file-preview-card">
                  <img src={previewUrl} alt="Preview" className="file-preview-img" />
                  <div className="file-preview-meta">
                    <span className="file-preview-name">{selectedFileName}</span>
                    <span className="file-preview-size">{selectedFileSize}</span>
                  </div>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="file-remove-btn"
                    title={language === "bn" ? "ছবি বাতিল করুন" : "Remove Image"}
                  >
                    {language === "bn" ? "মুছুন" : "Remove"}
                  </button>
                </div>
              )}
            </div>

            {/* Description */}
            <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#27272a" }}>
                {t.productDesc}
              </span>
              <input
                name="description"
                placeholder={
                  language === "bn"
                    ? "যেমন: খাঁটি ফ্রেঞ্চ বাটার দিয়ে তৈরি ক্রিস্পি ও সুস্বাদু ক্রোয়েসাঁ।"
                    : "e.g., Laminated for 72 hours with European cultured butter."
                }
                style={{
                  padding: "0.75rem 1rem",
                  background: "#ffffff",
                  border: "1px solid rgba(0, 0, 0, 0.12)",
                  borderRadius: "10px",
                  color: "#09090b",
                  fontSize: "0.95rem",
                }}
              />
            </label>
          </div>

          <button
            type="submit"
            className="button glow-button"
            style={{
              alignSelf: "flex-start",
              padding: "0.75rem 1.75rem",
              fontSize: "0.95rem",
              borderRadius: "10px",
              marginTop: "0.5rem",
            }}
          >
            + {t.addProduct}
          </button>
        </form>
      </div>

      {/* Products Table */}
      {products.length === 0 ? (
        <div
          className="card"
          style={{
            padding: "3rem 1.5rem",
            textAlign: "center",
            background: "rgba(255, 255, 255, 0.7)",
            borderRadius: "20px",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📦</div>
          <h3 style={{ margin: "0 0 0.5rem 0", color: "#09090b" }}>
            {language === "bn" ? "এখনও কোনো পণ্য নেই" : "No products in inventory"}
          </h3>
          <p className="muted" style={{ margin: 0 }}>
            {language === "bn"
              ? "উপরের ফর্মটি পূরণ করে আপনার স্টোরে প্রথম পণ্য যোগ করুন।"
              : "Use the form above to list your first product in Bangladeshi Taka."}
          </p>
        </div>
      ) : (
        <div
          className="card"
          style={{
            padding: 0,
            overflow: "hidden",
            background: "#ffffff",
            borderRadius: "20px",
            boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.04)",
            border: "1px solid rgba(0, 0, 0, 0.08)",
          }}
        >
          <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(0, 0, 0, 0.08)", background: "#fafafa" }}>
                <th style={{ padding: "1rem 1.25rem", color: "#71717a", fontWeight: 600, fontSize: "0.8rem", textTransform: "uppercase" }}>
                  {t.productName}
                </th>
                <th style={{ padding: "1rem 1.25rem", color: "#71717a", fontWeight: 600, fontSize: "0.8rem", textTransform: "uppercase" }}>
                  {t.priceTaka}
                </th>
                <th style={{ padding: "1rem 1.25rem", color: "#71717a", fontWeight: 600, fontSize: "0.8rem", textTransform: "uppercase" }}>
                  {t.stockQty}
                </th>
                <th style={{ padding: "1rem 1.25rem", textAlign: "right", color: "#71717a", fontWeight: 600, fontSize: "0.8rem", textTransform: "uppercase" }}>
                  {t.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid rgba(0, 0, 0, 0.05)" }}>
                  <td style={{ padding: "1rem 1.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.name}
                          style={{
                            width: "48px",
                            height: "48px",
                            objectFit: "cover",
                            borderRadius: "10px",
                            border: "1px solid rgba(0, 0, 0, 0.08)",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            backgroundColor: "#f4f4f5",
                            borderRadius: "10px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#71717a",
                            fontSize: "1.3rem",
                          }}
                        >
                          🥐
                        </div>
                      )}
                      <div>
                        <strong style={{ display: "block", color: "#09090b", fontSize: "0.95rem" }}>{p.name}</strong>
                        {p.description && <div className="muted small" style={{ fontSize: "0.8rem", marginTop: "0.15rem" }}>{p.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "1rem 1.25rem", fontWeight: 700, color: "#09090b", fontSize: "0.95rem" }}>
                    {formatMoney(p.price)}
                  </td>
                  <td style={{ padding: "1rem 1.25rem" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                      <span
                        className={
                          p.stock === 0 ? "stock-badge out" : p.stock < 5 ? "stock-badge low" : "stock-badge ok"
                        }
                      >
                        {toNumerals(p.stock)}
                      </span>
                      <form action={adjustStockAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="delta" value={-1} />
                        <button type="submit" className="mini-button" aria-label="decrease stock">
                          −
                        </button>
                      </form>
                      <form action={adjustStockAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="delta" value={1} />
                        <button type="submit" className="mini-button" aria-label="increase stock">
                          +
                        </button>
                      </form>
                    </div>
                  </td>
                  <td style={{ padding: "1rem 1.25rem", textAlign: "right" }}>
                    <form action={deleteProductAction} style={{ display: "inline" }}>
                      <input type="hidden" name="id" value={p.id} />
                      <button
                        type="submit"
                        className="link-button danger"
                        style={{
                          fontSize: "0.85rem",
                          padding: "0.4rem 0.8rem",
                          borderRadius: "6px",
                          backgroundColor: "rgba(239, 68, 68, 0.08)",
                          color: "#dc2626",
                          border: "none",
                          fontWeight: 500,
                          cursor: "pointer",
                        }}
                      >
                        {language === "bn" ? "মুছে ফেলুন" : "Delete"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
