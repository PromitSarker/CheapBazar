"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/auth";
import { servicesEnabled } from "@/lib/bff/client";
import { bookAdViaServices, cancelAdViaServices } from "@/lib/bff/ads";
import { UploadError } from "@/lib/security/uploads";
import { saveImageUpload } from "@/lib/security/store-upload";
import { RateLimiter } from "@/lib/security/ratelimit";

const perStore = new RateLimiter(10, 60 * 60_000);
const back = (qs: string) => redirect(`/dashboard/ads?${qs}`);

export async function bookAd(formData: FormData) {
  if (!servicesEnabled()) back("error=" + encodeURIComponent("Ad booking is not available yet."));
  const store = await requireStore();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!perStore.allow(store.id)) back("error=" + encodeURIComponent("Too many ad requests. Please try again later."));

  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) back("error=" + encodeURIComponent("Please upload a banner image."));
  let imageUrl = "";
  try {
    imageUrl = await saveImageUpload(file as File);
  } catch (e) {
    if (e instanceof UploadError) back("error=" + encodeURIComponent(e.message));
    throw e;
  }

  const r = await bookAdViaServices({
    storeId: store.id, ownerId: user.id,
    slot: String(formData.get("slot") || ""),
    headline: String(formData.get("headline") || "").trim(),
    imageUrl,
    targetUrl: String(formData.get("targetUrl") || "").trim() || `/store/${store.slug}`,
    startDate: String(formData.get("startDate") || ""),
    endDate: String(formData.get("endDate") || ""),
  });
  revalidatePath("/dashboard/ads");
  if (!r.ok) back("error=" + encodeURIComponent(r.error));
  back("booked=" + encodeURIComponent((r as { bookingNumber: string }).bookingNumber));
}

export async function cancelAd(formData: FormData) {
  if (!servicesEnabled()) back("error=" + encodeURIComponent("Not available."));
  const store = await requireStore();
  const r = await cancelAdViaServices(store.id, String(formData.get("id") || ""));
  revalidatePath("/dashboard/ads");
  if (!r.ok) back("error=" + encodeURIComponent(r.error || "Could not cancel."));
  back("cancelled=1");
}
