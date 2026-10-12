import { cookies } from "next/headers";
import type { Language, Translations } from "./types";
import { translations, formatTaka, toBengaliNumerals } from "./translations";

export async function getServerLanguage(): Promise<Language> {
  const cookieStore = cookies();
  const lang = cookieStore.get("sf_lang")?.value;
  return lang === "bn" ? "bn" : "en";
}

export async function getServerTranslations(): Promise<{
  lang: Language;
  t: Translations;
  formatMoney: (amount: number) => string;
  toNumerals: (val: number | string) => string;
}> {
  const lang = await getServerLanguage();
  return {
    lang,
    t: translations[lang],
    formatMoney: (amount: number) => formatTaka(amount, lang),
    toNumerals: (val: number | string) => (lang === "bn" ? toBengaliNumerals(val) : String(val)),
  };
}
