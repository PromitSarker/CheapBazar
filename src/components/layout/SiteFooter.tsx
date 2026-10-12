"use client";

import React from "react";
import { useLanguage } from "@/modules/i18n/LanguageContext";

export default function SiteFooter() {
  const { t } = useLanguage();
  return <footer className="site-footer">{t.footerText}</footer>;
}
