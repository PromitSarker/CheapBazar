import { prisma } from "@/lib/db";
import LandingView from "@/components/landing/LandingView";
import { servicesEnabled } from "@/lib/bff/client";
import { storeDirectoryWithLocation, marketplaceAds } from "@/lib/bff/browse";
import { getBuyerLocation } from "@/lib/location";
import { webUnit } from "@/lib/adnetwork";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  if (servicesEnabled()) {
    const [dir, heroAds] = await Promise.all([
      storeDirectoryWithLocation(8, getBuyerLocation()).catch(() => null),
      marketplaceAds("HOME_HERO"),
    ]);
    return <LandingView stores={dir?.stores ?? []} heroAds={heroAds} networkAd={webUnit("home")} locationRequired={!!dir?.location.required} locationRadiusKm={dir?.location.radiusKm ?? null} />;
  }
  const stores = await prisma.store.findMany({
    take: 8,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { products: true } },
      products: { take: 2, select: { id: true, name: true, price: true } },
    },
  });

  const storeItems = stores.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    template: s.template,
    customDomain: s.customDomain,
    productCount: s._count.products,
    sampleProducts: s.products.map((p) => ({
      name: p.name,
      price: Number(p.price),
    })),
  }));

  return <LandingView stores={storeItems} />;
}

