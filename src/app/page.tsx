import { prisma } from "@/lib/db";
import LandingView from "@/components/landing/LandingView";
import { servicesEnabled } from "@/lib/bff/client";
import { storeDirectoryViaServices, marketplaceAds } from "@/lib/bff/browse";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  if (servicesEnabled()) {
    const [stores, heroAds] = await Promise.all([storeDirectoryViaServices(8).catch(() => []), marketplaceAds("HOME_HERO")]);
    return <LandingView stores={stores} heroAds={heroAds} />;
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

