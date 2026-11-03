/**
 * service-kit: the tiny, dependency-free HTTP toolkit every Cheap-Bazar
 * microservice is built on (router, internal auth, JSON errors, service client).
 *
 * Services are INTERNAL: they accept calls only from other services and the web
 * tier, authenticated with a shared INTERNAL_AUTH_SECRET bearer token. The only
 * exceptions are routes explicitly registered with `auth: "none"` (e.g. the
 * courier webhook, which verifies its own HMAC signature).
 */
import http from "http";
import crypto from "crypto";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
    this.name = "HttpError";
  }
}

export const DEFAULT_PORTS: Record<string, number> = {
  identity: 4001,
  catalog: 4002,
  order: 4003,
  payment: 4004,
  ledger: 4005,
  ad: 4006,
  aggregator: 4007,
  notification: 4008,
};

export function serviceUrl(name: string): string {
  const env = process.env[`SERVICE_URL_${name.toUpperCase()}`];
  if (env) return env.replace(/\/$/, "");
  const port = DEFAULT_PORTS[name];
  if (!port) throw new Error(`Unknown service "${name}"`);
  return `http://127.0.0.1:${port}`;
}

export interface Ctx {
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  headers: http.IncomingHttpHeaders;
  rawBody: string;
  caller: string;
}
export type Handler = (ctx: Ctx) => Promise<unknown> | unknown;
interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  handler: Handler;
  auth: "internal" | "none";
}

export class Router {
  private routes: Route[] = [];
  add(method: string, path: string, handler: Handler, opts: { auth?: "internal" | "none" } = {}) {
    const keys: string[] = [];
    const re = new RegExp(
      "^" + path.replace(/:([A-Za-z]+)/g, (_m, k) => (keys.push(k), "([^/]+)")) + "/?$"
    );
    this.routes.push({ method, re, keys, handler, auth: opts.auth ?? "internal" });
    return this;
  }
  get = (p: string, h: Handler, o?: { auth?: "internal" | "none" }) => this.add("GET", p, h, o);
  post = (p: string, h: Handler, o?: { auth?: "internal" | "none" }) => this.add("POST", p, h, o);
  patch = (p: string, h: Handler, o?: { auth?: "internal" | "none" }) => this.add("PATCH", p, h, o);
  put = (p: string, h: Handler, o?: { auth?: "internal" | "none" }) => this.add("PUT", p, h, o);
  delete = (p: string, h: Handler, o?: { auth?: "internal" | "none" }) => this.add("DELETE", p, h, o);
  match(method: string, pathname: string) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (m) {
        const params: Record<string, string> = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { route: r, params };
      }
    }
    return null;
  }
  hasPath(pathname: string) {
    return this.routes.some((r) => r.re.test(pathname));
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export interface ServiceOptions {
  name: string;
  router: Router;
  internalSecret: string;
  /** Extra readiness check (e.g. DB ping). */
  ready?: () => Promise<void>;
}

const MAX_BODY = 2 * 1024 * 1024;

export function createServer(opts: ServiceOptions) {
  const { name, router, internalSecret } = opts;
  if (!internalSecret) throw new Error(`${name}: INTERNAL_AUTH_SECRET is required`);

  const server = http.createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      const data = JSON.stringify(body);
      res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
      res.end(data);
    };
    try {
      const url = new URL(req.url || "/", "http://x");
      const method = (req.method || "GET").toUpperCase();

      if (url.pathname === "/health") {
        if (opts.ready) await opts.ready();
        return send(200, { service: name, status: "ok" });
      }

      const m = router.match(method, url.pathname);
      if (!m) return send(router.hasPath(url.pathname) ? 405 : 404, { error: "Not found", code: "NOT_FOUND" });

      let caller = "public";
      if (m.route.auth === "internal") {
        const header = String(req.headers["authorization"] || "");
        const token = header.startsWith("Bearer ") ? header.slice(7) : "";
        if (!token || !safeEqual(token, internalSecret)) {
          return send(401, { error: "Unauthorized", code: "UNAUTHORIZED" });
        }
        caller = String(req.headers["x-service-name"] || "unknown");
      }

      let rawBody = "";
      if (method !== "GET" && method !== "HEAD") {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const c of req) {
          size += (c as Buffer).length;
          if (size > MAX_BODY) throw new HttpError(413, "Request body too large", "TOO_LARGE");
          chunks.push(c as Buffer);
        }
        rawBody = Buffer.concat(chunks).toString("utf8");
      }
      let body: any = undefined;
      if (rawBody && String(req.headers["content-type"] || "").includes("json")) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          throw new HttpError(400, "Invalid JSON body", "BAD_JSON");
        }
      }

      const result = await m.route.handler({
        params: m.params,
        query: Object.fromEntries(url.searchParams),
        body: body ?? {},
        headers: req.headers,
        rawBody,
        caller,
      });
      if (result && typeof result === "object" && "__status" in (result as any)) {
        const r = result as any;
        return send(r.__status, r.body);
      }
      return send(200, result ?? { ok: true });
    } catch (err: any) {
      if (err instanceof HttpError) {
        return send(err.status, { error: err.message, code: err.code, details: err.details });
      }
      console.error(`[${name}] unhandled error:`, err);
      return send(500, { error: "Internal server error", code: "INTERNAL" });
    }
  });

  return {
    server,
    listen: (port: number, host = "127.0.0.1") =>
      new Promise<void>((resolve) => server.listen(port, host, () => resolve())),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Respond with an explicit status code from a handler. */
export const reply = (status: number, body: unknown) => ({ __status: status, body });

// ------------------------------------------------------------------ client

export class ServiceError extends Error {
  constructor(public status: number, message: string, public code?: string, public body?: any) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface ClientOptions {
  baseUrl: string;
  secret: string;
  caller: string;
  timeoutMs?: number;
}

export function serviceClient(opts: ClientOptions) {
  async function call<T = any>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
    const attempts = method === "GET" ? 3 : 1;
    let lastErr: any;
    for (let i = 0; i < attempts; i++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);
      try {
        const res = await fetch(opts.baseUrl + path, {
          method,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${opts.secret}`,
            "x-service-name": opts.caller,
            ...extraHeaders,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: ctrl.signal,
        });
        const text = await res.text();
        const json = text ? safeJson(text) : {};
        if (!res.ok) {
          throw new ServiceError(res.status, json?.error || `HTTP ${res.status}`, json?.code, json);
        }
        return json as T;
      } catch (e: any) {
        lastErr = e;
        if (e instanceof ServiceError) throw e; // an answer from the service: do not retry
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 150 * (i + 1)));
      } finally {
        clearTimeout(timer);
      }
    }
    throw new ServiceError(503, `Service unreachable: ${opts.baseUrl}${path} (${lastErr?.message ?? lastErr})`, "UNREACHABLE");
  }
  return {
    get: <T = any>(p: string, h?: Record<string, string>) => call<T>("GET", p, undefined, h),
    post: <T = any>(p: string, b?: unknown, h?: Record<string, string>) => call<T>("POST", p, b ?? {}, h),
    patch: <T = any>(p: string, b?: unknown, h?: Record<string, string>) => call<T>("PATCH", p, b ?? {}, h),
    delete: <T = any>(p: string, h?: Record<string, string>) => call<T>("DELETE", p, undefined, h),
  };
}

function safeJson(t: string): any {
  try {
    return JSON.parse(t);
  } catch {
    return { error: t.slice(0, 200) };
  }
}

// ------------------------------------------------------------------ helpers

export function requireFields(body: any, fields: string[]) {
  for (const f of fields) {
    if (body?.[f] === undefined || body?.[f] === null || body?.[f] === "") {
      throw new HttpError(400, `Missing required field: ${f}`, "VALIDATION");
    }
  }
}

export function positiveNumber(v: unknown, name: string, max = 1e9): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > max) throw new HttpError(400, `${name} must be a positive number`, "VALIDATION");
  return Math.round(n * 100) / 100;
}

export function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== "" && process.env[name] !== undefined ? v : fallback;
}

export { splitSqlStatements } from "./sql";
export { RateLimiter } from "./ratelimit";
