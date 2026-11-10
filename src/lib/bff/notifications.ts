/**
 * In-app notifications (the bell) through notification-service. Always scoped to the
 * signed-in user: the user id comes from the session, never from a request field.
 */
import { callService } from "./client";

export interface InboxItem {
  id: string; kind: string; title: string; body: string; link: string | null; read: boolean; createdAt: string;
}

/** Only same-site paths are ever followed: "/x" yes; "//evil.com", "https://..." and "javascript:" no. */
export function safeLink(link: string | null | undefined): string | null {
  if (!link || !/^\/(?!\/)[A-Za-z0-9/_\-?=&%.#]*$/.test(link)) return null;
  return link;
}

/** For the header on every page: must never slow down or break a page, so it fails to 0. */
export async function unreadCountViaServices(userId: string): Promise<number> {
  try {
    const r = await callService<{ unreadCount: number }>("notification", "GET", `/notifications/unread-count?userId=${encodeURIComponent(userId)}`, undefined, { timeoutMs: 1200 });
    return Number(r.unreadCount) || 0;
  } catch {
    return 0;
  }
}

export async function inboxViaServices(userId: string, lang: "en" | "bn", limit = 50): Promise<{ items: InboxItem[]; unread: number }> {
  const r = await callService<{ notifications: any[]; unreadCount: number }>(
    "notification", "GET", `/notifications?userId=${encodeURIComponent(userId)}&lang=${lang}&limit=${limit}`
  );
  return {
    unread: r.unreadCount,
    items: r.notifications.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: safeLink(n.link), read: !!n.readAt, createdAt: n.createdAt })),
  };
}

export async function markReadViaServices(userId: string, what: { ids: string[] } | { all: true }) {
  return callService<{ updated: number }>("notification", "POST", "/notifications/read", { userId, ...what });
}
