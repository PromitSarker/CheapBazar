"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

import { TEMPLATES, TemplateId } from "@/lib/constants";

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
  if (await prisma.store.findUnique({ where: { slug } })) {
    redirect("/onboarding?error=slug-taken");
  }

  await prisma.store.create({
    data: { name, slug, template, ownerId: user.id },
  });
  redirect("/dashboard");
}
