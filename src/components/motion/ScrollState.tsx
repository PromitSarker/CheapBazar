"use client";

import { useEffect } from "react";

/** Sets data-scrolled on <html> once the page is scrolled a little, so CSS can give the header a soft shadow. */
export default function ScrollState() {
  useEffect(() => {
    const root = document.documentElement;
    let last = false;
    let ticking = false;
    const update = () => {
      ticking = false;
      const now = window.scrollY > 8;
      if (now === last) return;
      last = now;
      if (now) root.setAttribute("data-scrolled", "1");
      else root.removeAttribute("data-scrolled");
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      root.removeAttribute("data-scrolled");
    };
  }, []);
  return null;
}
