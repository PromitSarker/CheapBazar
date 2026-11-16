"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TEMPLATES, TemplateId } from "@/lib/constants";
import { servicesEnabled } from "@/lib/bff/client";
import { getCurrentStore } from "@/lib/tenant";
import { updateStoreViaServices } from "@/lib/bff/wallet";
import { saveStoreLocationViaServices } from "@/lib/bff/portal";
import { parseCoords } from "../../../../packages/geo";
import { presetHex } from "@/lib/storefront-theme";
import { validateImage, UploadError } from "@/lib/security/uploads";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export async function updateStore(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") || "").trim();
  const slug = String(formData.get("slug") || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const template = String(formData.get("template") || "");
  const customDomainRaw = String(formData.get("customDomain") || "").trim().toLowerCase();
  const customDomain = customDomainRaw ? customDomainRaw.replace(/^https?:\/\//, "").replace(/\/+$/, "") : null;

  if (!name || slug.length < 2 || !TEMPLATES.includes(template as TemplateId)) {
    redirect("/dashboard/settings?error=invalid");
  }
  
  if (servicesEnabled()) {
    const mine = await getCurrentStore();
    if (!mine) redirect("/onboarding");
    // Branding: one logo file (type sniffed from its bytes) and one preset colour.
    const branding: { logoUrl?: string | null; themeColor?: string | null } = {};
    const logoFile = formData.get("logo");
    if (logoFile instanceof File && logoFile.size > 0) {
      const buffer = Buffer.from(await logoFile.arrayBuffer());
      let ext: string;
      try {
        ext = validateImage(buffer).ext;
      } catch (e) {
        if (e instanceof UploadError) redirect("/dashboard/settings?error=logo");
        throw e;
      }
      const filename = crypto.randomUUID() + ext;
      const uploadDir = path.join(process.cwd(), "public", "uploads");
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.writeFile(path.join(uploadDir, filename), buffer);
      branding.logoUrl = `/uploads/${filename}`;
    } else if (formData.get("removeLogo") === "1") {
      branding.logoUrl = null;
    }
    const color = presetHex(String(formData.get("themeColor") || ""));
    if (color) branding.themeColor = color;

    const r = await updateStoreViaServices(mine.id, user.id, { name, slug, template, customDomain, ...branding });
    redirect(r === "ok" ? "/dashboard/settings?success=1" : `/dashboard/settings?error=${r}`);
  }

  const existingStore = await prisma.store.findUnique({ where: { slug } });
  
  if (existingStore && existingStore.ownerId !== user.id) {
    redirect("/dashboard/settings?error=slug-taken");
  }

  if (customDomain) {
    const existingDomain = await prisma.store.findUnique({ where: { customDomain } });
    if (existingDomain && existingDomain.ownerId !== user.id) {
      redirect("/dashboard/settings?error=domain-taken");
    }
  }

  await prisma.store.update({
    where: { ownerId: user.id },
    data: { name, slug, template, customDomain },
  });
  
  redirect("/dashboard/settings?success=1");

}

/** Shop location form (services path): a pin inside Bangladesh, a district and a street/area line. */
export async function saveLocation(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!servicesEnabled()) redirect("/dashboard/settings");
  const mine = await getCurrentStore();
  if (!mine) redirect("/onboarding");
  const location = {
    latitude: formData.get("latitude"), longitude: formData.get("longitude"),
    district: String(formData.get("district") || ""), address: String(formData.get("address") || ""),
  };
  if (!parseCoords(location.latitude, location.longitude)) redirect("/dashboard/settings?error=location#location");
  const r = await saveStoreLocationViaServices(mine.id, user.id, location);
  redirect(r === "ok" ? "/dashboard/settings?success=location#location" : `/dashboard/settings?error=${r === "location" ? "location" : "invalid"}#location`);
}
