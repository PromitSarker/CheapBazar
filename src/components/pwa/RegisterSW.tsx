"use client";

import { useEffect } from "react";

/** Registers the service worker. Browsers only allow it on HTTPS (or localhost); on plain http it silently does nothing. */
export default function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
