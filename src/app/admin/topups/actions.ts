"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { servicesEnabled, ServiceCallError } from "@/lib/bff/client";
import { reviewManualPaymentViaServices } from "@/lib/bff/admin";

export async function reviewTopUp(formData: FormData) {
  if (!servicesEnabled()) redirect("/admin/topups");
  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "").toUpperCase() === "APPROVE" ? "APPROVE" : "REJECT";
  const note = String(formData.get("note") || "").trim();
  let err = "";
  try {
    await reviewManualPaymentViaServices(id, decision, note || undefined);
  } catch (e) {
    if (!(e instanceof ServiceCallError)) throw e;
    err = e.status >= 500 ? "The payment service is unavailable. Try again shortly." : e.message;
  }
  revalidatePath("/admin/topups");
  redirect(err ? `/admin/topups?error=${encodeURIComponent(err)}` : `/admin/topups?done=${decision === "APPROVE" ? "approved" : "rejected"}`);
}
