"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  const password = String(formData.get("password") || "");
  const roleRaw = String(formData.get("role") || "SELLER").toUpperCase();
  const role = roleRaw === "BUYER" ? "BUYER" : "SELLER";

  if (!email || !name || password.length < 6) redirect("/signup?error=invalid");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) redirect("/signup?error=taken");

  const user = await prisma.user.create({
    data: { email, name, passwordHash: await hashPassword(password), role: role as any },
  });
  await createSession(user.id);
  
  if (role === "BUYER") {
    redirect("/");
  } else {
    redirect("/onboarding");
  }
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    redirect("/login?error=bad-credentials");
  }
  await createSession(user.id);

  if (user.role === "ADMIN") {
    redirect("/admin");
  }

  if (user.role === "BUYER") {
    redirect("/");
  }

  const store = await prisma.store.findUnique({ where: { ownerId: user.id } });
  redirect(store ? "/dashboard" : "/onboarding");
}


export async function logout() {
  await destroySession();
  redirect("/");
}
