"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TEMPLATES, TemplateId } from "@/lib/constants";
import { servicesEnabled } from "@/lib/bff/client";
import { getCurrentStore } from "@/lib/tenant";
import { updateStoreViaServices } from "@/lib/bff/wallet";

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
    const r = await updateStoreViaServices(mine.id, user.id, { name, slug, template, customDomain });
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
