"use client";

import React from "react";
import { useLanguage } from "@/modules/i18n/LanguageContext";
import { useRouter } from "next/navigation";

export default function LanguageSwitcher() {
  const { lang, setLanguage } = useLanguage();
  const router = useRouter();

  const handleSwitch = (newLang: "en" | "bn") => {
    if (newLang === lang) return;
    setLanguage(newLang);
    router.refresh();
  };

  return (
    <div
      className="lang-switcher-tab"
      style={{
        display: "inline-flex",
        alignItems: "center",
        backgroundColor: "rgba(255, 255, 255, 0.08)",
        borderRadius: "999px",
        padding: "3px",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        fontSize: "0.8rem",
        fontWeight: 600,
      }}
    >
      <button
        type="button"
        onClick={() => handleSwitch("en")}
        style={{
          background: lang === "en" ? "#ffffff" : "transparent",
          color: lang === "en" ? "#09090b" : "#a1a1aa",
          border: "none",
          borderRadius: "999px",
          padding: "4px 10px",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "0.75rem",
          transition: "all 0.2s ease",
          boxShadow: lang === "en" ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
        }}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => handleSwitch("bn")}
        style={{
          background: lang === "bn" ? "#10b981" : "transparent",
          color: lang === "bn" ? "#ffffff" : "#a1a1aa",
          border: "none",
          borderRadius: "999px",
          padding: "4px 10px",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "0.75rem",
          transition: "all 0.2s ease",
          boxShadow: lang === "bn" ? "0 1px 3px rgba(16,185,129,0.3)" : "none",
        }}
      >
        বাংলা
      </button>
    </div>
  );
}
