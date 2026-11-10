import type { Db } from "./db";
import type { Directory } from "./directory";
import { normalizeBdPhone, type Providers } from "./providers";

export const MAX_ATTEMPTS = 6;
const LEASE_SECONDS = 60;
const GUEST_EMAIL_DOMAIN = "@storeforge.buyer"; // placeholder addresses generated for guest checkouts

interface Claimed {
  id: string;
  channel: "EMAIL" | "SMS";
  toUserId: string | null;
  toAddress: string | null;
  subject: string | null;
  body: string;
  attempts: number;
}

/**
 * Send due deliveries. Claiming uses a short lease (FOR UPDATE SKIP LOCKED) so several
 * workers never double-send and a crashed worker's rows come back. A failing provider
 * only delays that row (exponential backoff); after MAX_ATTEMPTS it is marked FAILED.
 */
export async function processDeliveries(db: Db, providers: Providers, dir: Directory, limit = 25) {
  const rows = await db.$queryRawUnsafe<Claimed[]>(
    `UPDATE "Delivery" SET "attempts" = "attempts" + 1, "nextAttemptAt" = now() + ($1 * interval '1 second')
      WHERE "id" IN (
        SELECT "id" FROM "Delivery" WHERE "status" = 'PENDING' AND "nextAttemptAt" <= now()
         ORDER BY "createdAt" LIMIT $2 FOR UPDATE SKIP LOCKED)
      RETURNING "id","channel","toUserId","toAddress","subject","body","attempts"`,
    LEASE_SECONDS, limit
  );
  const stats = { sent: 0, skipped: 0, retried: 0, failed: 0 };

  for (const r of rows) {
    const done = (status: "SENT" | "SKIPPED", note?: string) =>
      db.$executeRawUnsafe(
        `UPDATE "Delivery" SET "status" = $2::"DeliveryStatus", "sentAt" = CASE WHEN $2 = 'SENT' THEN now() ELSE NULL END, "lastError" = $3 WHERE "id" = $1`,
        r.id, status, note ?? null
      );
    try {
      if (r.channel === "EMAIL") {
        const to = r.toAddress ?? (r.toUserId ? (await dir.user(r.toUserId))?.email : undefined);
        if (!to || to.endsWith(GUEST_EMAIL_DOMAIN)) { await done("SKIPPED", "no deliverable email address"); stats.skipped++; continue; }
        const res = await providers.email(to, r.subject ?? "Cheap-Bazar", r.body);
        if (res === "sent") { await done("SENT"); stats.sent++; } else { await done("SKIPPED", "email provider not configured"); stats.skipped++; }
      } else {
        const phone = normalizeBdPhone(r.toAddress ?? "");
        if (!phone) { await done("SKIPPED", "not a Bangladeshi mobile number"); stats.skipped++; continue; }
        const res = await providers.sms(phone, r.body);
        if (res === "sent") { await done("SENT"); stats.sent++; } else { await done("SKIPPED", "sms provider not configured"); stats.skipped++; }
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 300);
      if (r.attempts >= MAX_ATTEMPTS) {
        await db.$executeRawUnsafe(`UPDATE "Delivery" SET "status" = 'FAILED', "lastError" = $2 WHERE "id" = $1`, r.id, msg);
        stats.failed++;
        console.error(`[notification] delivery ${r.id} failed permanently: ${msg}`);
      } else {
        const backoff = Math.min(3600, 30 * 2 ** r.attempts);
        await db.$executeRawUnsafe(
          `UPDATE "Delivery" SET "lastError" = $2, "nextAttemptAt" = now() + ($3 * interval '1 second') WHERE "id" = $1`,
          r.id, msg, backoff
        );
        stats.retried++;
      }
    }
  }
  return { claimed: rows.length, ...stats };
}
