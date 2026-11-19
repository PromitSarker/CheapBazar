import { adsTxt } from "@/lib/adnetwork";

export const dynamic = "force-dynamic";

/** Authorises Google to sell this site's ad inventory. 404 until ADSENSE_CLIENT is set. */
export function GET() {
  const body = adsTxt();
  if (!body) return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
