import { HttpError } from "../../../packages/service-kit";
import type { Db, Runner } from "./db";

/**
 * Admin-only, two-level category tree (top-level + sub-category).
 * Sellers can only PICK a category; only the platform admin can create/rename/hide/delete.
 * A category's parent never changes after creation, which keeps the denormalised
 * `Product.parentCategoryId` (used for fast filtering in the search index) always correct.
 */

export interface CategoryNode {
  id: string;
  parentId: string | null;
  slug: string;
  nameEn: string;
  nameBn: string;
  icon: string;
  sortOrder: number;
  active: boolean;
  /** Admin tree only: products filed directly here (sub-category) or anywhere beneath (department). */
  productCount?: number;
  children: CategoryNode[];
}

const ICON_RE = /^[a-z0-9_]{1,40}$/;
const slugify = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const node = (c: any): CategoryNode => ({
  id: c.id, parentId: c.parentId, slug: c.slug, nameEn: c.nameEn, nameBn: c.nameBn, icon: c.icon,
  sortOrder: c.sortOrder, active: c.active, children: [],
});

/** The tree. Public callers get active categories only (a hidden parent hides its children too). */
export async function categoryTree(db: Runner, opts: { includeInactive?: boolean } = {}): Promise<CategoryNode[]> {
  const rows = await db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] });
  const all = rows.map(node);
  const byId = new Map(all.map((c) => [c.id, c]));
  const roots: CategoryNode[] = [];
  for (const c of all) {
    const parent = c.parentId ? byId.get(c.parentId) : null;
    if (parent) parent.children.push(c);
    else if (!c.parentId) roots.push(c);
  }
  if (opts.includeInactive) {
    // The admin screen shows how many products each category holds (and so whether it can be deleted).
    const rows = await db.product.groupBy({ by: ["categoryId"], where: { categoryId: { not: null } }, _count: { _all: true } });
    const direct = new Map(rows.map((r) => [r.categoryId as string, r._count._all]));
    for (const top of roots) {
      let sum = direct.get(top.id) ?? 0;
      for (const sub of top.children) {
        sub.productCount = direct.get(sub.id) ?? 0;
        sum += sub.productCount;
      }
      top.productCount = sum;
    }
    return roots;
  }
  return roots.filter((r) => r.active).map((r) => ({ ...r, children: r.children.filter((c) => c.active) }));
}

function cleanName(v: unknown, label: string, required: boolean): string {
  const s = String(v ?? "").trim();
  if (required && !s) throw new HttpError(400, `${label} is required.`, "VALIDATION");
  if (s.length > 60) throw new HttpError(400, `${label} must be at most 60 characters.`, "VALIDATION");
  return s;
}
function cleanIcon(v: unknown, fallback: string): string {
  if (v === undefined || v === null || v === "") return fallback;
  const s = String(v);
  if (!ICON_RE.test(s)) throw new HttpError(400, "icon must be a lowercase icon key like local_grocery_store.", "VALIDATION");
  return s;
}
function cleanSort(v: unknown, fallback: number): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100_000) throw new HttpError(400, "sortOrder must be a whole number 0 to 100000.", "VALIDATION");
  return n;
}

async function uniqueSlug(db: Runner, base: string): Promise<string> {
  const root = base || "category";
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? root : `${root}-${i + 1}`;
    if (!(await db.category.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  throw new HttpError(409, "Could not generate a unique slug; pick a different name.", "CONFLICT");
}

export async function createCategory(db: Runner, body: any): Promise<CategoryNode> {
  const nameEn = cleanName(body.nameEn, "nameEn", true);
  const nameBn = cleanName(body.nameBn, "nameBn", false);
  let parentId: string | null = null;
  if (body.parentId) {
    const parent = await db.category.findUnique({ where: { id: String(body.parentId) } });
    if (!parent) throw new HttpError(400, "Parent category not found.", "VALIDATION");
    if (parent.parentId) throw new HttpError(400, "Categories are two levels deep: a sub-category cannot have children.", "VALIDATION");
    parentId = parent.id;
  }
  let slug = body.slug ? slugify(String(body.slug)) : slugify(nameEn);
  if (body.slug && !slug) throw new HttpError(400, "slug has no usable characters.", "VALIDATION");
  if (body.slug && (await db.category.findUnique({ where: { slug }, select: { id: true } }))) {
    throw new HttpError(409, "That slug is already used.", "CONFLICT");
  }
  if (!body.slug) slug = await uniqueSlug(db, slug);
  const c = await db.category.create({
    data: { parentId, slug, nameEn, nameBn, icon: cleanIcon(body.icon, parentId ? "label_outline" : "category"), sortOrder: cleanSort(body.sortOrder, 0) },
  });
  return node(c);
}

export async function updateCategory(db: Runner, id: string, body: any): Promise<CategoryNode> {
  const cur = await db.category.findUnique({ where: { id } });
  if (!cur) throw new HttpError(404, "Category not found", "NOT_FOUND");
  if (body.parentId !== undefined && (body.parentId || null) !== cur.parentId) {
    throw new HttpError(400, "A category cannot be moved to another parent. Create a new one and re-assign its products.", "VALIDATION");
  }
  const c = await db.category.update({
    where: { id },
    data: {
      nameEn: body.nameEn === undefined ? undefined : cleanName(body.nameEn, "nameEn", true),
      nameBn: body.nameBn === undefined ? undefined : cleanName(body.nameBn, "nameBn", false),
      icon: body.icon === undefined ? undefined : cleanIcon(body.icon, cur.icon),
      sortOrder: body.sortOrder === undefined ? undefined : cleanSort(body.sortOrder, cur.sortOrder),
      active: body.active === undefined ? undefined : body.active === true,
    },
  });
  return node(c);
}

export async function deleteCategory(db: Runner, id: string) {
  const cur = await db.category.findUnique({ where: { id } });
  if (!cur) throw new HttpError(404, "Category not found", "NOT_FOUND");
  const [kids, prods] = await Promise.all([db.category.count({ where: { parentId: id } }), db.product.count({ where: { OR: [{ categoryId: id }, { parentCategoryId: id }] } })]);
  if (kids > 0 || prods > 0) {
    throw new HttpError(409, "This category still has sub-categories or products. Hide it instead (active=false).", "IN_USE");
  }
  await db.category.delete({ where: { id } });
  return { success: true };
}

/** Validate the category a seller picked and return what a product row stores. */
export async function resolveCategory(db: Runner, id: string): Promise<{ categoryId: string; parentCategoryId: string | null }> {
  const c = await db.category.findUnique({ where: { id }, include: { parent: true } });
  if (!c || !c.active || (c.parent && !c.parent.active)) {
    throw new HttpError(400, "Pick a category from the list (this one does not exist or is hidden).", "VALIDATION");
  }
  return { categoryId: c.id, parentCategoryId: c.parentId };
}

// ---------------------------------------------------------------- defaults
// [slug, English, Bengali, Material icon key, [ [English, Bengali], ... ]]
const DEFAULTS: Array<[string, string, string, string, Array<[string, string]>]> = [
  ["grocery-food", "Grocery & Food", "মুদি ও খাবার", "local_grocery_store", [
    ["Fruits & Vegetables", "ফল ও সবজি"], ["Meat & Fish", "মাছ ও মাংস"], ["Dairy & Eggs", "দুধ ও ডিম"],
    ["Bakery & Snacks", "বেকারি ও স্ন্যাকস"], ["Beverages", "পানীয়"], ["Rice, Oil & Spices", "চাল, তেল ও মসলা"], ["Ready & Frozen Food", "রেডি ও ফ্রোজেন খাবার"]]],
  ["fashion", "Fashion", "ফ্যাশন", "checkroom", [
    ["Men", "পুরুষ"], ["Women", "মহিলা"], ["Kids' Wear", "শিশুদের পোশাক"], ["Footwear", "জুতা"], ["Bags & Accessories", "ব্যাগ ও এক্সেসরিজ"], ["Watches & Jewellery", "ঘড়ি ও গহনা"]]],
  ["electronics", "Electronics", "ইলেকট্রনিক্স", "devices", [
    ["Mobiles & Tablets", "মোবাইল ও ট্যাবলেট"], ["Computers & Accessories", "কম্পিউটার ও এক্সেসরিজ"], ["Home Appliances", "হোম অ্যাপ্লায়েন্স"], ["Audio & Cameras", "অডিও ও ক্যামেরা"]]],
  ["home-living", "Home & Living", "ঘর ও জীবনযাপন", "home", [
    ["Furniture", "আসবাবপত্র"], ["Kitchen & Dining", "রান্নাঘর ও ডাইনিং"], ["Decor & Furnishing", "সাজসজ্জা"], ["Cleaning Supplies", "পরিষ্কারের সামগ্রী"]]],
  ["beauty-personal-care", "Beauty & Personal Care", "বিউটি ও পার্সোনাল কেয়ার", "face", [
    ["Skin Care", "স্কিন কেয়ার"], ["Hair Care", "হেয়ার কেয়ার"], ["Makeup", "মেকআপ"], ["Fragrance", "পারফিউম"], ["Grooming", "গ্রুমিং"]]],
  ["baby-kids", "Baby & Kids", "শিশু ও বাচ্চা", "child_care", [
    ["Baby Care", "শিশুর যত্ন"], ["Toys & Games", "খেলনা ও গেমস"], ["School Supplies", "স্কুলের সামগ্রী"]]],
  ["books-stationery", "Books & Stationery", "বই ও স্টেশনারি", "menu_book", [
    ["Books", "বই"], ["Stationery", "স্টেশনারি"], ["Office Supplies", "অফিস সামগ্রী"]]],
  ["sports-outdoor", "Sports & Outdoor", "খেলাধুলা ও আউটডোর", "sports_soccer", []],
  ["gifts-crafts", "Gifts & Crafts", "উপহার ও হস্তশিল্প", "card_giftcard", []],
  ["tools-hardware", "Tools & Hardware", "টুলস ও হার্ডওয়্যার", "build", []],
  ["others", "Others", "অন্যান্য", "more_horiz", []],
];

/** Seed the starter tree once (only when the table is empty). The admin owns it afterwards. */
export async function ensureDefaultCategories(db: Db): Promise<number> {
  if ((await db.category.count()) > 0) return 0;
  let n = 0;
  for (let i = 0; i < DEFAULTS.length; i++) {
    const [slug, nameEn, nameBn, icon, subs] = DEFAULTS[i];
    const top = await db.category.create({ data: { slug, nameEn, nameBn, icon, sortOrder: (i + 1) * 10 } });
    n++;
    for (let j = 0; j < subs.length; j++) {
      await db.category.create({
        data: { parentId: top.id, slug: `${slug}-${slugify(subs[j][0])}`.slice(0, 60), nameEn: subs[j][0], nameBn: subs[j][1], sortOrder: (j + 1) * 10 },
      });
      n++;
    }
  }
  return n;
}
