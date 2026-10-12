"use server";

import { revalidatePath } from "next/cache";
import { updateUserRoleByAdmin } from "@/modules/admin/service";
import type { UserRole } from "@/modules/identity/types";

export async function changeUserRole(formData: FormData) {
  const userId = String(formData.get("userId"));
  const role = String(formData.get("role")) as UserRole;

  if (!userId || !role) return;

  await updateUserRoleByAdmin(userId, role);
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}
