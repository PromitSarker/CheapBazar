import { prisma } from "@/lib/db";
import LandingView from "@/components/landing/LandingView";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const stores = await prisma.store.findMany({
    take: 6,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { products: true } } },
  });

  const storeItems = stores.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    productCount: s._count.products,
  }));

  return <LandingView stores={storeItems} />;
}

