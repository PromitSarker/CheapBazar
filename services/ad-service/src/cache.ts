import { dhakaToday, dayStr } from "./dates";
import type { Db } from "./db";

export interface CachedAd {
  bookingNumber: string;
  storeId: string;
  slot: string;
  placement: string;
  headline: string;
  imageUrl: string;
  targetUrl: string;
  startDate: string;
  endDate: string;
}

/**
 * Storage behind GET /ads/active. The default is in-process memory; a Redis
 * implementation only has to satisfy this interface (the DB stays the source of truth).
 */
export interface AdsCache {
  read(): Promise<{ ads: CachedAd[]; loadedAt: number } | null>;
  write(ads: CachedAd[], loadedAt: number): Promise<void>;
}

export class MemoryAdsCache implements AdsCache {
  private v: { ads: CachedAd[]; loadedAt: number } | null = null;
  async read() { return this.v; }
  async write(ads: CachedAd[], loadedAt: number) { this.v = { ads, loadedAt }; }
}

/**
 * Read-through cache of live ads. Mutations made through the API call `refresh()` after
 * they commit; changes that arrive through the event bus become visible within `ttlMs`.
 * Whatever the cache holds, every read re-checks the date window, so an expired ad is
 * never served even if the expiry worker is late.
 */
export class ActiveAds {
  constructor(private db: Db, private cache: AdsCache, private ttlMs = 3000, private clock: () => Date = () => new Date()) {}

  async refresh(): Promise<number> {
    const rows = await this.db.adBooking.findMany({ where: { status: "ACTIVE" }, include: { slot: true }, orderBy: { startDate: "asc" } });
    const ads: CachedAd[] = rows.map((b) => ({
      bookingNumber: b.bookingNumber, storeId: b.storeId, slot: b.slot.code, placement: b.slot.placement,
      headline: b.headline, imageUrl: b.imageUrl, targetUrl: b.targetUrl, startDate: dayStr(b.startDate), endDate: dayStr(b.endDate),
    }));
    await this.cache.write(ads, Date.now());
    return ads.length;
  }

  async list(filter: { slot?: string; placement?: string }, now: Date = this.clock()): Promise<CachedAd[]> {
    let v = await this.cache.read();
    if (!v || Date.now() - v.loadedAt > this.ttlMs) {
      await this.refresh();
      v = await this.cache.read();
    }
    const today = dhakaToday(now);
    return (v?.ads ?? []).filter(
      (a) => a.startDate <= today && a.endDate >= today && (!filter.slot || a.slot === filter.slot) && (!filter.placement || a.placement === filter.placement)
    );
  }
}
