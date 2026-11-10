"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { servicesEnabled, ServiceCallError } from "@/lib/bff/client";
import { setBuyerProPlanViaServices, setAdSlotViaServices, revokeProPaymentViaServices } from "@/lib/bff/admin";

async function run(fn: () => Promise<unknown>, done: string): Promise<never> {
  if (!servicesEnabled()) redirect("/admin/billing");
  let err = "";
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof ServiceCallError)) throw e;
    err = e.status >= 500 ? "A service is unavailable. Try again shortly." : e.message;
  }
  revalidatePath("/admin/billing");
  redirect(err ? `/admin/billing?error=${encodeURIComponent(err)}` : `/admin/billing?done=${encodeURIComponent(done)}`);
}

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim());

export async function savePlan(formData: FormData) {
  const price = num(formData.get("price")), periodDays = num(formData.get("periodDays")), graceDays = num(formData.get("graceDays"));
  if (![price, periodDays, graceDays].every(Number.isFinite)) redirect(`/admin/billing?error=${encodeURIComponent("Enter numbers for price, period and grace days.")}`);
  await run(() => setBuyerProPlanViaServices({ price, periodDays, graceDays }), "Buyer Pro plan saved");
}

export async function saveSlot(formData: FormData) {
  const code = String(formData.get("code") || "");
  const pricePerDay = num(formData.get("pricePerDay")), capacity = num(formData.get("capacity"));
  if (![pricePerDay, capacity].every(Number.isFinite)) redirect(`/admin/billing?error=${encodeURIComponent("Enter numbers for price and capacity.")}`);
  await run(() => setAdSlotViaServices({
    code, name: String(formData.get("name") || code), placement: String(formData.get("placement") || ""),
    capacity, pricePerDay, active: formData.get("active") === "on",
  }), `Ad slot ${code} saved`);
}

export async function revokePayment(formData: FormData) {
  const id = String(formData.get("id") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!reason) redirect(`/admin/billing?error=${encodeURIComponent("A reason is required to revoke a payment.")}`);
  await run(() => revokeProPaymentViaServices(id, reason), "Payment revoked");
}
