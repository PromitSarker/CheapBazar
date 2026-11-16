/**
 * Which host names belong to the marketplace itself (as opposed to a seller's own subdomain or custom domain).
 * Edge-safe: no Node APIs, so the middleware can use it too.
 */
const BASE_PLATFORM_HOSTS = [
  "localhost", "127.0.0.1", "::1",
  "cheap-bazar.com", "www.cheap-bazar.com", "cheapbazar.com", "www.cheapbazar.com", "storeforge.dev", "www.storeforge.dev",
];

export function isIpOrLocalHost(hostWithoutPort: string): boolean {
  return (
    /^(\d{1,3}\.){3}\d{1,3}$/.test(hostWithoutPort) ||
    hostWithoutPort === "localhost" || hostWithoutPort === "127.0.0.1" || hostWithoutPort === "::1" || hostWithoutPort.startsWith("[")
  );
}

export function isPlatformHostname(hostWithoutPort: string, appDomain = process.env.APP_DOMAIN): boolean {
  const h = hostWithoutPort.toLowerCase();
  if (isIpOrLocalHost(h)) return true;
  const hosts = [...BASE_PLATFORM_HOSTS];
  if (appDomain) hosts.push(appDomain.toLowerCase(), `www.${appDomain.toLowerCase()}`);
  return hosts.includes(h);
}

/** True when the request arrived on the marketplace host (so marketplace rules such as the location range apply). */
export function isMarketplaceHost(hostHeader: string | null | undefined): boolean {
  return isPlatformHostname(String(hostHeader ?? "").split(":")[0]);
}
