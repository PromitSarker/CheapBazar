"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { servicesEnabled } from "@/lib/bff/client";
import { submitProPayment } from "@/lib/bff/browse";
import { RateLimiter } from "@/lib/security/ratelimit";

const perUser = new RateLimiter(5, 60 * 60_000);
function back(qs: string): never { return redirect(`/pro?${qs}`); }

export async function payForPro(formData: FormData) {
  if (!servicesEnabled()) redirect("/");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!perUser.allow(user.id)) back("error=" + encodeURIComponent("Too many payment submissions. Please try again later."));
  const r = await submitProPayment(user.id, String(formData.get("method") || ""), String(formData.get("trxId") || ""));
  if (!r.ok) back("error=" + encodeURIComponent(r.error));
  back(r.duplicate ? "sent=again" : "sent=1");
}
