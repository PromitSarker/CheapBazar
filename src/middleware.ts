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

  // Base platform domains
  const platformHosts = [
    "localhost:3000",
    "127.0.0.1:3000",
    "cheap-bazar.com",
    "www.cheap-bazar.com",
    "storeforge.dev",
    "www.storeforge.dev",
  ];

  const isPlatformHost = platformHosts.some((h) => hostname === h);

  // Check for subdomain e.g. "demo-bakery.localhost:3000" or "demo-bakery.cheap-bazar.com"
  const isSubdomain =
    !isPlatformHost &&
    (hostname.endsWith(".localhost:3000") ||
      hostname.endsWith(".cheap-bazar.com") ||
      hostname.endsWith(".storeforge.dev"));

  if (isSubdomain) {
    const subdomain = hostname.split(".")[0];
    if (subdomain && subdomain !== "www") {
      // Rewrite to /store/<slug>
      url.pathname = `/store/${subdomain}${url.pathname === "/" ? "" : url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // Check for custom domain (e.g. "my-artisan-bakery.com")
  if (!isPlatformHost && !isSubdomain) {
    // If user accesses root on a custom domain, rewrite to store handler for this custom domain
    if (!url.pathname.startsWith("/store/")) {
      url.pathname = `/store/${hostname}${url.pathname === "/" ? "" : url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
