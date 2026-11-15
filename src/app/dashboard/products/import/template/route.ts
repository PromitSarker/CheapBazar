import { templateCsv } from "@/lib/catalogue/import";

export const dynamic = "force-static";

/** Example CSV with the expected columns (Excel-friendly: UTF-8 with BOM). */
export function GET() {
  return new Response(templateCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="cheapbazar-products-template.csv"',
      "x-content-type-options": "nosniff",
    },
  });
}
