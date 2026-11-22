"use client";

import { useEffect, useRef } from "react";
import { isAdFreePath } from "./AdsenseLoader";
import { usePathname } from "next/navigation";

declare global {
  interface Window { adsbygoogle?: unknown[] }
}

/**
 * One responsive AdSense unit with a quiet "Ad" label. The wrapper collapses (CSS) when Google
 * reports no fill, so an empty placement never leaves a blank box.
 */
export default function AdsenseUnit({ client, slot, className = "" }: { client: string; slot: string; className?: string }) {
  const pushed = useRef(false);
  const path = usePathname();
  const blocked = isAdFreePath(path);

  useEffect(() => {
    if (blocked || pushed.current) return;
    pushed.current = true; // React strict mode runs effects twice in dev; one push per <ins>
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* ad blockers / script not loaded: the unit just stays empty */
    }
  }, [blocked]);

  if (blocked) return null;
  return (
    <aside className={`ad-network ${className}`.trim()} aria-label="Advertisement" data-ad-network="adsense">
      <span className="ad-tag">Ad</span>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
