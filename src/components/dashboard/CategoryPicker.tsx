"use client";

import React, { useMemo, useState } from "react";
import type { CategoryChoice } from "@/lib/catalogue/import";

const sel: React.CSSProperties = { padding: "0.75rem 1rem", background: "#fff", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, color: "#0c2b24", fontSize: "0.95rem", width: "100%" };

/**
 * Department, then sub-category. Submits ONE value (`categoryId`): the sub-category, or the department
 * when it has none. Categories are managed by the platform admin; sellers can only choose.
 */
export default function CategoryPicker({
  categories, defaultValue, language, name = "categoryId", required = true,
}: { categories: CategoryChoice[]; defaultValue?: string | null; language: string; name?: string; required?: boolean }) {
  const bn = language === "bn";
  const label = (c: CategoryChoice) => (bn && c.nameBn ? c.nameBn : c.nameEn);

  const initial = useMemo(() => {
    for (const d of categories) {
      if (d.id === defaultValue) return { dept: d.id, sub: "" };
      if (d.children.some((c) => c.id === defaultValue)) return { dept: d.id, sub: defaultValue as string };
    }
    return { dept: "", sub: "" };
  }, [categories, defaultValue]);
  const [dept, setDept] = useState(initial.dept);
  const [sub, setSub] = useState(initial.sub);

  if (categories.length === 0) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
        {bn ? "ক্যাটাগরি এখন লোড করা যাচ্ছে না। পরে আবার চেষ্টা করুন।" : "Categories could not be loaded right now. Please try again shortly."}
      </p>
    );
  }
  const d = categories.find((c) => c.id === dept);
  const value = d ? (d.children.length > 0 ? sub : d.id) : "";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
      <select
        aria-label={bn ? "বিভাগ" : "Department"}
        value={dept}
        required={required}
        onChange={(e) => { setDept(e.target.value); setSub(""); }}
        style={sel}
      >
        <option value="">{bn ? "বিভাগ বাছাই করুন" : "Choose a department"}</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
      </select>
      <select
        aria-label={bn ? "উপ-ক্যাটাগরি" : "Sub-category"}
        value={sub}
        required={required && !!d && d.children.length > 0}
        disabled={!d || d.children.length === 0}
        onChange={(e) => setSub(e.target.value)}
        style={sel}
      >
        <option value="">{!d ? (bn ? "আগে বিভাগ বাছাই করুন" : "Pick a department first") : d.children.length === 0 ? (bn ? "—" : "—") : (bn ? "উপ-ক্যাটাগরি বাছাই করুন" : "Choose a sub-category")}</option>
        {d?.children.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
      </select>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
