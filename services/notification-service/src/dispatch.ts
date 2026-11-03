import crypto from "crypto";
import type { EventEnvelope } from "../../../packages/event-bus";
import type { Runner } from "./db";
import type { Directory } from "./directory";
import { plan, type PlannedNotification } from "./templates";

async function resolveRecipients(dir: Directory, to: PlannedNotification["to"]): Promise<string[]> {
  if (to.admins) return dir.admins();
  if (to.userId) return [to.userId];
  if (to.storeId) {
    const owner = await dir.storeOwner(to.storeId);
    return owner ? [owner] : [];
  }
  return [];
}

export interface NewNotification {
  userId: string;
  storeId?: string | null;
  kind: string;
  title: string;
  body: string;
  titleBn?: string;
  bodyBn?: string;
  link?: string | null;
  dedupeKey: string;
  email?: boolean;
}

/** Idempotent insert: returns true only if this call created the notification. */
export async function insertNotification(tx: Runner, n: NewNotification): Promise<boolean> {
  const rows = await tx.$executeRawUnsafe(
    `INSERT INTO "Notification" ("id","userId","storeId","kind","title","body","titleBn","bodyBn","link","dedupeKey")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT ("dedupeKey") DO NOTHING`,
    crypto.randomUUID(), n.userId, n.storeId ?? null, n.kind, n.title, n.body, n.titleBn ?? "", n.bodyBn ?? "", n.link ?? null, n.dedupeKey
  );
  if (rows === 0) return false;
  if (n.email) {
    await insertDelivery(tx, {
      channel: "EMAIL", toUserId: n.userId, subject: n.title,
      body: n.bodyBn ? `${n.body}\n\n${n.bodyBn}` : n.body, dedupeKey: `email:${n.dedupeKey}`,
    });
  }
  return true;
}

export async function insertDelivery(
  tx: Runner,
  d: { channel: "EMAIL" | "SMS"; toUserId?: string; toAddress?: string; subject?: string; body: string; dedupeKey: string }
) {
  await tx.$executeRawUnsafe(
    `INSERT INTO "Delivery" ("id","channel","toUserId","toAddress","subject","body","dedupeKey")
     VALUES ($1,$2::"DeliveryChannel",$3,$4,$5,$6,$7) ON CONFLICT ("dedupeKey") DO NOTHING`,
    crypto.randomUUID(), d.channel, d.toUserId ?? null, d.toAddress ?? null, d.subject ?? null, d.body, d.dedupeKey
  );
}

/** Event -> notifications + deliveries, all inside the caller's (event handler) transaction. */
export async function apply(tx: Runner, dir: Directory, env: EventEnvelope) {
  const p = plan(env);
  let created = 0;
  for (const n of p.notifications) {
    const users = await resolveRecipients(dir, n.to);
    if (users.length === 0) console.warn(`[notification] no recipient for ${env.eventType} (${JSON.stringify(n.to)})`);
    for (const userId of users) {
      const ok = await insertNotification(tx, {
        userId, storeId: n.to.storeId ?? (env.data?.storeId ?? null), kind: n.kind,
        title: n.en.title, body: n.en.body, titleBn: n.bn.title, bodyBn: n.bn.body,
        link: n.link, dedupeKey: `${n.dedupe}|${userId}`, email: n.email,
      });
      if (ok) created++;
    }
  }
  for (const s of p.sms) {
    await insertDelivery(tx, { channel: "SMS", toAddress: s.phone, body: s.text, dedupeKey: `sms:${s.dedupe}|${s.phone}` });
  }
  return { created, sms: p.sms.length };
}
