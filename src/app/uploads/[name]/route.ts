import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * Serves images uploaded AFTER the app was built. `next start` only serves files that were
 * in /public at startup, so a product or ad image uploaded at runtime would 404 until the next
 * restart. Strict file-name and type checks keep this from reading anything else.
 */
const NAME = /^[A-Za-z0-9-]{8,64}\.(png|jpe?g|gif|webp)$/i;
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  const name = params.name;
  if (!NAME.test(name)) return new Response("Not found", { status: 404 });
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "public", "uploads", name));
    const ext = name.split(".").pop()!.toLowerCase();
    return new Response(buf, {
      headers: {
        "content-type": TYPES[ext],
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
        "cache-control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
