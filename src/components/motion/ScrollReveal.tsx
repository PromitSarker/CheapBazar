"use client";

import { useEffect } from "react";

/**
 * Subtle scroll reveal: elements that start BELOW the fold fade in and rise a few px as they
 * scroll into view, staggered across siblings. Progressive enhancement: SSR markup is fully
 * visible, nothing is hidden until this effect runs, elements already on screen are left alone,
 * and nothing happens at all for visitors who prefer reduced motion.
 */
const TARGETS = ".bento-header, .feature-box, .step-card, .testimonial-card, .faq-item, .final-cta-card";

export default function ScrollReveal() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timers: number[] = [];
    const touched: HTMLElement[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          el.classList.add("revealed");
          const delay = parseInt(el.style.getPropertyValue("--reveal-delay")) || 0;
          // Drop the helper classes once settled so hover transforms/transitions are unaffected.
          timers.push(
            window.setTimeout(() => {
              el.classList.remove("reveal-pending", "revealed");
              el.style.removeProperty("--reveal-delay");
            }, delay + 800),
          );
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );

    const groups = new Map<Element, HTMLElement[]>();
    document.querySelectorAll<HTMLElement>(TARGETS).forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) return; // already visible
      const parent = el.parentElement as Element;
      groups.set(parent, [...(groups.get(parent) ?? []), el]);
    });
    groups.forEach((els) =>
      els.forEach((el, i) => {
        el.style.setProperty("--reveal-delay", `${Math.min(i, 5) * 70}ms`);
        el.classList.add("reveal-pending");
        touched.push(el);
        io.observe(el);
      }),
    );

    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
      touched.forEach((el) => {
        el.classList.remove("reveal-pending", "revealed");
        el.style.removeProperty("--reveal-delay");
      });
    };
  }, []);

  return null;
}
