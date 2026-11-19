import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About & contact — Cheap-Bazar" };
export const dynamic = "force-dynamic";

export default function AboutPage() {
  const email = process.env.SUPPORT_EMAIL || "support@cheapbazar.org";
  return (
    <article className="legal">
      <h1>About Cheap-Bazar</h1>
      <p>Cheap-Bazar is a marketplace for Bangladesh. Local shops open an online store in minutes, buyers find everyday goods from shops near them, and orders are paid in cash on delivery.</p>

      <h2>For buyers</h2>
      <p>Browse by category, compare prices across shops, and order with cash on delivery. Wholesale prices are available to Buyer Pro members.</p>

      <h2>For shops</h2>
      <p>Get a storefront, manage stock and orders from one dashboard, and promote your shop with sponsored banners. <Link href="/signup">Open your store</Link>.</p>

      <h2>Advertising</h2>
      <p>Shops can book banner space on the marketplace; the space not booked by shops may show ads from Google. Ads are always labelled. See our <Link href="/privacy">privacy policy</Link> for how ads use data.</p>

      <h2>Contact</h2>
      <p>Questions, complaints or ad enquiries: <a href={`mailto:${email}`}>{email}</a></p>
    </article>
  );
}
