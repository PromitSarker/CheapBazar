import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { servicesEnabled } from "@/lib/bff/client";
import { getServerLanguage } from "@/modules/i18n/server";
import { inboxViaServices } from "@/lib/bff/notifications";
import { openNotification, markAllRead } from "./actions";

export const dynamic = "force-dynamic";

const when = (v: string) => new Date(v).toISOString().replace("T", " ").slice(0, 16);

export default async function NotificationsPage() {
  if (!servicesEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lang = await getServerLanguage();
  const { items, unread } = await inboxViaServices(user.id, lang);
  const bn = lang === "bn";

  return (
    <div style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{bn ? "নোটিফিকেশন" : "Notifications"}</h1>
        {unread > 0 && (
          <form action={markAllRead}>
            <button type="submit" className="button button-small button-outline">{bn ? "সব পঠিত করুন" : "Mark all as read"} ({unread})</button>
          </form>
        )}
      </div>

      {items.length === 0 && (
        <div className="card" style={{ padding: "1.5rem", margin: "1.25rem 0" }}>
          <p style={{ margin: 0 }}>{bn ? "এখনো কোনো নোটিফিকেশন নেই।" : "Nothing here yet. Order updates, payment decisions and store alerts will show up here."}</p>
        </div>
      )}

      {items.map((n) => (
        <form key={n.id} action={openNotification} className="card" style={{ padding: "1rem 1.25rem", margin: "0.75rem 0", borderLeft: n.read ? "3px solid transparent" : "3px solid #38bdf8", opacity: n.read ? 0.75 : 1 }}>
          <input type="hidden" name="id" value={n.id} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
            <strong>{n.title}</strong>
            <span className="muted small" style={{ whiteSpace: "nowrap" }}>{when(n.createdAt)}</span>
          </div>
          <p style={{ margin: "0.4rem 0 0 0" }}>{n.body}</p>
          <button type="submit" className="button button-small button-outline" style={{ marginTop: "0.6rem" }}>
            {n.link ? (bn ? "খুলুন" : "Open") : n.read ? (bn ? "ঠিক আছে" : "OK") : (bn ? "পঠিত করুন" : "Mark as read")}
          </button>
        </form>
      ))}
    </div>
  );
}
