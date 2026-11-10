/**
 * Outbound providers. Unconfigured => "skipped" (recorded as SKIPPED, never as sent).
 *   Email: RESEND_API_KEY + MAIL_FROM
 *   SMS:   SMS_API_URL (+ SMS_API_KEY, SMS_SENDER). POSTs JSON { api_key, senderid, number, message }
 *          which matches common Bangladeshi bulk-SMS HTTP gateways; adapt `sms` to your vendor.
 */
export type SendResult = "sent" | "skipped";
export interface Providers {
  email(to: string, subject: string, text: string): Promise<SendResult>;
  sms(phone: string, text: string): Promise<SendResult>;
}

export function envProviders(): Providers {
  return {
    async email(to, subject, text) {
      const key = process.env.RESEND_API_KEY;
      const from = process.env.MAIL_FROM;
      if (!key || !from) return "skipped";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text }),
      });
      if (!res.ok) throw new Error(`Email provider error ${res.status}`);
      return "sent";
    },
    async sms(phone, text) {
      const url = process.env.SMS_API_URL;
      if (!url) return "skipped";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: process.env.SMS_API_KEY, senderid: process.env.SMS_SENDER, number: phone, message: text }),
      });
      if (!res.ok) throw new Error(`SMS provider error ${res.status}`);
      return "sent";
    },
  };
}

/** Bangladeshi mobile -> 8801XXXXXXXXX, or null if it isn't one. */
export function normalizeBdPhone(raw: string): string | null {
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("01")) d = `88${d}`;
  else if (d.length === 10 && d.startsWith("1")) d = `880${d}`;
  return /^8801[3-9]\d{8}$/.test(d) ? d : null;
}
