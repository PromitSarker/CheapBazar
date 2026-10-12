import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const hostname = request.headers.get("host") || "";

  // Skip static files, APIs, and Next.js internals
  if (
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/uploads") ||
    url.pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Extract host without port (e.g., "103.228.39.38:3000" -> "103.228.39.38")
  const hostWithoutPort = hostname.split(":")[0].toLowerCase();

  // Detect direct IP addresses (IPv4 or IPv6) or localhost
  const isIpAddress =
    /^(\d{1,3}\.){3}\d{1,3}$/.test(hostWithoutPort) ||
    hostWithoutPort === "localhost" ||
    hostWithoutPort === "127.0.0.1" ||
    hostWithoutPort === "::1" ||
    hostWithoutPort.startsWith("[");

  // Base platform domains
  const platformHosts = [
    "localhost",
    "127.0.0.1",
    "::1",
    "cheap-bazar.com",
    "www.cheap-bazar.com",
    "cheapbazar.com",
    "www.cheapbazar.com",
    "storeforge.dev",
    "www.storeforge.dev",
  ];

  // Also include configured APP_DOMAIN or NEXT_PUBLIC_APP_URL if defined
  if (process.env.APP_DOMAIN) {
    platformHosts.push(process.env.APP_DOMAIN.toLowerCase());
    platformHosts.push(`www.${process.env.APP_DOMAIN.toLowerCase()}`);
  }

  const isPlatformHost = isIpAddress || platformHosts.includes(hostWithoutPort);

  // Check for subdomain e.g. "demo-bakery.localhost" or "demo-bakery.cheap-bazar.com"
  const isSubdomain =
    !isPlatformHost &&
    (hostWithoutPort.endsWith(".localhost") ||
      hostWithoutPort.endsWith(".cheap-bazar.com") ||
      hostWithoutPort.endsWith(".cheapbazar.com") ||
      hostWithoutPort.endsWith(".storeforge.dev"));

  if (isSubdomain) {
    const subdomain = hostWithoutPort.split(".")[0];
    if (subdomain && subdomain !== "www") {
      // Rewrite to /store/<slug>
      url.pathname = `/store/${subdomain}${url.pathname === "/" ? "" : url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // Check for custom domain (e.g. "my-artisan-bakery.com")
  if (!isPlatformHost && !isSubdomain) {
    // Platform utility paths should never be treated as store custom domain routes
    const isPlatformPath = [
      "/login",
      "/register",
      "/dashboard",
      "/admin",
      "/pricing",
      "/browse",
      "/cart",
      "/checkout",
      "/auth",
      "/stores",
      "/order-confirmation",
    ].some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));

    // If user accesses root or store pages on a custom domain, rewrite to store handler
    if (!isPlatformPath && !url.pathname.startsWith("/store/")) {
      url.pathname = `/store/${hostWithoutPort}${url.pathname === "/" ? "" : url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
