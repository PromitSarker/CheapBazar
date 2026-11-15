"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/modules/i18n/LanguageContext";
import type { CategoryChoice } from "@/lib/catalogue/import";
import type { ImportState } from "@/app/dashboard/products/import/actions";

type Action = (prev: ImportState, fd: FormData) => Promise<ImportState>;

function Submit({ children, disabled, pending }: { children: React.ReactNode; disabled?: boolean; pending?: boolean }) {
  return (
    <button type="submit" className="button glow-button" disabled={pending || disabled} style={{ padding: "0.7rem 1.5rem", borderRadius: 10, opacity: pending || disabled ? 0.6 : 1 }}>
      {pending ? "…" : children}
    </button>
  );
}

const badge = (bg: string, fg: string): React.CSSProperties => ({ background: bg, color: fg, padding: "0.15rem 0.55rem", borderRadius: 6, fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap" });

export default function ImportView({ categories, previewAction, commitAction }: { categories: CategoryChoice[]; previewAction: Action; commitAction: Action }) {
  const { language, formatMoney } = useLanguage();
  const bn = language === "bn";
  const [state, setState] = React.useState<ImportState>({ stage: "idle" });
  const [done, setDone] = React.useState<ImportState>({ stage: "idle" });
  const [busy, setBusy] = React.useState<"" | "preview" | "commit">("");

  // Server actions can be called straight from an event handler; this keeps "busy" state without extra libraries.
  const run = (kind: "preview" | "commit") => async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    setBusy(kind);
    try {
      if (kind === "preview") { setDone({ stage: "idle" }); setState(await previewAction(state, fd)); }
      else setDone(await commitAction(done, fd));
    } catch {
      (kind === "preview" ? setState : setDone)({ stage: "error", message: "Something went wrong. Please try again." });
    } finally {
      setBusy("");
    }
  };

  const th: React.CSSProperties = { padding: "0.7rem 0.9rem", fontSize: "0.75rem", color: "#71717a", textTransform: "uppercase", textAlign: "left" };
  const td: React.CSSProperties = { padding: "0.7rem 0.9rem", fontSize: "0.88rem", verticalAlign: "top" };

  return (
    <div>
      <Link href="/dashboard/products" className="muted" style={{ fontSize: "0.85rem", textDecoration: "none" }}>&larr; {bn ? "সব পণ্য" : "All products"}</Link>
      <h1 style={{ marginTop: "0.4rem" }}>{bn ? "CSV থেকে পণ্য আমদানি" : "Import products from CSV"}</h1>
      <p className="muted">
        {bn
          ? "একসাথে অনেক পণ্য যোগ করতে চাইলে এটি ব্যবহার করুন। একটি একটি করে যোগ করতে চাইলে সাধারণ ফর্মই থাকছে।"
          : "Handy for adding many products at once. You can always add products one by one with the normal form instead."}
      </p>

      {done.stage === "done" ? (
        <div className="card" style={{ padding: "1.5rem", borderRadius: 16 }}>
          <h3 style={{ marginTop: 0 }}>{bn ? "আমদানি সম্পন্ন" : "Import finished"}</h3>
          <p><strong>{done.created}</strong> {bn ? "টি পণ্য যোগ হয়েছে" : "products added"}{done.skipped > 0 && <> · <strong>{done.skipped}</strong> {bn ? "টি বাদ (আগে থেকেই আছে)" : "skipped (already listed)"}</>}{done.failed.length > 0 && <> · <strong style={{ color: "#dc2626" }}>{done.failed.length}</strong> {bn ? "টি ব্যর্থ" : "failed"}</>}</p>
          {done.failed.length > 0 && (
            <ul style={{ color: "#dc2626", fontSize: "0.9rem" }}>
              {done.failed.map((f) => <li key={f.line}>{bn ? "লাইন" : "Line"} {f.line} ({f.name || "—"}): {f.error}</li>)}
            </ul>
          )}
          <Link href="/dashboard/products" className="button glow-button" style={{ display: "inline-block", marginTop: "0.5rem", padding: "0.7rem 1.5rem", borderRadius: 10 }}>{bn ? "পণ্য দেখুন" : "View products"}</Link>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: "1.5rem", borderRadius: 16, marginBottom: "1.5rem" }}>
            <ol style={{ margin: "0 0 1rem 1.1rem", lineHeight: 1.7 }}>
              <li>
                <a href="/dashboard/products/import/template" download>{bn ? "টেমপ্লেট ডাউনলোড করুন" : "Download the template"}</a>{" "}
                <span className="muted">({bn ? "Excel বা Google Sheets-এ খুলুন" : "open it in Excel or Google Sheets"})</span>
              </li>
              <li>{bn ? "প্রতি সারিতে একটি পণ্য লিখুন। বাধ্যতামূলক: name, price, category।" : "One product per row. Required: name, price, category."}</li>
              <li>{bn ? "CSV হিসেবে সংরক্ষণ করে নিচে আপলোড করুন। আমদানির আগে আপনি প্রিভিউ দেখতে পাবেন।" : "Save as CSV and upload it below. You will see a preview before anything is added."}</li>
            </ol>
            <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 1rem" }}>
              {bn
                ? "ছবির জন্য https:// দিয়ে শুরু হওয়া লিংক দিন (ঐচ্ছিক)। ছবি আপলোড করতে চাইলে আমদানির পর পণ্য সম্পাদনা করুন। সর্বোচ্চ ৩০০টি পণ্য ও ১ MB।"
                : "For photos, give a link starting with https:// (optional); to upload photos, edit the product after importing. Up to 300 products and 1 MB per file."}
            </p>
            <form onSubmit={run("preview")} style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <input type="file" name="file" accept=".csv,text/csv" required />
              <Submit pending={busy === "preview"} disabled={!!busy}>{bn ? "প্রিভিউ দেখুন" : "Check file"}</Submit>
            </form>
          </div>

          {state.stage === "error" && <p className="error">{state.message}</p>}
          {done.stage === "error" && <p className="error">{done.message}</p>}

          {state.stage === "preview" && (
            <div className="card" style={{ padding: 0, borderRadius: 16, overflow: "auto" }}>
              <div style={{ padding: "1rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                <span>
                  <strong>{state.importable}</strong> {bn ? "টি পণ্য আমদানির জন্য প্রস্তুত" : "ready to import"}
                  {state.rows.length - state.importable > 0 && <span className="muted"> · {state.rows.length - state.importable} {bn ? "টি সমস্যা/বাদ" : "need attention or will be skipped"}</span>}
                </span>
                <form onSubmit={run("commit")}>
                  <input type="hidden" name="raw" value={state.raw} />
                  <Submit pending={busy === "commit"} disabled={state.importable === 0 || !!busy}>{bn ? `${state.importable}টি পণ্য আমদানি করুন` : `Import ${state.importable} products`}</Submit>
                </form>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#fafafa" }}><th style={th}>{bn ? "লাইন" : "Line"}</th><th style={th}>{bn ? "পণ্য" : "Product"}</th><th style={th}>{bn ? "ক্যাটাগরি" : "Category"}</th><th style={th}>{bn ? "দাম" : "Price"}</th><th style={th}>{bn ? "অবস্থা" : "Status"}</th></tr></thead>
                <tbody>
                  {state.rows.map((r) => (
                    <tr key={r.line} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                      <td style={td}>{r.line}</td>
                      <td style={td}>{r.name || "—"}</td>
                      <td style={td}>{r.categoryLabel ?? "—"}</td>
                      <td style={td}>{r.payload ? formatMoney(r.payload.price) : "—"}</td>
                      <td style={td}>
                        {r.ok && !r.skip && <span style={badge("#dcfce7", "#166534")}>{bn ? "ঠিক আছে" : "OK"}</span>}
                        {r.ok && r.skip && <span style={badge("#f4f4f5", "#52525b")}>{bn ? "বাদ" : "Skipped"}: {r.skip}</span>}
                        {!r.ok && <div style={{ color: "#b91c1c" }}>{r.errors.map((e, i) => <div key={i}>• {e}</div>)}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <details style={{ marginTop: "1.5rem" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{bn ? "ক্যাটাগরির তালিকা (category কলামে যা লিখবেন)" : "Category names you can use in the category column"}</summary>
            <div style={{ columnWidth: 260, marginTop: "0.75rem", fontSize: "0.9rem" }}>
              {categories.map((d) => (
                <div key={d.id} style={{ breakInside: "avoid", marginBottom: "0.75rem" }}>
                  <strong>{d.nameEn}</strong>{d.nameBn && <span className="muted"> · {d.nameBn}</span>}
                  <ul style={{ margin: "0.2rem 0 0 1rem", padding: 0 }}>{d.children.map((c) => <li key={c.id}>{c.nameEn}{c.nameBn && <span className="muted"> · {c.nameBn}</span>}</li>)}</ul>
                </div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: "0.85rem" }}>{bn ? "দুই বিভাগে একই নাম থাকলে লিখুন: Fashion > Men" : 'If a name exists in two departments, write it as "Fashion > Men".'}</p>
          </details>
        </>
      )}
    </div>
  );
}
