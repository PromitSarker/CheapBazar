import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * Serves the Android app file from ./downloads (outside /public, so it can be replaced without a rebuild).
 * Only `cheapbazar-<version>.apk` and `latest.json` are ever readable; nothing else in the folder is reachable.
 */
const NAME = /^(cheapbazar-[0-9][0-9A-Za-z.\-]{0,30}\.apk|latest\.json)$/;

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  if (!NAME.test(params.name)) return new Response("Not found", { status: 404 });
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "downloads", params.name));
    const apk = params.name.endsWith(".apk");
    return new Response(buf, {
      headers: {
        "content-type": apk ? "application/vnd.android.package-archive" : "application/json",
        "content-disposition": apk ? `attachment; filename="${params.name}"` : "inline",
        "content-length": String(buf.length),
        "x-content-type-options": "nosniff",
        "cache-control": "no-cache",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
