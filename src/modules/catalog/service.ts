import { prisma } from "@/lib/db";
import { withTenant } from "@/lib/rls";

export interface ProductVM {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  image?: string | null;
}

export interface StoreVM {
  id: string;
  name: string;
  slug: string;
  template: string;
  status: string;
  customDomain?: string | null;
}

export async function getPublicStoreWithProducts(identifier: string) {
  // Can be resolved either by slug or by custom domain
  const store = await prisma.store.findFirst({
    where: {
      OR: [
        { slug: identifier },
        { customDomain: identifier }
      ]
    },
    include: {
      products: { orderBy: { createdAt: "desc" } }
    }
  });

  if (!store) return null;

  const vm: StoreVM = {
    id: store.id,
    name: store.name,
    slug: store.slug,
    template: store.template,
    status: store.status,
    customDomain: store.customDomain,
  };

  const products: ProductVM[] = store.products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: Number(p.price),
    stock: p.stock,
    image: p.image,
  }));

  return { store: vm, products };
}

export async function getStoreCatalog(storeId: string) {
  return prisma.product.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
  });
}
