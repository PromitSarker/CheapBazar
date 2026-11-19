/**
 * Third-party ad networks, configured from environment variables only (no secrets in code, no DB):
 *
 *   Web  - Google AdSense:  ADSENSE_CLIENT=ca-pub-1234567890123456
 *                           ADSENSE_SLOT_HOME / _BROWSE / _BROWSE_SIDE / _STORE = numeric ad-unit ids
 *                           ADSENSE_ENABLED=false  (kill switch; default on once ADSENSE_CLIENT is set)
 *   App  - Google AdMob:    ADMOB_ENABLED=true, ADMOB_BANNER_HOME / _BROWSE / _PRODUCT = ca-app-pub-…/…
 *                           ADMOB_USE_TEST_UNITS=true  (Google's public test units - for checking the flow only)
 *
 * Seller-booked ads (ad-service) always win a placement; the network fills the placement only when no
 * booked ad is live, and shows nothing at all when it is not configured. Every value is validated:
 * a malformed id is ignored rather than rendered into the page.
 */

export type WebPlacement = "home" | "browse" | "browse_side" | "store";
export type AppPlacement = "home" | "browse" | "product";

export interface AdsenseConfig {
  /** The AdSense publisher id is set and the kill switch is not off: load the script, serve ads.txt. */
  enabled: boolean;
  client: string | null;
  slots: Record<WebPlacement, string | null>;
}

export interface AdmobConfig {
  enabled: boolean;
  testUnits: boolean;
  banners: Record<AppPlacement, string | null>;
}

type Env = Record<string, string | undefined>;

const CLIENT_RE = /^ca-pub-\d{16}$/;
const SLOT_RE = /^\d{6,20}$/;
const ADMOB_UNIT_RE = /^ca-app-pub-\d{16}\/\d{10}$/;

/** Google's published sample banner unit: always serves clearly-labelled test ads, never earns or risks the account. */
export const ADMOB_TEST_BANNER = "ca-app-pub-3940256099942544/6300978111";
/** AdSense's ads.txt line is the same for every publisher except the id. */
const ADSENSE_CERT_ID = "f08c47fec0942fa0";

const flag = (v: string | undefined, dflt: boolean) => {
  if (v === undefined || v.trim() === "") return dflt;
  return !["0", "false", "no", "off"].includes(v.trim().toLowerCase());
};
const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "");

export function adsenseConfig(env: Env = process.env): AdsenseConfig {
  const raw = clean(env.ADSENSE_CLIENT);
  // Accept the bare "pub-…" form AdSense shows in some screens.
  const client = CLIENT_RE.test(raw) ? raw : CLIENT_RE.test(`ca-${raw}`) ? `ca-${raw}` : null;
  const slot = (name: string) => {
    const v = clean(env[name]);
    return SLOT_RE.test(v) ? v : null;
  };
  const enabled = !!client && flag(env.ADSENSE_ENABLED, true);
  return {
    enabled,
    client: enabled ? client : null,
    slots: {
      home: enabled ? slot("ADSENSE_SLOT_HOME") : null,
      browse: enabled ? slot("ADSENSE_SLOT_BROWSE") : null,
      browse_side: enabled ? slot("ADSENSE_SLOT_BROWSE_SIDE") : null,
      store: enabled ? slot("ADSENSE_SLOT_STORE") : null,
    },
  };
}

/** What a page needs to render one unit, or null when this placement should stay empty. */
export function webUnit(placement: WebPlacement, env: Env = process.env): { client: string; slot: string } | null {
  const c = adsenseConfig(env);
  const slot = c.slots[placement];
  return c.client && slot ? { client: c.client, slot } : null;
}

/** Body of /ads.txt, or null when AdSense is not configured (the route then answers 404). */
export function adsTxt(env: Env = process.env): string | null {
  const c = adsenseConfig(env);
  if (!c.client) return null;
  return `google.com, ${c.client.replace(/^ca-/, "")}, DIRECT, ${ADSENSE_CERT_ID}\n`;
}

export function admobConfig(env: Env = process.env): AdmobConfig {
  const testUnits = flag(env.ADMOB_USE_TEST_UNITS, false);
  const unit = (name: string) => {
    if (testUnits) return ADMOB_TEST_BANNER;
    const v = clean(env[name]);
    return ADMOB_UNIT_RE.test(v) ? v : null;
  };
  const banners: Record<AppPlacement, string | null> = {
    home: unit("ADMOB_BANNER_HOME"),
    browse: unit("ADMOB_BANNER_BROWSE"),
    product: unit("ADMOB_BANNER_PRODUCT"),
  };
  // Off unless asked for AND at least one real (or test) unit exists - a switch with nothing behind it stays off.
  const enabled = flag(env.ADMOB_ENABLED, false) && Object.values(banners).some(Boolean);
  return { enabled, testUnits: enabled && testUnits, banners: enabled ? banners : { home: null, browse: null, product: null } };
}

/** For the admin panel: a readable, secret-free summary (ids are masked, never shown whole). */
export function adNetworkStatus(env: Env = process.env) {
  const mask = (s: string | null) => (s ? `${s.slice(0, 7)}…${s.slice(-4)}` : null);
  const a = adsenseConfig(env);
  const m = admobConfig(env);
  return {
    adsense: {
      enabled: a.enabled,
      client: mask(a.client),
      placements: (Object.keys(a.slots) as WebPlacement[]).map((p) => ({ placement: p, ready: !!a.slots[p] })),
      adsTxt: !!adsTxt(env),
    },
    admob: {
      enabled: m.enabled,
      testUnits: m.testUnits,
      placements: (Object.keys(m.banners) as AppPlacement[]).map((p) => ({ placement: p, ready: !!m.banners[p] })),
    },
  };
}
