import type { Metadata } from "next";
import InstallButton from "@/components/pwa/InstallButton";

export const metadata: Metadata = { title: "Get the Cheap-Bazar app" };

export default function GetAppPage() {
  return (
    <div className="container" style={{ maxWidth: 680, padding: "2rem 1rem" }}>
      <h1>Get the Cheap-Bazar app</h1>
      <p className="muted">
        Cheap-Bazar works like an app on your phone: it opens full-screen from your home screen with its own icon.
        No app store, nothing to download.
      </p>
      <div style={{ margin: "1.25rem 0" }}><InstallButton /></div>

      <div className="card" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Android (Chrome)</h3>
        <ol style={{ lineHeight: 1.7 }}>
          <li>Open this site in Chrome.</li>
          <li>Tap the <strong>⋮</strong> menu (top right).</li>
          <li>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</li>
          <li>Confirm. The Cheap-Bazar icon appears on your home screen.</li>
        </ol>
      </div>

      <div className="card" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>iPhone / iPad (Safari)</h3>
        <ol style={{ lineHeight: 1.7 }}>
          <li>Open this site in <strong>Safari</strong>.</li>
          <li>Tap the <strong>Share</strong> button (square with an arrow).</li>
          <li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
        </ol>
      </div>

      <div className="card" style={{ padding: "1.25rem" }}>
        <h3 style={{ marginTop: 0 }}>বাংলায়</h3>
        <p style={{ lineHeight: 1.7, margin: 0 }}>
          Chrome-এ সাইটটি খুলুন → উপরের ডানে <strong>⋮</strong> মেনু → <strong>Install app / Add to Home screen</strong> চাপুন।
          iPhone-এ Safari-তে <strong>Share</strong> → <strong>Add to Home Screen</strong>।
        </p>
      </div>
    </div>
  );
}
