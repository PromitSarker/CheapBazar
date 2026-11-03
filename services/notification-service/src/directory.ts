import { ServiceError, serviceClient, serviceUrl } from "../../../packages/service-kit";

/**
 * Who is who: resolves recipients from identity-service. Lookups that fail THROW so the
 * event handler fails and the bus retries - a notification must never be silently lost
 * just because identity was briefly down.
 */
export interface Directory {
  user(id: string): Promise<{ email: string; name: string } | null>;
  storeOwner(storeId: string): Promise<string | null>;
  admins(): Promise<string[]>;
}

export function httpDirectory(secret: string): Directory {
  const c = () => serviceClient({ baseUrl: serviceUrl("identity"), secret, caller: "notification", timeoutMs: 5000 });
  const cache = new Map<string, { at: number; value: any }>();
  const cached = async <T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
    const value = await load();
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 5000) cache.clear();
    return value;
  };
  const notFoundAsNull = async <T>(p: Promise<T>): Promise<T | null> => {
    try { return await p; } catch (e) { if (e instanceof ServiceError && e.status === 404) return null; throw e; }
  };
  return {
    user: (id) => cached(`u:${id}`, 5 * 60_000, () => notFoundAsNull(c().get<any>(`/users/${encodeURIComponent(id)}`)).then((u) => (u ? { email: u.email, name: u.name } : null))),
    storeOwner: (id) => cached(`s:${id}`, 10 * 60_000, () => notFoundAsNull(c().get<any>(`/stores/${encodeURIComponent(id)}`)).then((s) => s?.ownerId ?? null)),
    admins: () => cached("admins", 60_000, async () => (await c().get<any>(`/users?role=ADMIN`)).users.map((u: any) => u.id as string)),
  };
}
