/**
 * Direct-payment details (services path). A seller publishes the bKash / Nagad / Rocket numbers and a Bangla QR
 * buyers can pay to themselves; the platform only displays them (no payment tracking, no ledger).
 * Stored in identity-service on the store; never part of tenant resolution or events.
 */
import { callService, ServiceCallError } from "@/lib/bff/client";

export interface PayDetails {
  storeId: string;
  slug: string;
  storeName: string;
  bkash: string | null;
  nagad: string | null;
  rocket: string | null;
  banglaQrUrl: string | null;
  hasAny: boolean;
}

export const emptyPay = (storeId = ""): PayDetails => ({ storeId, slug: "", storeName: "", bkash: null, nagad: null, rocket: null, banglaQrUrl: null, hasAny: false });

export async function payDetailsForStore(storeId: string): Promise<PayDetails> {
  return callService<PayDetails>("identity", "GET", `/stores/${encodeURIComponent(storeId)}/pay`);
}

/** Null when the shop does not exist. */
export async function payDetailsBySlug(slug: string): Promise<PayDetails | null> {
  try {
    return await callService<PayDetails>("identity", "GET", `/pay/by-slug/${encodeURIComponent(slug.toLowerCase())}`);
  } catch (e) {
    if (e instanceof ServiceCallError && e.status === 404) return null;
    throw e;
  }
}

export async function savePayDetailsViaServices(
  storeId: string, actorId: string, password: string,
  input: { bkash: string; nagad: string; rocket: string; banglaQrUrl?: string | null }
): Promise<"ok" | "password" | "invalid" | "throttled"> {
  try {
    await callService("identity", "PATCH", `/stores/${encodeURIComponent(storeId)}/pay`, { ...input, actorId, password });
    return "ok";
  } catch (e) {
    if (e instanceof ServiceCallError) {
      if (e.code === "BAD_CREDENTIALS") return "password";
      if (e.code === "RATE_LIMITED") return "throttled";
      if (e.status === 400 || e.status === 403 || e.status === 404) return "invalid";
    }
    throw e;
  }
}
