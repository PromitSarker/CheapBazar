import { NextResponse } from "next/server";
import { requireStore } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/auth";
import { servicesEnabled } from "@/lib/bff/client";
import { submitTopUpViaServices, listTopUpsViaServices } from "@/lib/bff/wallet";
import { RateLimiter } from "@/lib/security/ratelimit";

export const dynamic = "force-dynamic";

const byStore = new RateLimiter(10, 60 * 60_000); // top-up submissions per store per hour

/** Manual top-up (transaction id reviewed by an admin). Only exists on the services path. */
export async function POST(request: Request) {
  if (!servicesEnabled()) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const store = await requireStore();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!byStore.allow(store.id)) return NextResponse.json({ error: "Too many top-up requests. Please try again later." }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const r = await submitTopUpViaServices(store.id, user.id, Number(body.amount), String(body.method || ""), String(body.trxId || ""));
  return NextResponse.json(r.body, { status: r.status });
}

export async function GET() {
  if (!servicesEnabled()) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const store = await requireStore();
  const r = await listTopUpsViaServices(store.id);
  return NextResponse.json(r.body, { status: r.status });
}
