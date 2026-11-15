"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/tenant";
import { servicesEnabled } from "@/lib/bff/client";
import { createProductViaServices } from "@/lib/bff/portal";
import { categoryChoices, existingProductNames } from "@/lib/bff/catalogue";
import { MAX_BYTES, MAX_ROWS, readRows, validateRow, type RawRow, type RowResult } from "@/lib/catalogue/import";

export interface PreviewRow extends RowResult { skip?: string }
export type ImportState =
  | { stage: "idle" }
  | { stage: "error"; message: string }
  | { stage: "preview"; rows: PreviewRow[]; raw: string; importable: number }
  | { stage: "done"; created: number; skipped: number; failed: { line: number; name: string; error: string }[] };

const FIELDS = ["name", "price", "stock", "category", "brand", "unit", "original_price", "description", "image_url"] as const;

/** Re-validates rows against the live category tree and the shop's existing products. Nothing from the browser is trusted. */
async function evaluate(storeId: string, rows: RawRow[]): Promise<PreviewRow[]> {
  const [tree, existing] = await Promise.all([categoryChoices(), existingProductNames(storeId)]);
  const seen = new Set<string>();
  return rows.map((raw) => {
    const r: PreviewRow = validateRow(raw, tree);
    if (r.ok) {
      const key = r.name.toLowerCase();
      if (existing.has(key)) r.skip = "already in your shop";
      else if (seen.has(key)) r.skip = "repeated in this file";
      seen.add(key);
    }
    return r;
  });
}

export async function previewImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const store = await requireStore();
  if (!servicesEnabled()) return { stage: "error", message: "Import is not available yet." };
  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) return { stage: "error", message: "Choose a CSV file first." };
  if (file.size > MAX_BYTES) return { stage: "error", message: "That file is larger than 1 MB. Split it into smaller files." };
  let rows: RawRow[];
  try {
    rows = readRows(await file.text());
  } catch (e) {
    return { stage: "error", message: e instanceof Error ? e.message : "Could not read that file." };
  }
  const result = await evaluate(store.id, rows);
  return { stage: "preview", rows: result, raw: JSON.stringify(rows), importable: result.filter((r) => r.ok && !r.skip).length };
}

export async function commitImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const store = await requireStore();
  if (!servicesEnabled()) return { stage: "error", message: "Import is not available yet." };

  let rows: RawRow[];
  try {
    const text = String(formData.get("raw") ?? "");
    if (text.length > 2_000_000) throw new Error("too big");
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_ROWS) throw new Error("bad rows");
    rows = parsed.map((p: any, i: number) => {
      const r: RawRow = { line: Number.isInteger(p?.line) ? p.line : i + 2 };
      for (const f of FIELDS) if (typeof p?.[f] === "string") r[f] = p[f].slice(0, 4100);
      return r;
    });
  } catch {
    return { stage: "error", message: "The preview expired. Please upload the file again." };
  }

  const evaluated = await evaluate(store.id, rows);
  let created = 0;
  let skipped = 0;
  const failed: { line: number; name: string; error: string }[] = [];
  for (const r of evaluated) {
    if (!r.ok) { failed.push({ line: r.line, name: r.name, error: r.errors.join("; ") }); continue; }
    if (r.skip) { skipped++; continue; }
    const res = await createProductViaServices(store.id, { ...r.payload });
    if (res.ok) created++;
    else failed.push({ line: r.line, name: r.name, error: res.error });
  }
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");
  return { stage: "done", created, skipped, failed };
}
