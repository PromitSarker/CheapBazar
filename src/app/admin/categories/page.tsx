import Link from "next/link";
import { requireRole } from "@/modules/identity/service";
import { servicesEnabled } from "@/lib/bff/client";
import { adminCategoryTree, adminUnfiledProducts, type AdminCategory } from "@/lib/bff/catalogue";
import { CATEGORY_ICONS } from "@/lib/catalogue/icons";
import { createCategory, fileProduct, removeCategory, saveCategory, setCategoryActive } from "./actions";

export const dynamic = "force-dynamic";

const box = { background: "#fff", border: "1px solid #e2e8dc", borderRadius: 14, padding: "1.1rem 1.25rem", marginBottom: "1rem" } as const;
const inp = { padding: "0.5rem 0.65rem", border: "1px solid #c5d0c0", borderRadius: 8, fontSize: "0.9rem", background: "#fff" } as const;
const btn = { padding: "0.5rem 0.9rem", borderRadius: 8, border: "1px solid #c5d0c0", background: "#fff", cursor: "pointer", fontSize: "0.85rem" } as const;
const pill = (bg: string, fg: string) => ({ background: bg, color: fg, padding: "0.1rem 0.55rem", borderRadius: 999, fontSize: "0.75rem", fontWeight: 600 }) as const;

function IconSelect({ value }: { value?: string }) {
  const known = CATEGORY_ICONS.some((i) => i.key === value);
  return (
    <select name="icon" defaultValue={value ?? ""} style={inp} aria-label="Icon">
      {!value && <option value="">Default icon</option>}
      {value && !known && <option value={value}>{value}</option>}
      {CATEGORY_ICONS.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
    </select>
  );
}

function EditRow({ c, isSub }: { c: AdminCategory; isSub: boolean }) {
  const used = c.productCount > 0 || c.children.length > 0;
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", padding: "0.5rem 0", borderTop: isSub ? "1px solid #eaf4ec" : "none", opacity: c.active ? 1 : 0.65 }}>
      <form action={saveCategory} style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap", flex: 1, minWidth: 280 }}>
        <input type="hidden" name="id" value={c.id} />
        <input name="nameEn" defaultValue={c.nameEn} required maxLength={60} placeholder="English name" aria-label="English name" style={{ ...inp, width: isSub ? 170 : 200, fontWeight: isSub ? 400 : 700 }} />
        <input name="nameBn" defaultValue={c.nameBn} maxLength={60} placeholder="বাংলা নাম" aria-label="Bangla name" style={{ ...inp, width: isSub ? 150 : 180 }} />
        {!isSub && <IconSelect value={c.icon} />}
        <input name="sortOrder" type="number" min={0} defaultValue={c.sortOrder} aria-label="Sort order" title="Lower numbers appear first" style={{ ...inp, width: 70 }} />
        <button type="submit" style={btn}>Save</button>
      </form>
      <span style={pill("#eaf4ec", "#4f6159")}>{c.productCount} product{c.productCount === 1 ? "" : "s"}</span>
      {!c.active && <span style={pill("#fef3c7", "#92400e")}>Hidden</span>}
      <form action={setCategoryActive}>
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="active" value={c.active ? "false" : "true"} />
        <button type="submit" style={btn}>{c.active ? "Hide" : "Show"}</button>
      </form>
      <form action={removeCategory}>
        <input type="hidden" name="id" value={c.id} />
        <button type="submit" disabled={used} title={used ? "Only empty categories can be deleted. Hide it instead." : "Delete"} style={{ ...btn, color: used ? "#8a9a92" : "#dc2626", cursor: used ? "not-allowed" : "pointer" }}>Delete</button>
      </form>
    </div>
  );
}

export default async function AdminCategoriesPage({ searchParams }: { searchParams: { error?: string; done?: string } }) {
  await requireRole("ADMIN");
  if (!servicesEnabled()) {
    return (<div><h1>Categories</h1><p className="muted">Categories are part of the new platform and are not enabled yet.</p></div>);
  }
  const [tree, unfiled] = await Promise.all([adminCategoryTree(), adminUnfiledProducts()]);
  const visible = tree.filter((d) => d.active);

  return (
    <div>
      <Link href="/admin" className="muted" style={{ fontSize: "0.85rem", textDecoration: "none" }}>&larr; Admin Overview</Link>
      <h1>Categories</h1>
      <p className="muted">
        You decide the shop&apos;s aisles. Sellers can only pick from this list, and shoppers browse by it in the app. Two levels: a department and its sub-categories.
        Lower sort numbers come first. Hiding a category removes it from the app without touching its products.
      </p>

      {searchParams.error && <p className="error">{searchParams.error}</p>}
      {searchParams.done && <p style={{ color: "#16a34a", marginBottom: "1rem" }}>{searchParams.done}.</p>}

      {unfiled.length > 0 && (
        <div style={{ ...box, borderColor: "#fcd34d", background: "#fffbeb" }}>
          <h3 style={{ margin: "0 0 0.25rem" }}>{unfiled.length} product{unfiled.length === 1 ? "" : "s"} waiting for a category</h3>
          <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.9rem" }}>These do not appear under any department in the app yet. File them here, or ask the seller to edit the product.</p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <tbody>
              {unfiled.map((p) => (
                <tr key={p.id} style={{ borderTop: "1px solid #fde68a" }}>
                  <td style={{ padding: "0.5rem 0.5rem 0.5rem 0" }}><strong>{p.name}</strong><br /><small>{p.storeName} · ৳{p.price.toFixed(2)}</small></td>
                  <td style={{ padding: "0.5rem 0", textAlign: "right" }}>
                    <form action={fileProduct} style={{ display: "inline-flex", gap: "0.4rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <input type="hidden" name="productId" value={p.id} />
                      <input type="hidden" name="storeId" value={p.storeId} />
                      <select name="categoryId" required defaultValue="" style={inp} aria-label={`Category for ${p.name}`}>
                        <option value="">Choose category…</option>
                        {visible.map((d) => (
                          <optgroup key={d.id} label={d.nameEn}>
                            {d.children.filter((c) => c.active).length === 0 && <option value={d.id}>{d.nameEn}</option>}
                            {d.children.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.nameEn}</option>)}
                          </optgroup>
                        ))}
                      </select>
                      <button type="submit" style={btn}>File</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={box}>
        <h3 style={{ margin: "0 0 0.6rem" }}>Add a department</h3>
        <form action={createCategory} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <input name="nameEn" required maxLength={60} placeholder="English name, e.g. Pet Supplies" style={{ ...inp, width: 240 }} />
          <input name="nameBn" maxLength={60} placeholder="বাংলা নাম" style={{ ...inp, width: 180 }} />
          <IconSelect />
          <input name="sortOrder" type="number" min={0} placeholder="Sort" style={{ ...inp, width: 80 }} />
          <button type="submit" style={{ ...btn, background: "#123b32", color: "#fff", borderColor: "#123b32" }}>Add department</button>
        </form>
      </div>

      {tree.map((d) => (
        <div key={d.id} style={box}>
          <EditRow c={d} isSub={false} />
          {d.children.map((s) => <EditRow key={s.id} c={s} isSub />)}
          <form action={createCategory} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center", paddingTop: "0.6rem", borderTop: "1px dashed #e2e8dc", marginTop: "0.4rem" }}>
            <input type="hidden" name="parentId" value={d.id} />
            <input name="nameEn" required maxLength={60} placeholder={`New sub-category in ${d.nameEn}`} style={{ ...inp, width: 240 }} />
            <input name="nameBn" maxLength={60} placeholder="বাংলা নাম" style={{ ...inp, width: 170 }} />
            <button type="submit" style={btn}>+ Add sub-category</button>
          </form>
        </div>
      ))}
    </div>
  );
}
