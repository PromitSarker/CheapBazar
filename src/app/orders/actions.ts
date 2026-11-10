"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { servicesEnabled } from "@/lib/bff/client";
import { cancelMyOrderViaServices } from "@/lib/bff/orders";

export async function cancelOrder(formData: FormData) {
  if (!servicesEnabled()) redirect("/");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") || "");
  const r = await cancelMyOrderViaServices(user.id, id);
  revalidatePath("/orders");
  redirect(r.ok ? "/orders?cancelled=1" : `/orders?error=${encodeURIComponent(r.error || "Could not cancel the order.")}`);
}
