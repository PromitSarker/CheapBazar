import { requireStore } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { servicesEnabled } from "@/lib/bff/client";
import { listProductsViaServices } from "@/lib/bff/portal";
import { categoryChoices } from "@/lib/bff/catalogue";
import { addProduct, adjustStock, deleteProduct } from "./actions";
import ProductsInventoryView from "@/components/dashboard/ProductsInventoryView";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }: { searchParams: { error?: string; msg?: string; saved?: string } }) {
  const store = await requireStore();
  const categories = servicesEnabled() ? await categoryChoices() : [];
  const products = servicesEnabled()
    ? await listProductsViaServices(store.id)
    : (
        await prisma.product.findMany({
          where: { storeId: store.id },
          orderBy: { createdAt: "desc" },
        })
      ).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        stock: p.stock,
        image: p.image,
        categoryId: null as string | null,
        compareAtPrice: null as number | null,
      }));

  return (
    <ProductsInventoryView
      products={products}
      error={searchParams.error}
      message={searchParams.msg}
      saved={searchParams.saved === "1"}
      categories={categories}
      wholesale={servicesEnabled()}
      addProductAction={addProduct}
      adjustStockAction={adjustStock}
      deleteProductAction={deleteProduct}
    />
  );
}

