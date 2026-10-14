import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import type { UserRole, UserSession } from "./types";

const COOKIE = "sf_session";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + WEEK_MS);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  
  const cookieOptions: any = {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    secure: process.env.NODE_ENV === "production",
  };
  if (process.env.COOKIE_DOMAIN) {
    cookieOptions.domain = process.env.COOKIE_DOMAIN;
  }
  cookies().set(COOKIE, token, cookieOptions);
  return token;
}

export async function getCurrentUser(): Promise<UserSession | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as UserRole,
  };
}

export async function requireUser(): Promise<UserSession> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(allowedRoles: UserRole | UserRole[]): Promise<UserSession> {
  const user = await requireUser();
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!roles.includes(user.role)) {
    redirect("/dashboard?error=unauthorized");
  }
  return user;
}

export async function destroySession(): Promise<void> {
  const token = cookies().get(COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  cookies().delete(COOKIE);
}
