"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { servicesEnabled, ServiceCallError } from "@/lib/bff/client";
import { loginViaService, registerViaService } from "@/lib/bff/session";
import { storeForOwner } from "@/lib/bff/portal";
import { clientIp } from "@/lib/security/ratelimit";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  const password = String(formData.get("password") || "");
  const roleRaw = String(formData.get("role") || "SELLER").toUpperCase();
  const role = roleRaw === "BUYER" ? "BUYER" : "SELLER";

  if (!email || !name || password.length < 6) redirect("/signup?error=invalid");

  if (servicesEnabled()) {
    let failure: string | null = null;
    try {
      await registerViaService({ email, name, password, role }, clientIp(headers()));
    } catch (e) {
      if (!(e instanceof ServiceCallError)) throw e;
      failure = e.code === "EMAIL_TAKEN" ? "taken" : e.status === 429 ? "rate-limited" : e.status >= 500 ? "unavailable" : "invalid";
    }
    if (failure) redirect(`/signup?error=${failure}`);
    redirect(role === "BUYER" ? "/" : "/onboarding");
  }
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

  if (servicesEnabled()) {
    let svcUser: { id: string; role: string } | null = null;
    let failure = "bad-credentials";
    try {
      svcUser = await loginViaService(email, password, clientIp(headers()));
    } catch (e) {
      if (!(e instanceof ServiceCallError)) throw e;
      if (e.status === 429) failure = "rate-limited";
      else if (e.status >= 500) failure = "unavailable";
    }
    if (!svcUser) redirect(`/login?error=${failure}`);
    if (svcUser.role === "ADMIN") redirect("/admin");
    if (svcUser.role === "BUYER" || svcUser.role === "PRO_BUYER") redirect("/");
    const svcStore = await storeForOwner(svcUser.id);
    redirect(svcStore ? "/dashboard" : "/onboarding");
  }

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
