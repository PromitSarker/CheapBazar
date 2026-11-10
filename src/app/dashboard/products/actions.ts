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

export async function addProduct(formData: FormData) {
  const store = await requireStore();
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const price = Number(formData.get("price"));
  const stock = Math.max(0, Math.floor(Number(formData.get("stock") || 0)));
  
  const imageFile = formData.get("image") as File | null;
  let imageUrl = null;

  if (imageFile && imageFile.size > 0) {
    const buffer = Buffer.from(await imageFile.arrayBuffer());
    let ext: string;
    try {
      ext = validateImage(buffer).ext; // type comes from the file's bytes, never its name
    } catch (e) {
      if (e instanceof UploadError) redirect("/dashboard/products?error=image");
      throw e;
    }
    const filename = crypto.randomUUID() + ext;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), buffer);
    imageUrl = `/uploads/${filename}`;
  }

  if (!name || !Number.isFinite(price) || price < 0) {
    redirect("/dashboard/products?error=invalid");
  }

  if (servicesEnabled()) {
    const channel = String(formData.get("channel") || "RETAIL").toUpperCase();
    const wholesaleFields: Record<string, unknown> = {};
    if (channel === "BOTH" || channel === "WHOLESALE") {
      const tierQty = Number(formData.get("tierQty"));
      const tierPrice = Number(formData.get("tierPrice"));
      wholesaleFields.channel = channel;
      wholesaleFields.moq = Number(formData.get("moq") || 1);
      wholesaleFields.wholesalePrice = Number(formData.get("wholesalePrice"));
      wholesaleFields.tiers = tierQty > 0 && tierPrice > 0 ? [{ minQty: tierQty, unitPrice: tierPrice }] : [];
    }
    const r = await createProductViaServices(store.id, { name, description, price, stock, image: imageUrl, ...wholesaleFields });
    if (!r.ok) redirect(`/dashboard/products?error=${wholesaleFields.channel ? "wholesale" : "invalid"}`);
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard");
    return;
  }

  await withTenant(store.id, (tx) =>
    tx.product.create({
      data: { storeId: store.id, name, description, price, stock, image: imageUrl },
    })
  );
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");
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
