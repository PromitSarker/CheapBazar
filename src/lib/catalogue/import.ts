/**
 * Seller CSV import: header aliases, per-row validation and category matching.
 * Pure functions (no I/O) so they are easy to test; the server action does the creating.
 * Every row is re-validated on commit, and the catalog-service validates again: nothing here is trusted.
 */
import { csvCell, parseCsv } from "./csv";

export const MAX_ROWS = 300;
export const MAX_BYTES = 1_000_000;

export interface CategoryChoice { id: string; nameEn: string; nameBn: string; slug: string; children: CategoryChoice[] }

export const TEMPLATE_HEADERS = ["name", "price", "stock", "category", "brand", "unit", "original_price", "description", "image_url"] as const;
type Field = (typeof TEMPLATE_HEADERS)[number];

const ALIASES: Record<string, Field> = {
  name: "name", "product name": "name", product: "name", title: "name",
  price: "price", "selling price": "price", "sale price": "price",
  stock: "stock", quantity: "stock", qty: "stock",
  category: "category", "category name": "category",
  brand: "brand",
  unit: "unit", "pack size": "unit", size: "unit",
  original_price: "original_price", "original price": "original_price", compare_at_price: "original_price", mrp: "original_price", "was price": "original_price",
  description: "description", details: "description",
  image_url: "image_url", image: "image_url", "image url": "image_url", photo: "image_url",
};

export type RawRow = Partial<Record<Field, string>> & { line: number };

export interface ImportPayload {
  name: string; price: number; stock: number; categoryId: string; brand?: string; unit?: string;
  compareAtPrice?: number; description?: string; image?: string;
}
export interface RowResult { line: number; name: string; ok: boolean; errors: string[]; payload?: ImportPayload; categoryLabel?: string }

/** Header row + data rows -> raw rows keyed by field. Throws a readable error for an unusable file. */
export function readRows(text: string): RawRow[] {
  const table = parseCsv(text);
  if (table.length === 0) throw new Error("The file is empty.");
  const header = table[0].map((h) => ALIASES[h.trim().toLowerCase()] ?? null);
  for (const need of ["name", "price"] as Field[]) {
    if (!header.includes(need)) throw new Error(`The first row must have a "${need}" column. Download the template to see the expected columns.`);
  }
  const data = table.slice(1);
  if (data.length === 0) throw new Error("The file has a header but no products.");
  if (data.length > MAX_ROWS) throw new Error(`Too many rows: ${data.length}. Import at most ${MAX_ROWS} products at a time.`);
  return data.map((cells, i) => {
    const r: RawRow = { line: i + 2 }; // line 1 is the header
    header.forEach((f, c) => { if (f && (cells[c] ?? "").trim() !== "") r[f] = (cells[c] ?? "").trim(); });
    return r;
  });
}

// keep Latin letters, digits and the Bengali block (U+0980-09FF); everything else is a separator
const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\u0980-\u09ff]+/g, " ").trim();

/**
 * "Fruits" -> the sub-category; "Grocery & Food > Fruits" (or "/" or ">") -> exact; "Grocery & Food" -> the department.
 * English name, Bangla name or slug all match. Two matches = ambiguous: the seller must qualify it.
 */
export function matchCategory(tree: CategoryChoice[], text: string): { id: string; label: string } | { error: string } {
  const t = text.trim();
  if (!t) return { error: "category is required" };
  const parts = t.split(/\s*[>/›]\s*/).filter(Boolean);
  const same = (c: CategoryChoice, q: string) => [c.nameEn, c.nameBn, c.slug].some((n) => n && norm(n) === norm(q));

  if (parts.length >= 2) {
    const dept = tree.find((d) => same(d, parts[0]));
    const sub = dept?.children.find((c) => same(c, parts[parts.length - 1]));
    if (dept && sub) return { id: sub.id, label: `${dept.nameEn} › ${sub.nameEn}` };
    return { error: `unknown category "${t}"` };
  }
  const subs = tree.flatMap((d) => d.children.filter((c) => same(c, t)).map((c) => ({ c, d })));
  if (subs.length === 1) return { id: subs[0].c.id, label: `${subs[0].d.nameEn} › ${subs[0].c.nameEn}` };
  if (subs.length > 1) return { error: `"${t}" exists in several departments; write it as "Department > ${t}"` };
  const dept = tree.find((d) => same(d, t));
  if (dept) return { id: dept.id, label: dept.nameEn };
  return { error: `unknown category "${t}"` };
}

const num = (s: string | undefined) => (s === undefined ? NaN : Number(s.replace(/[,৳\s]/g, "")));
const okImage = (u: string) => u.length <= 500 && (/^https:\/\//i.test(u) || u.startsWith("/uploads/"));

export function validateRow(raw: RawRow, tree: CategoryChoice[]): RowResult {
  const errors: string[] = [];
  const name = (raw.name ?? "").trim();
  if (!name) errors.push("name is required");
  else if (name.length > 140) errors.push("name is longer than 140 characters");

  const price = num(raw.price);
  if (!Number.isFinite(price) || price <= 0 || price > 10_000_000) errors.push("price must be a positive number");

  let stock = 10;
  if (raw.stock !== undefined) {
    stock = num(raw.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 10_000_000) errors.push("stock must be a whole number, 0 or more");
  }

  let categoryId = "";
  let categoryLabel: string | undefined;
  const cat = matchCategory(tree, raw.category ?? "");
  if ("error" in cat) errors.push(cat.error); else { categoryId = cat.id; categoryLabel = cat.label; }

  let compareAtPrice: number | undefined;
  if (raw.original_price !== undefined) {
    compareAtPrice = num(raw.original_price);
    if (!Number.isFinite(compareAtPrice) || compareAtPrice <= 0) errors.push("original_price must be a positive number");
    else if (Number.isFinite(price) && compareAtPrice <= price) errors.push("original_price must be higher than price (it is the crossed-out price)");
  }

  if (raw.image_url !== undefined && !okImage(raw.image_url)) errors.push("image_url must start with https:// (or be an existing /uploads/ file)");
  if ((raw.brand ?? "").length > 60) errors.push("brand is longer than 60 characters");
  if ((raw.unit ?? "").length > 30) errors.push("unit is longer than 30 characters");

  if (errors.length) return { line: raw.line, name, ok: false, errors, categoryLabel };
  return {
    line: raw.line, name, ok: true, errors: [], categoryLabel,
    payload: {
      name, price, stock, categoryId,
      ...(raw.brand ? { brand: raw.brand } : {}),
      ...(raw.unit ? { unit: raw.unit } : {}),
      ...(compareAtPrice !== undefined ? { compareAtPrice } : {}),
      ...(raw.description ? { description: raw.description.slice(0, 4000) } : {}),
      ...(raw.image_url ? { image: raw.image_url } : {}),
    },
  };
}

export function validateAll(rows: RawRow[], tree: CategoryChoice[]): RowResult[] {
  return rows.map((r) => validateRow(r, tree));
}

/** The downloadable template: header plus two realistic example rows. */
export function templateCsv(): string {
  const lines = [
    TEMPLATE_HEADERS.join(","),
    ["Red Apple", 80, 25, "Grocery & Food > Fruits & Vegetables", "Orchard", "1 kg", 100, "Fresh and crunchy", ""].map(csvCell).join(","),
    ["Cotton Panjabi", 1450, 8, "Fashion > Men", "", "Size M", "", "", ""].map(csvCell).join(","),
  ];
  return "﻿" + lines.join("\r\n") + "\r\n"; // BOM so Excel opens Bangla text correctly
}
