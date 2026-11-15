import { redirect } from "next/navigation";
import { requireStore } from "@/lib/tenant";
import { servicesEnabled } from "@/lib/bff/client";
import { categoryChoices } from "@/lib/bff/catalogue";
import ImportView from "@/components/dashboard/ImportView";
import { commitImport, previewImport } from "./actions";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireStore();
  if (!servicesEnabled()) redirect("/dashboard/products");
  const categories = await categoryChoices();
  return <ImportView categories={categories} previewAction={previewImport} commitAction={commitImport} />;
}
