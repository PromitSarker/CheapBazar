import { notFound } from "next/navigation";
import { getPublicStoreWithProducts } from "@/modules/catalog/service";
import TemplateClassic from "@/components/templates/TemplateClassic";
import TemplateModern from "@/components/templates/TemplateModern";

export const dynamic = "force-dynamic";

export default async function StorefrontPage({ params }: { params: { slug: string } }) {
  const data = await getPublicStoreWithProducts(params.slug);
  if (!data) notFound();

  const { store, products } = data;

  // Check store operational lifecycle status (Diagram 2)
  if (store.status === "SUSPENDED" || store.status === "BANNED") {
    return (
      <div className="status-screen" style={{ textAlign: "center", padding: "4rem 1rem" }}>
        <h1 style={{ color: "#ff6b6b" }}>Store Suspended</h1>
        <p className="muted">This storefront is currently suspended due to policy or verification review.</p>
      </div>
    );
  }

  if (store.status === "PAUSED" || store.status === "DELISTED") {
    return (
      <div className="status-screen" style={{ textAlign: "center", padding: "4rem 1rem" }}>
        <h1>Store Temporarily Offline</h1>
        <p className="muted">This storefront is currently paused by the merchant. Please check back later.</p>
      </div>
    );
  }

  const Template = store.template === "modern" ? TemplateModern : TemplateClassic;
  return <Template store={store} products={products} />;
}

