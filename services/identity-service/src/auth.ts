import crypto from "crypto";
import bcrypt from "bcryptjs";
import { HttpError, RateLimiter } from "../../../packages/service-kit";
import { publish } from "../../../packages/event-bus";
import type { Db } from "./db";

export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SELF_REGISTERABLE = new Set(["SELLER", "BUYER"]);

// brute-force protection: per (ip,email) and per ip
const loginByPair = new RateLimiter(8, 10 * 60_000);
const loginByIp = new RateLimiter(40, 10 * 60_000);
const registerByIp = new RateLimiter(10, 60 * 60_000);

// a real hash so login timing doesn't reveal whether an email exists
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
}
export const toPublicUser = (u: any): PublicUser => ({
  id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt,
});

async function newSession(db: Db, userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function register(db: Db, b: any) {
  const ip = String(b.ip ?? "unknown");
  if (!registerByIp.allow(ip)) throw new HttpError(429, "Too many sign-ups from this address. Try again later.", "RATE_LIMITED");

  const email = String(b.email ?? "").trim().toLowerCase();
  const name = String(b.name ?? "").trim();
  const password = String(b.password ?? "");
  const role = String(b.role ?? "SELLER").toUpperCase();

  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address.", "VALIDATION");
  if (!name || name.length > 120) throw new HttpError(400, "Name is required.", "VALIDATION");
  if (password.length < 8 || password.length > 200) throw new HttpError(400, "Password must be at least 8 characters.", "VALIDATION");
  if (!SELF_REGISTERABLE.has(role)) throw new HttpError(400, "Role must be SELLER or BUYER.", "VALIDATION");

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await db.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { email, name, passwordHash, role: role as any } });
      await publish(tx as any, "identity", "UserRegistered" as any, { userId: u.id, email: u.email, name: u.name, role: u.role });
      return u;
    });
    const s = await newSession(db, user.id);
    return { user: toPublicUser(user), token: s.token, expiresAt: s.expiresAt };
  } catch (e: any) {
    if (e?.code === "P2002") throw new HttpError(409, "An account with this email already exists.", "EMAIL_TAKEN");
    throw e;
  }
}

export async function login(db: Db, b: any) {
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const ip = String(b.ip ?? "unknown");
  if (!loginByIp.allow(ip) || !loginByPair.allow(`${ip}|${email}`)) {
    throw new HttpError(429, "Too many login attempts. Please wait a few minutes.", "RATE_LIMITED");
  }
  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, "Invalid email or password.", "BAD_CREDENTIALS");
  loginByPair.reset(`${ip}|${email}`);
  const s = await newSession(db, user.id);
  return { user: toPublicUser(user), token: s.token, expiresAt: s.expiresAt };
}

export async function verifySession(db: Db, token: string) {
  if (!token) throw new HttpError(401, "No session", "NO_SESSION");
  const s = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) throw new HttpError(401, "Session expired", "NO_SESSION");
  return { user: toPublicUser(s.user), expiresAt: s.expiresAt };
}

export async function logout(db: Db, token: string) {
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  return { ok: true };
}

export async function cleanupSessions(db: Db) {
  const r = await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return { deleted: r.count };
}

export async function changeRole(db: Db, userId: string, role: string, admin: string) {
  if (!["SELLER", "BUYER", "ADMIN", "PRO_BUYER"].includes(role)) throw new HttpError(400, "Invalid role", "VALIDATION");
  return db.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId } });
    if (!u) throw new HttpError(404, "User not found", "NOT_FOUND");
    if (u.role === "ADMIN" && role !== "ADMIN") {
      const admins = await tx.user.count({ where: { role: "ADMIN" } });
      if (admins <= 1) throw new HttpError(409, "Cannot demote the last remaining admin.", "LAST_ADMIN");
    }
    const updated = await tx.user.update({ where: { id: userId }, data: { role: role as any } });
    console.log(`[identity] role change user=${userId} ${u.role}->${role} by ${admin}`);
    return toPublicUser(updated);
  });
}
