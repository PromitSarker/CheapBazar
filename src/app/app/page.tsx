import type { Metadata } from "next";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get the Cheap-Bazar app" };

interface Latest { version: string; file: string; size: number; sha256: string; builtAt: string }

async function latest(): Promise<Latest | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), "downloads", "latest.json"), "utf8"));
  } catch {
    return null;
  }
}

export default async function GetAppPage() {
  const apk = await latest();
  return (
    <div className="container" style={{ maxWidth: 680, padding: "2rem 1rem" }}>
      <h1>Get the Cheap-Bazar app</h1>
      <p className="muted">
        Shop the marketplace, order with Cash on Delivery, track your orders and get notifications, all in the Cheap-Bazar app
        for Android and iPhone. (Shop owners and admins keep using this website.)
      </p>

      <div className="card" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Android</h3>
        {apk ? (
          <>
            <p>
              <a className="button glow-button" href={`/downloads/${apk.file}`} download>
                Download the app (APK)
              </a>
            </p>
            <p className="muted small" style={{ margin: 0 }}>
              Version {apk.version} · {(apk.size / 1024 / 1024).toFixed(1)} MB · updated {new Date(apk.builtAt).toISOString().slice(0, 10)}
              <br />
              SHA-256: <code style={{ wordBreak: "break-all" }}>{apk.sha256}</code>
            </p>
            <ol style={{ lineHeight: 1.7, marginTop: 14 }}>
              <li>Open this page on your Android phone and tap <strong>Download the app</strong>.</li>
              <li>When asked, allow your browser to <strong>install unknown apps</strong> (one time).</li>
              <li>Open the downloaded file and tap <strong>Install</strong>.</li>
            </ol>
          </>
        ) : (
          <p className="muted">The Android app file is being prepared. Please check back shortly.</p>
        )}
      </div>

      <div className="card" style={{ padding: "1.25rem" }}>
        <h3 style={{ marginTop: 0 }}>iPhone</h3>
        <p className="muted" style={{ marginBottom: 0 }}>
          The iPhone app is built from the same code and is distributed through TestFlight / the App Store, which needs an Apple
          developer account. Until it is published, iPhone users can keep shopping on this website.
        </p>
      </div>
    </div>
  );
}
