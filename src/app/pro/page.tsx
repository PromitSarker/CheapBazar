import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { servicesEnabled } from "@/lib/bff/client";
import { buyerProPlan, buyerProStatus, myProPayments } from "@/lib/bff/browse";
import { payForPro } from "./actions";

export const dynamic = "force-dynamic";

const day = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : "");

export default async function ProPage({ searchParams }: { searchParams: { error?: string; sent?: string } }) {
  if (!servicesEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [plan, status, payments] = await Promise.all([buyerProPlan(), buyerProStatus(user.id), myProPayments(user.id)]);
  const pending = payments.find((p) => p.status === "PENDING");

  return (
    <div style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Buyer Pro</h1>
      <p className="muted">See wholesale prices, minimum quantities and volume discounts across the marketplace, and order in bulk.</p>

      {searchParams.error && <p className="error">{searchParams.error}</p>}
      {searchParams.sent && <p className="success" style={{ color: "var(--success)" }}>Payment submitted. Buyer Pro starts as soon as an admin confirms it.</p>}

      <div className="card" style={{ padding: "1.5rem", margin: "1.25rem 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <strong>{plan?.name ?? "Buyer Pro"}</strong>
          {plan && <span style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text-primary)" }}>৳{plan.price.toLocaleString("en-IN")} <small className="muted">/ {plan.periodDays} days</small></span>}
        </div>
        <p style={{ margin: "0.75rem 0 0 0" }}>
          Status:{" "}
          <strong style={{ color: status.active ? "var(--success)" : "var(--warning)" }}>
            {status.status === "NONE" ? "Not subscribed" : status.status}
          </strong>
          {status.active && status.currentPeriodEnd ? ` — active until ${day(status.currentPeriodEnd)}` : ""}
          {status.status === "GRACE" && status.graceEndsAt ? ` (renew by ${day(status.graceEndsAt)})` : ""}
        </p>
        {status.active && <Link href="/browse?tab=wholesale" className="button button-small glow-button" style={{ marginTop: "0.75rem" }}>Browse wholesale</Link>}
      </div>

      {pending ? (
        <div className="card" style={{ padding: "1.25rem" }}>
          <strong>Payment awaiting confirmation</strong>
          <p className="muted" style={{ margin: "0.4rem 0 0 0" }}>{pending.method} · <code>{pending.trxId}</code> · ৳{Number(pending.amount).toFixed(2)}. We will activate Buyer Pro once the payment is verified.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: "1.5rem" }}>
          <h3 style={{ marginTop: 0 }}>{status.active ? "Renew" : "Upgrade"}</h3>
          <p className="muted">
            Send ৳{plan?.price ?? "…"} to the platform by bKash, Nagad, Rocket or bank transfer ({process.env.TOPUP_INSTRUCTIONS || "ask support for the platform's payment account details"}), then enter the method and the transaction ID below.
          </p>
          <form action={payForPro} className="stack">
            <label>Payment method
              <select name="method" defaultValue="BKASH">
                <option value="BKASH">bKash</option><option value="NAGAD">Nagad</option><option value="ROCKET">Rocket</option><option value="BANK">Bank transfer</option>
              </select>
            </label>
            <label>Transaction ID<input name="trxId" required minLength={4} maxLength={40} placeholder="e.g. 9H7K2LMN4Q" /></label>
            <button type="submit" className="button glow-button">Submit payment for confirmation</button>
          </form>
        </div>
      )}
    </div>
  );
}
