"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { servicesEnabled, ServiceCallError } from "@/lib/bff/client";
import { setLocationPolicy } from "@/lib/bff/location";
import { requireRole } from "@/modules/identity/service";
import { MIN_RADIUS_KM, MAX_RADIUS_KM } from "../../../../packages/geo";

/** Turn the range limit on/off and set its radius. Admin only; the aggregator validates again. */
export async function saveRange(formData: FormData) {
  const admin = await requireRole("ADMIN");
  if (!servicesEnabled()) redirect("/admin/location");
  const enabled = formData.get("enabled") === "on";
  const preset = String(formData.get("preset") || "");
  const radiusKm = Number(String(preset === "custom" || !preset ? formData.get("custom") : preset).trim());
  if (!Number.isFinite(radiusKm) || radiusKm < MIN_RADIUS_KM || radiusKm > MAX_RADIUS_KM) {
    redirect(`/admin/location?error=${encodeURIComponent(`Enter a range between ${MIN_RADIUS_KM} and ${MAX_RADIUS_KM} km.`)}`);
  }
  let err = "";
  try {
    await setLocationPolicy(admin.email, { enabled, radiusKm });
  } catch (e) {
    if (!(e instanceof ServiceCallError)) throw e;
    err = e.status >= 500 ? "The search service is unavailable. Try again shortly." : e.message;
  }
  revalidatePath("/admin/location");
  revalidatePath("/", "layout");
  redirect(err ? `/admin/location?error=${encodeURIComponent(err)}` : `/admin/location?done=${enabled ? "Range limit is ON" : "Range limit is OFF"}`);
}
