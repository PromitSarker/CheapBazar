"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { servicesEnabled } from "@/lib/bff/client";
import { getServerLanguage } from "@/modules/i18n/server";
import { inboxViaServices, markReadViaServices } from "@/lib/bff/notifications";

/** Mark one notification read, then go where it points. The target comes from the stored
 *  notification (looked up for THIS user), never from the form. */
export async function openNotification(formData: FormData) {
  if (!servicesEnabled()) redirect("/");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") || "");
  const { items } = await inboxViaServices(user.id, await getServerLanguage(), 100);
  const item = items.find((i) => i.id === id);
  if (item) await markReadViaServices(user.id, { ids: [id] });
  revalidatePath("/notifications");
  redirect(item?.link ?? "/notifications");
}

export async function markAllRead() {
  if (!servicesEnabled()) redirect("/");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await markReadViaServices(user.id, { all: true });
  revalidatePath("/notifications");
  redirect("/notifications");
}
