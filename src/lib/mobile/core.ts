/**
 * Mobile API core: a tiny router, bearer-token auth and error mapping.
 * The Flutter app talks ONLY to /api/m/v1/*. The internal services (and INTERNAL_AUTH_SECRET) stay
 * behind this tier; the app holds nothing but its own random session token.
 */
import { callService, ServiceCallError } from "@/lib/bff/client";
import { clientIp } from "@/lib/security/ratelimit";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export interface MobileUser { id: string; email: string; name: string; role: string }

export interface Ctx {
  req: Request;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  ip: string;
  token: string | null;
  /** Resolved lazily: null when the request has no valid session. */
  user: () => Promise<MobileUser | null>;
}

export type Handler = (ctx: Ctx) => Promise<unknown> | unknown;
interface Route { method: string; re: RegExp; keys: string[]; handler: Handler }

export class MobileRouter {
  private routes: Route[] = [];
  private add(method: string, pattern: string, handler: Handler) {
    const keys: string[] = [];
    const re = new RegExp("^" + pattern.replace(/:([A-Za-z]+)/g, (_m, k) => { keys.push(k); return "([^/]+)"; }) + "/?$");
    this.routes.push({ method, re, keys, handler });
  }
  get(p: string, h: Handler) { this.add("GET", p, h); }
  post(p: string, h: Handler) { this.add("POST", p, h); }
  patch(p: string, h: Handler) { this.add("PATCH", p, h); }
  delete(p: string, h: Handler) { this.add("DELETE", p, h); }

  async handle(req: Request, path: string): Promise<Response> {
    const method = req.method.toUpperCase();
    try {
      for (const r of this.routes) {
        if (r.method !== method) continue;
        const m = r.re.exec(path);
        if (!m) continue;
        const params: Record<string, string> = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        let body: any = {};
        if (method === "POST" || method === "PATCH") {
          const text = await req.text();
          if (text.length > 100_000) throw new ApiError(413, "Request too large", "TOO_LARGE");
          if (text) {
            try { body = JSON.parse(text); } catch { throw new ApiError(400, "Invalid JSON body", "VALIDATION"); }
          }
        }
        const auth = req.headers.get("authorization") || "";
        const token = /^Bearer\s+([A-Za-z0-9._~+/=-]{16,512})$/.exec(auth)?.[1] ?? null;
        let cached: MobileUser | null | undefined;
        const ctx: Ctx = {
          req, params, query: new URL(req.url).searchParams, body, token, ip: clientIp(req.headers),
          user: async () => {
            if (cached !== undefined) return cached;
            if (!token) return (cached = null);
            try {
              cached = (await callService<{ user: MobileUser }>("identity", "POST", "/auth/session", { token })).user;
            } catch (e) {
              if (e instanceof ServiceCallError && e.status === 401) cached = null;
              else throw e;
            }
            return cached;
          },
        };
        return json(200, await r.handler(ctx));
      }
      return json(404, { error: "Not found", code: "NOT_FOUND" });
    } catch (e) {
      return errorResponse(e);
    }
  }
}

export function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data ?? {}), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) return json(e.status, { error: e.message, code: e.code });
  if (e instanceof ServiceCallError) {
    // 4xx messages from the services are written for customers; infrastructure errors are hidden.
    if (e.status >= 500) return json(503, { error: "Service temporarily unavailable. Please try again shortly.", code: "UNAVAILABLE" });
    return json(e.status, { error: e.message, code: e.code });
  }
  console.error("[mobile-api]", e);
  return json(500, { error: "Something went wrong. Please try again.", code: "INTERNAL" });
}

export async function needUser(ctx: Ctx): Promise<MobileUser> {
  const u = await ctx.user();
  if (!u) throw new ApiError(401, "Please log in again.", "UNAUTHORIZED");
  return u;
}

export const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
