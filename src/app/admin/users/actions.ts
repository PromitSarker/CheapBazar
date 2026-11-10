"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateUserRoleByAdmin } from "@/modules/admin/service";
import { ServiceCallError } from "@/lib/bff/client";
import type { UserRole } from "@/modules/identity/types";

export async function changeUserRole(formData: FormData) {
  const userId = String(formData.get("userId"));
  const role = String(formData.get("role")) as UserRole;

  if (!userId || !role) return;

  let err = "";
  try {
    await updateUserRoleByAdmin(userId, role);
  } catch (e) {
    if (!(e instanceof ServiceCallError)) throw e;
    err = e.status >= 500 ? "The identity service is unavailable. Try again shortly." : e.message;
  }
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  if (err) redirect(`/admin/users?error=${encodeURIComponent(err)}`);
}
