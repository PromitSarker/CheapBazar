"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Shows an Install button when the browser offers one (HTTPS only). Otherwise it explains why not. */
export default function InstallButton() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [secure, setSecure] = useState(true);

  useEffect(() => {
    setSecure(window.isSecureContext);
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    const onInstalled = () => { setInstalled(true); setEvt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed) return <p className="muted">✅ You are already using the installed app.</p>;
  if (evt) {
    return (
      <button className="button glow-button" onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); }}>
        Install Cheap-Bazar
      </button>
    );
  }
  return (
    <p className="muted">
      {secure
        ? "If you do not see an Install button, use the steps below for your phone."
        : "One-tap install needs a secure (https) address. Until then, use \"Add to Home screen\" from the steps below."}
    </p>
  );
}
