"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStore } from "@/lib/tenant";
import { withTenant } from "@/lib/rls";

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

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
    const ext = path.extname(imageFile.name) || ".png";
    const filename = crypto.randomUUID() + ext;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), buffer);
    imageUrl = `/uploads/${filename}`;
  }

  if (!name || !Number.isFinite(price) || price < 0) {
    redirect("/dashboard/products?error=invalid");
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
  await withTenant(store.id, (tx) => tx.product.deleteMany({ where: { id, storeId: store.id } }));
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");
}
