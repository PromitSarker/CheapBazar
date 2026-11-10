"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateStoreStatusByAdmin, setStoreKycByAdmin } from "@/modules/admin/service";
import { ServiceCallError } from "@/lib/bff/client";
import type { StoreStatus } from "@/modules/identity/types";

export async function changeStoreStatus(formData: FormData) {
  const storeId = String(formData.get("storeId"));
  const status = String(formData.get("status")) as StoreStatus;
  const kyc = formData.get("kycVerified") === "true";

  if (!storeId || !status) return;

  let err = "";
  try {
    await updateStoreStatusByAdmin(storeId, status, kyc);
  } catch (e) {
    if (!(e instanceof ServiceCallError)) throw e;
    err = e.status >= 500 ? "A platform service is unavailable. Try again shortly." : e.message;
  }
  revalidatePath("/admin/stores");
  revalidatePath("/admin");
  if (err) redirect(`/admin/stores?error=${encodeURIComponent(err)}`);
}

export async function toggleStoreKYC(formData: FormData) {
  const storeId = String(formData.get("storeId"));
  const kycVerified = formData.get("currentKyc") !== "true";

  if (!storeId) return;

  await setStoreKycByAdmin(storeId, kycVerified);
  revalidatePath("/admin/stores");
}
