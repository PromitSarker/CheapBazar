"use client";

import { useEffect, useRef, useState } from "react";

const BN = "০১২৩৪৫৬৭৮৯";
const toLatin = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN.indexOf(d)));
const toBn = (s: string) => s.replace(/[0-9]/g, (d) => BN[+d]);
const NUM = /[0-9০-৯]+(?:[.,][0-9০-৯]+)*/;

/**
 * Counts the first number inside `value` up from 0 once, when it scrolls into view
 * ("৳ 150K+" -> "৳ 0" ... "৳ 150K+"). Works with Bangla digits. The full value is the SSR/no-JS
 * text, the final width is reserved (no layout shift), screen readers always get the final value,
 * and reduced-motion visitors just see the number.
 */
export default function CountUp({ value, duration = 1100 }: { value: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const played = useRef(false);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    setShown(value);
    const el = ref.current;
    const m = value.match(NUM);
    if (!el || !m || played.current || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const bn = /[০-৯]/.test(m[0]);
    const grouped = m[0].includes(",");
    const raw = toLatin(m[0]).replace(/,/g, "");
    const target = parseFloat(raw);
    if (!isFinite(target)) return;
    const decimals = (raw.split(".")[1] ?? "").length;
    const at = m.index ?? 0;
    const fmt = (n: number) => {
      let s = grouped
        ? n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : n.toFixed(decimals);
      if (bn) s = toBn(s);
      return value.slice(0, at) + s + value.slice(at + m[0].length);
    };

    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || played.current) return;
        played.current = true;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setShown(p >= 1 ? value : fmt(target * eased));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        setShown(fmt(0));
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className="count-up">
      <span className="sr-only">{value}</span>
      <span className="count-up-sizer" aria-hidden="true">{value}</span>
      <span className="count-up-live" aria-hidden="true">{shown}</span>
    </span>
  );
}
