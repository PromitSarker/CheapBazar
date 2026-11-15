"use client";

import React, { useEffect, useRef, useState } from "react";

const MAX_NEW = 6;

/**
 * Several product photos. The first one is the cover. When editing, existing photos are kept unless the
 * seller removes them (each kept photo is submitted as a hidden `keepImages` value).
 */
export default function ImagePicker({ existing = [], language, name = "images" }: { existing?: string[]; language: string; name?: string }) {
  const bn = language === "bn";
  const inputRef = useRef<HTMLInputElement>(null);
  const [kept, setKept] = useState<string[]>(existing);
  const [previews, setPreviews] = useState<{ url: string; name: string }[]>([]);
  const [tooMany, setTooMany] = useState(false);

  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setTooMany(files.length > MAX_NEW);
    setPreviews(files.slice(0, MAX_NEW).map((f) => ({ url: URL.createObjectURL(f), name: f.name })));
  };
  const clearNew = () => {
    setPreviews([]);
    setTooMany(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const thumb: React.CSSProperties = { width: 64, height: 64, objectFit: "cover", borderRadius: 10, border: "1px solid rgba(0,0,0,0.1)" };
  return (
    <div style={{ display: "grid", gap: "0.6rem" }}>
      {kept.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
          {kept.map((u, i) => (
            <div key={u} style={{ position: "relative" }}>
              <img src={u} alt="" style={thumb} />
              <input type="hidden" name="keepImages" value={u} />
              {i === 0 && <span style={{ position: "absolute", left: 4, bottom: 4, background: "#16a34a", color: "#fff", fontSize: 10, padding: "1px 5px", borderRadius: 6 }}>{bn ? "প্রচ্ছদ" : "Cover"}</span>}
              <button type="button" onClick={() => setKept(kept.filter((k) => k !== u))} aria-label={bn ? "ছবি সরান" : "Remove photo"}
                style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", lineHeight: "22px", padding: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}
      <input ref={inputRef} name={name} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple onChange={onFiles} style={{ fontSize: "0.9rem" }} />
      {previews.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", alignItems: "center" }}>
          {previews.map((p) => <img key={p.url} src={p.url} alt={p.name} style={thumb} />)}
          <button type="button" onClick={clearNew} className="link-button" style={{ fontSize: "0.85rem" }}>{bn ? "নতুন ছবি বাতিল" : "Clear new photos"}</button>
        </div>
      )}
      <span className="muted" style={{ fontSize: "0.8rem" }}>
        {tooMany
          ? (bn ? `একসাথে সর্বোচ্চ ${MAX_NEW}টি নতুন ছবি।` : `At most ${MAX_NEW} new photos at a time.`)
          : (bn ? "প্রথম ছবিটি প্রচ্ছদ হবে। PNG, JPG, GIF বা WebP, প্রতিটি ৫ MB এর কম।" : "The first photo is the cover. PNG, JPG, GIF or WebP, each under 5 MB.")}
      </span>
    </div>
  );
}
