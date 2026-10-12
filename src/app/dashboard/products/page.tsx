import { requireStore } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { addProduct, adjustStock, deleteProduct } from "./actions";
import ProductsInventoryView from "@/components/dashboard/ProductsInventoryView";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }: { searchParams: { error?: string } }) {
  const store = await requireStore();
  const raw = await prisma.product.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
  });
  const products = raw.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: Number(p.price),
    stock: p.stock,
    image: p.image,
  }));

  return (
    <ProductsInventoryView
      products={products}
      error={searchParams.error}
      addProductAction={addProduct}
      adjustStockAction={adjustStock}
      deleteProductAction={deleteProduct}
    />
  );
}

