import { notFound, redirect } from "next/navigation";
import { requireStore } from "@/lib/tenant";
import { servicesEnabled } from "@/lib/bff/client";
import { categoryChoices, getSellerProduct } from "@/lib/bff/catalogue";
import ProductEditView from "@/components/dashboard/ProductEditView";
import { updateProduct } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; msg?: string } }) {
  const store = await requireStore();
  if (!servicesEnabled()) redirect("/dashboard/products");
  const [product, categories] = await Promise.all([getSellerProduct(store.id, params.id), categoryChoices()]);
  if (!product) notFound(); // missing, or another shop's product
  return (
    <ProductEditView
      id={product.id}
      initial={product}
      categories={categories}
      wholesale
      action={updateProduct}
      error={searchParams.error}
      message={searchParams.msg}
    />
  );
}
