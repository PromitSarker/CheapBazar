"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

/** Pages where no third-party ad code is ever loaded: back-office, auth, money and personal pages. */
const PRIVATE_PREFIXES = ["/dashboard", "/admin", "/login", "/signup", "/onboarding", "/payment", "/orders", "/pro", "/notifications", "/app", "/api"];

/** Checkout pages live under a store: /store/<slug>/order and below. */
const CHECKOUT_RE = /^\/store\/[^/]+\/order(\/|$)/;

export const isAdFreePath = (path: string | null | undefined) =>
  !!path && (PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)) || CHECKOUT_RE.test(path));

/** Loads Google's AdSense script on public pages only. Rendered by the root layout when AdSense is configured. */
export default function AdsenseLoader({ client }: { client: string }) {
  const path = usePathname();
  if (isAdFreePath(path)) return null;
  return (
    <Script
      id="adsense-loader"
      async
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`}
    />
  );
}
