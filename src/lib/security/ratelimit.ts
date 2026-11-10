/**
 * Fixed-window in-memory rate limiter for the web tier (per process).
 * The web app runs as a single pm2 process, so this is enough today; use Redis
 * if the web tier is ever scaled to several instances.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private max: number, private windowMs: number) {}

  /** True if the call is allowed (and counts it). */
  allow(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || h.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.sweep(now);
      return true;
    }
    h.count++;
    return h.count <= this.max;
  }
  reset(key: string) {
    this.hits.delete(key);
  }
  private sweep(now: number) {
    Array.from(this.hits.entries()).forEach(([k, v]) => { if (v.resetAt <= now) this.hits.delete(k); });
  }
}

/**
 * Best-effort client address. X-Forwarded-For is client-controlled when the app
 * is reached directly (no reverse proxy), so never rely on this alone: pair it
 * with a limit that does not depend on the address (e.g. per store).
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    // With a trusted proxy the LAST hop is the one it appended.
    if (parts.length) return parts[parts.length - 1].slice(0, 64);
  }
  return (headers.get("x-real-ip") || "unknown").slice(0, 64);
}
