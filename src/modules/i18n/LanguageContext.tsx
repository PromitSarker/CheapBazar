"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import type { Language, Translations } from "./types";
import { translations, formatTaka, toBengaliNumerals } from "./translations";

interface LanguageContextType {
  lang: Language;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
  formatMoney: (amount: number) => string;
  toNumerals: (val: number | string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({
  children,
  initialLang = "en",
}: {
  children: React.ReactNode;
  initialLang?: Language;
}) {
  const [lang, setLangState] = useState<Language>(initialLang);

  useEffect(() => {
    // Check saved cookie or localStorage
    const savedCookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith("sf_lang="))
      ?.split("=")[1] as Language | undefined;

    const savedLocal = (localStorage.getItem("sf_lang") as Language) || undefined;
    const active = savedCookie || savedLocal || initialLang;
    if (active === "en" || active === "bn") {
      setLangState(active);
    }
  }, [initialLang]);

  const setLanguage = (newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem("sf_lang", newLang);
      document.cookie = `sf_lang=${newLang}; path=/; max-age=31536000; SameSite=Lax`;
      window.dispatchEvent(new Event("sf_lang_changed"));
    } catch {
      // Ignore storage errors
    }
  };

  const formatMoney = (amount: number) => formatTaka(amount, lang);
  const toNumerals = (val: number | string) => (lang === "bn" ? toBengaliNumerals(val) : String(val));

  return (
    <LanguageContext.Provider
      value={{
        lang,
        language: lang,
        setLanguage,
        t: translations[lang],
        formatMoney,
        toNumerals,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    // Fallback if rendered outside provider
    return {
      lang: "en" as Language,
      language: "en" as Language,
      setLanguage: () => {},
      t: translations.en,
      formatMoney: (n: number) => formatTaka(n, "en"),
      toNumerals: (v: number | string) => String(v),
    };
  }
  return context;
}

