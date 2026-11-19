import type { Metadata } from "next";
import { adsenseConfig } from "@/lib/adnetwork";

export const metadata: Metadata = { title: "Privacy policy — Cheap-Bazar" };
export const dynamic = "force-dynamic";

const UPDATED = "19 November 2026";

export default function PrivacyPage() {
  const email = process.env.SUPPORT_EMAIL || "support@cheapbazar.org";
  const ads = adsenseConfig().enabled;
  return (
    <article className="legal">
      <h1>Privacy policy</h1>
      <p className="muted">Last updated {UPDATED}</p>

      <p>Cheap-Bazar (&ldquo;we&rdquo;) runs an online marketplace where shops in Bangladesh sell to buyers. This page explains what we collect, why, and the choices you have.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details</strong> — name, phone number, email and a password (stored only as a one-way hash).</li>
        <li><strong>Order details</strong> — delivery address, items bought and order status, shared with the shop you order from and the courier delivering it.</li>
        <li><strong>Approximate location</strong> — only if you choose to share it, to show shops near you. It is used for that request and is not kept.</li>
        <li><strong>Technical data</strong> — device and browser type and pages visited, used to keep the service secure and working.</li>
      </ul>

      <h2>How we use it</h2>
      <p>To run your account, process and deliver orders, prevent fraud, send order updates, and improve the service. We do not sell your personal details.</p>

      <h2>Advertising</h2>
      <p>The marketplace shows two kinds of ads, always marked <em>Ad</em> or <em>Sponsored</em>: banners booked by shops on Cheap-Bazar, and ads served by Google{ads ? "" : " (when enabled)"}.</p>
      <ul>
        <li>Google and its partners use cookies and similar technologies to show ads based on your visits to this and other websites, and to measure them. Google&rsquo;s use of advertising cookies lets it and its partners serve ads to you based on your visit to our site and/or other sites on the Internet.</li>
        <li>You can opt out of personalised advertising in <a href="https://adssettings.google.com" rel="noopener noreferrer">Google Ads Settings</a>, or learn more at <a href="https://www.aboutads.info" rel="noopener noreferrer">aboutads.info</a>. How Google handles data from partner sites is explained at <a href="https://policies.google.com/technologies/partner-sites" rel="noopener noreferrer">policies.google.com/technologies/partner-sites</a>.</li>
        <li>In the mobile app, ads are served by Google AdMob and may use your device&rsquo;s advertising ID. You can reset or opt out of it in your Android settings (Settings → Google → Ads).</li>
        <li>We never show third-party ads on your account, checkout, payment or seller dashboard pages.</li>
      </ul>

      <h2>Cookies</h2>
      <p>We use cookies to keep you signed in, remember your language and location choice, and (for ads) as described above. You can block cookies in your browser; some features, such as signing in, will then not work.</p>

      <h2>Sharing</h2>
      <p>We share data only with: the shop and courier fulfilling your order, payment providers when you pay online, service providers who host and secure the platform, and authorities when the law requires it.</p>

      <h2>Your choices</h2>
      <p>You can view and edit your details in your account, and delete your account from the app (Account → Delete account). To ask for a copy of your data or anything else, write to <a href={`mailto:${email}`}>{email}</a>.</p>

      <h2>Children</h2>
      <p>Cheap-Bazar is not directed at children under 13 and we do not knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>If we change this policy we will update the date above.</p>
    </article>
  );
}
