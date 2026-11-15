"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStore } from "@/lib/tenant";
import { withTenant } from "@/lib/rls";

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { validateImage, UploadError } from "@/lib/security/uploads";
import { servicesEnabled } from "@/lib/bff/client";
import { createProductViaServices, adjustStockViaServices, deleteProductViaServices } from "@/lib/bff/portal";
import { getSellerProduct, updateProductViaServices } from "@/lib/bff/catalogue";

const MAX_IMAGES = 8;

/** Validates (by magic bytes) and stores uploaded photos; returns their /uploads/ paths. Throws UploadError. */
async function saveImages(files: File[]): Promise<string[]> {
  const out: string[] = [];
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  for (const f of files) {
    if (!f || f.size === 0) continue;
    const buffer = Buffer.from(await f.arrayBuffer());
    const { ext } = validateImage(buffer); // type comes from the file's bytes, never its name
    await fs.mkdir(uploadDir, { recursive: true });
    const filename = crypto.randomUUID() + ext;
    await fs.writeFile(path.join(uploadDir, filename), buffer);
    out.push(`/uploads/${filename}`);
  }
  return out;
}

const fileList = (fd: FormData, key: string) => fd.getAll(key).filter((v): v is File => typeof v !== "string");
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
function back(error: string, msg?: string, to = "/dashboard/products"): never {
  redirect(`${to}?error=${error}${msg ? `&msg=${encodeURIComponent(msg.slice(0, 200))}` : ""}`);
}

/** Fields shared by "add" and "edit" (manual entry). Photos are handled separately. */
function readProductForm(fd: FormData) {
  const channel = text(fd, "channel").toUpperCase() || "RETAIL";
  const base: Record<string, unknown> = {
    name: text(fd, "name"),
    description: text(fd, "description"),
    price: Number(fd.get("price")),
    stock: Math.max(0, Math.floor(Number(fd.get("stock") || 0))),
    categoryId: text(fd, "categoryId"),
    brand: text(fd, "brand"),
    unit: text(fd, "unit"),
    compareAtPrice: text(fd, "compareAtPrice") === "" ? null : Number(fd.get("compareAtPrice")),
  };
  if (channel === "BOTH" || channel === "WHOLESALE") {
    const tierQty = Number(fd.get("tierQty"));
    const tierPrice = Number(fd.get("tierPrice"));
    base.channel = channel;
    base.moq = Number(fd.get("moq") || 1);
    base.wholesalePrice = Number(fd.get("wholesalePrice"));
    base.tiers = tierQty > 0 && tierPrice > 0 ? [{ minQty: tierQty, unitPrice: tierPrice }] : [];
  } else if (fd.has("channel")) {
    base.channel = "RETAIL";
  }
  return base;
}

export async function addProduct(formData: FormData) {
  const store = await requireStore();
  const f = readProductForm(formData);
  const name = f.name as string;
  const price = f.price as number;

  let images: string[] = [];
  try {
    images = await saveImages([...fileList(formData, "images"), ...fileList(formData, "image")].slice(0, MAX_IMAGES));
  } catch (e) {
    if (e instanceof UploadError) back("image");
    throw e;
  }

  if (!name || !Number.isFinite(price) || price < 0) back("invalid");

  if (servicesEnabled()) {
    const payload: Record<string, unknown> = { ...f, image: images[0] ?? null, images };
    if (payload.compareAtPrice === null) delete payload.compareAtPrice;
    if (!payload.categoryId) delete payload.categoryId;
    const r = await createProductViaServices(store.id, payload);
    if (!r.ok) back("custom", r.error);
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard");
    return;
  }

  await withTenant(store.id, (tx) =>
    tx.product.create({
      data: { storeId: store.id, name, description: f.description as string, price, stock: f.stock as number, image: images[0] ?? null },
    })
  );
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");
}

/** Edit a product (services platform only). Keeps the photos the seller kept, adds new ones, clears blanked fields. */
export async function updateProduct(formData: FormData) {
  const store = await requireStore();
  const id = text(formData, "id");
  const edit = `/dashboard/products/${encodeURIComponent(id)}`;
  if (!servicesEnabled()) redirect("/dashboard/products");

  const cur = await getSellerProduct(store.id, id);
  if (!cur) redirect("/dashboard/products");

  const f = readProductForm(formData);
  if (!f.name || !Number.isFinite(f.price as number) || (f.price as number) <= 0) back("invalid", undefined, edit);

  // photos: only ones this product already had can be kept (a tampered form cannot attach someone else's file)
  const kept = formData.getAll("keepImages").map(String).filter((u) => cur.images.includes(u));
  let added: string[] = [];
  try {
    added = await saveImages(fileList(formData, "images").slice(0, MAX_IMAGES));
  } catch (e) {
    if (e instanceof UploadError) back("image", undefined, edit);
    throw e;
  }
  const images = [...kept, ...added].slice(0, MAX_IMAGES);

  const r = await updateProductViaServices(store.id, id, { ...f, images, image: images[0] ?? null });
  if (!r.ok) back("custom", r.error, edit);
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");
  redirect("/dashboard/products?saved=1");
}

export async function adjustStock(formData: FormData) {
  const store = await requireStore();
  const id = String(formData.get("id"));
  const delta = Number(formData.get("delta"));

  if (servicesEnabled()) {
    await adjustStockViaServices(store.id, id, Number.isFinite(delta) ? Math.trunc(delta) : 0);
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard");
    return;
  }

  await withTenant(store.id, async (tx) => {
    const product = await tx.product.findFirst({ where: { id, storeId: store.id } });
    if (!product) return;
    await tx.product.update({
      where: { id: product.id },
      data: { stock: Math.max(0, product.stock + delta) },
    });
  });
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");
}

export async function deleteProduct(formData: FormData) {
  const store = await requireStore();
  const id = String(formData.get("id"));
  if (servicesEnabled()) {
    const r = await deleteProductViaServices(store.id, id);
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard");
    if (r === "in-use") redirect("/dashboard/products?error=in-use");
    return;
  }
  await withTenant(store.id, (tx) => tx.product.deleteMany({ where: { id, storeId: store.id } }));
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");
}
