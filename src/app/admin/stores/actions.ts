"use server";

import { revalidatePath } from "next/cache";
import { updateStoreStatusByAdmin } from "@/modules/admin/service";
import type { StoreStatus } from "@/modules/identity/types";

export async function changeStoreStatus(formData: FormData) {
  const storeId = String(formData.get("storeId"));
  const status = String(formData.get("status")) as StoreStatus;
  const kyc = formData.get("kycVerified") === "true";

  if (!storeId || !status) return;

  await updateStoreStatusByAdmin(storeId, status, kyc);
  revalidatePath("/admin/stores");
  revalidatePath("/admin");
}

export async function toggleStoreKYC(formData: FormData) {
  const storeId = String(formData.get("storeId"));
  const kycVerified = formData.get("currentKyc") !== "true";

  if (!storeId) return;

  await updateStoreStatusByAdmin(storeId, "ACTIVE", kycVerified);
  revalidatePath("/admin/stores");
}
