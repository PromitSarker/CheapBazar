/**
 * Sessions through identity-service. Not wired into the pages yet: the live
 * site still uses src/modules/identity/service.ts (monolith, Neon) until the
 * cutover. Opaque session tokens are stored hashed by the service; the browser
 * only ever holds the random token in an httpOnly cookie.
 */
import { cookies } from "next/headers";
import { callService, ServiceCallError } from "./client";

export const SESSION_COOKIE = "sf_session";

export interface ServiceUser {
  id: string;
  email: string;
  name: string;
  role: string;
}
interface AuthResult { user: ServiceUser; token: string; expiresAt: string }

export function setSessionCookie(token: string, expiresAt: string | Date) {
  const opts: any = {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_INSECURE !== "true",
  };
  if (process.env.COOKIE_DOMAIN) opts.domain = process.env.COOKIE_DOMAIN;
  cookies().set(SESSION_COOKIE, token, opts);
}

export async function loginViaService(email: string, password: string, ip: string): Promise<ServiceUser> {
  const r = await callService<AuthResult>("identity", "POST", "/auth/login", { email, password, ip });
  setSessionCookie(r.token, r.expiresAt);
  return r.user;
}

export async function registerViaService(
  input: { email: string; name: string; password: string; role?: string },
  ip: string
): Promise<ServiceUser> {
  const r = await callService<AuthResult>("identity", "POST", "/auth/register", { ...input, ip });
  setSessionCookie(r.token, r.expiresAt);
  return r.user;
}

/** Current user from the cookie, or null (also null if identity-service is down). */
export async function currentUserViaService(): Promise<ServiceUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const r = await callService<{ user: ServiceUser }>("identity", "POST", "/auth/session", { token });
    return r.user;
  } catch (e) {
    if (e instanceof ServiceCallError && e.status === 401) return null;
    console.error("[bff] session check failed:", (e as Error).message);
    return null;
  }
}

export async function logoutViaService(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    try { await callService("identity", "POST", "/auth/logout", { token }); } catch { /* cookie is cleared regardless */ }
  }
  cookies().delete(SESSION_COOKIE);
}
