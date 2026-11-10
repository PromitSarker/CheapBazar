import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getServerLanguage } from "@/modules/i18n/server";
import { LanguageProvider } from "@/modules/i18n/LanguageContext";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import { servicesEnabled } from "@/lib/bff/client";
import { unreadCountViaServices } from "@/lib/bff/notifications";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Cheap-Bazar — Create your own store",
  description: "Spin up a storefront in minutes. Built-in templates, simple inventory management in Bangladeshi Taka.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, initialLang] = await Promise.all([
    getCurrentUser(),
    getServerLanguage(),
  ]);

  const unread = user && servicesEnabled() ? await unreadCountViaServices(user.id) : 0;

  return (
    <html lang={initialLang}>
      <body className={outfit.className}>
        <LanguageProvider initialLang={initialLang}>
          <div className="bg-gradient-mesh"></div>
          <SiteHeader user={user} marketplace={servicesEnabled()} unread={unread} />
          <main className="site-main">{children}</main>
          <SiteFooter />
        </LanguageProvider>
      </body>
    </html>
  );
}

