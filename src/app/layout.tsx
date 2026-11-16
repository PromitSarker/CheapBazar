import type { Metadata, Viewport } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getServerLanguage } from "@/modules/i18n/server";
import { LanguageProvider } from "@/modules/i18n/LanguageContext";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import { servicesEnabled } from "@/lib/bff/client";
import { unreadCountViaServices } from "@/lib/bff/notifications";
import { locationPolicy } from "@/lib/bff/location";
import { getBuyerLocation } from "@/lib/location";
import { Outfit, Noto_Sans_Bengali } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], display: "swap", variable: "--font-latin" });
// Outfit has no Bengali glyphs; without this the browser falls back to an arbitrary system font.
const bengali = Noto_Sans_Bengali({ subsets: ["bengali"], display: "swap", variable: "--font-bn" });

export const metadata: Metadata = {
  title: "Cheap-Bazar — Create your own store",
  description: "Spin up a storefront in minutes. Built-in templates, simple inventory management in Bangladeshi Taka.",
  applicationName: "Cheap-Bazar",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, initialLang] = await Promise.all([
    getCurrentUser(),
    getServerLanguage(),
  ]);

  const unread = user && servicesEnabled() ? await unreadCountViaServices(user.id) : 0;
  // The buyer's location chip is only shown while the admin's range limit is on (and never to admins/sellers).
  const policy = servicesEnabled() && user?.role !== "ADMIN" && user?.role !== "SELLER" ? await locationPolicy() : null;
  const buyerLoc = policy?.enabled ? getBuyerLocation() : null;

  return (
    <html lang={initialLang}>
      <body className={`${outfit.variable} ${bengali.variable}`}>
        <LanguageProvider initialLang={initialLang}>
          <SiteHeader user={user} marketplace={servicesEnabled()} unread={unread} locationUi={policy?.enabled ? { radiusKm: policy.radiusKm, current: buyerLoc } : null} />
          <main className="site-main">{children}</main>
          <SiteFooter />
        </LanguageProvider>
      </body>
    </html>
  );
}

