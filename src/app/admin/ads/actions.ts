"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/modules/identity/service";
import { servicesEnabled, ServiceCallError } from "@/lib/bff/client";
import { reviewAdViaServices } from "@/lib/bff/ads";

export async function reviewAd(formData: FormData) {
  const admin = await requireRole("ADMIN");
  if (!servicesEnabled()) redirect("/admin/ads");
  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "").toUpperCase() === "APPROVE" ? "APPROVE" : "REJECT";
  const note = String(formData.get("note") || "").trim();
  let err = "";
  try {
    await reviewAdViaServices(id, decision, admin.email, note || undefined);
  } catch (e) {
    if (!(e instanceof ServiceCallError)) throw e;
    err = e.status >= 500 ? "A platform service is unavailable. Try again shortly." : e.message;
  }
  revalidatePath("/admin/ads");
  redirect(err ? `/admin/ads?error=${encodeURIComponent(err)}` : `/admin/ads?done=${decision === "APPROVE" ? "approved" : "rejected"}`);
}
