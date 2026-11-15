"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { servicesEnabled } from "@/lib/bff/client";
import {
  adminAssignCategory, adminCreateCategory, adminDeleteCategory, adminUpdateCategory, type Result,
} from "@/lib/bff/catalogue";

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const sort = (fd: FormData) => (text(fd, "sortOrder") === "" ? undefined : Number(fd.get("sortOrder")));

/** Every action ends the same way: refresh the page and show what happened. */
function finish(r: Result, done: string): never {
  revalidatePath("/admin/categories");
  revalidatePath("/dashboard/products");
  if (!r.ok) redirect(`/admin/categories?error=${encodeURIComponent(r.error.slice(0, 200))}`);
  redirect(`/admin/categories?done=${encodeURIComponent(done)}`);
}
const guard = () => { if (!servicesEnabled()) redirect("/admin/categories"); };

export async function createCategory(fd: FormData) {
  guard();
  const parentId = text(fd, "parentId");
  const body: { nameEn: string; nameBn: string; icon?: string; parentId?: string; sortOrder?: number } = {
    nameEn: text(fd, "nameEn"), nameBn: text(fd, "nameBn"), sortOrder: sort(fd),
  };
  if (text(fd, "icon")) body.icon = text(fd, "icon");
  if (parentId) body.parentId = parentId;
  finish(await adminCreateCategory(body), parentId ? "Sub-category added" : "Department added");
}

export async function saveCategory(fd: FormData) {
  guard();
  const body: Record<string, unknown> = { nameEn: text(fd, "nameEn"), nameBn: text(fd, "nameBn"), sortOrder: sort(fd) };
  if (text(fd, "icon")) body.icon = text(fd, "icon");
  finish(await adminUpdateCategory(text(fd, "id"), body), "Saved");
}

export async function setCategoryActive(fd: FormData) {
  guard();
  const active = text(fd, "active") === "true";
  finish(await adminUpdateCategory(text(fd, "id"), { active }), active ? "Category is visible again" : "Category hidden from shoppers");
}

export async function removeCategory(fd: FormData) {
  guard();
  finish(await adminDeleteCategory(text(fd, "id")), "Category deleted");
}

export async function fileProduct(fd: FormData) {
  guard();
  const categoryId = text(fd, "categoryId");
  if (!categoryId) finish({ ok: false, error: "Choose a category first." }, "");
  finish(await adminAssignCategory(text(fd, "productId"), text(fd, "storeId"), categoryId), "Product filed");
}
