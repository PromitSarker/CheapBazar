/**
 * Web-tier client for the internal microservices. Server-side only: it carries
 * INTERNAL_AUTH_SECRET, which must never reach the browser.
 */
export type ServiceName =
  | "identity" | "catalog" | "order" | "payment" | "ledger" | "ad" | "aggregator" | "notification";

const DEFAULT_PORTS: Record<ServiceName, number> = {
  identity: 4001, catalog: 4002, order: 4003, payment: 4004,
  ledger: 4005, ad: 4006, aggregator: 4007, notification: 4008,
};

export class ServiceCallError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = "ServiceCallError";
  }
}

/** The services path is opt-in; the live site keeps using the monolith until cutover. */
export function servicesEnabled(): boolean {
  return process.env.USE_SERVICES === "true";
}

export function serviceBase(name: ServiceName): string {
  const env = process.env[`SERVICE_URL_${name.toUpperCase()}`];
  return (env || `http://127.0.0.1:${DEFAULT_PORTS[name]}`).replace(/\/$/, "");
}

export async function callService<T = any>(
  name: ServiceName,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  opts: { timeoutMs?: number } = {}
): Promise<T> {
  const secret = process.env.INTERNAL_AUTH_SECRET;
  if (!secret) throw new ServiceCallError(500, "INTERNAL_AUTH_SECRET is not configured", "CONFIG");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);
  try {
    const res = await fetch(serviceBase(name) + path, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}`, "x-service-name": "web" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { error: text.slice(0, 200) }; }
    if (!res.ok) throw new ServiceCallError(res.status, json?.error || `HTTP ${res.status}`, json?.code);
    return json as T;
  } catch (e: any) {
    if (e instanceof ServiceCallError) throw e;
    throw new ServiceCallError(503, `${name}-service unreachable (${e?.message ?? e})`, "UNREACHABLE");
  } finally {
    clearTimeout(timer);
  }
}
