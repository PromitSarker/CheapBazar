"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { servicesEnabled } from "@/lib/bff/client";
import { createStoreViaServices } from "@/lib/bff/portal";

import { TEMPLATES, TemplateId } from "@/lib/constants";
import { parseCoords } from "../../../packages/geo";

export async function createStore(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") || "").trim();
  const slug = String(formData.get("slug") || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // Safari sometimes drops hidden/defaultChecked radios from FormData — default to "classic"
  const template = String(formData.get("template") || "classic");

  if (!name || slug.length < 2 || !TEMPLATES.includes(template as TemplateId)) {
    redirect("/onboarding?error=invalid");
  }
  if (servicesEnabled()) {
    // The shop's place is required: buyers find shops by distance. The service validates it again.
    const location = {
      latitude: formData.get("latitude"), longitude: formData.get("longitude"),
      district: String(formData.get("district") || ""), address: String(formData.get("address") || ""),
    };
    if (!parseCoords(location.latitude, location.longitude)) redirect("/onboarding?error=location");
    const r = await createStoreViaServices(user.id, name, slug, template, location);
    if (r === "ok" || r === "exists") redirect("/dashboard");
    redirect(`/onboarding?error=${r}`);
  }
  if (await prisma.store.findUnique({ where: { slug } })) {
    redirect("/onboarding?error=slug-taken");
  }

  await prisma.store.create({
    data: { name, slug, template, ownerId: user.id },
  });
  redirect("/dashboard");
}
