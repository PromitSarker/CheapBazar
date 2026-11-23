import { requireStore } from "@/lib/tenant";
import { updateStore, saveLocation, savePayDetails } from "./actions";
import { payDetailsForStore } from "@/lib/bff/pay";
import ShopLocationField from "@/components/location/ShopLocationField";
import { servicesEnabled } from "@/lib/bff/client";
import { THEME_PRESETS, themeOrDefault } from "@/lib/storefront-theme";

const ERRORS: Record<string, string> = {
  invalid: "Please enter a valid store name, URL slug, and template.",
  "slug-taken": "That store URL is already taken by another store. Try another one.",
  "domain-taken": "That custom domain is already registered to another store.",
  logo: "The logo must be a PNG, JPEG, GIF or WebP image under 5 MB.",
  location: "Pin your shop on the map, inside Bangladesh, then save.",
  "pay-password": "That password is not correct. Payment details were not changed.",
  "pay-invalid": "Enter each number as a Bangladesh mobile number, like 01712345678.",
  "pay-qr": "The Bangla QR must be a PNG, JPEG, GIF or WebP image under 5 MB.",
  "pay-throttled": "Too many attempts. Please wait a few minutes and try again.",
};

export default async function SettingsPage({ searchParams }: { searchParams: { error?: string, success?: string } }) {
  const store = await requireStore();
  const error = searchParams.error ? ERRORS[searchParams.error] : undefined;
  const success = searchParams.success === "1";
  const locationSaved = searchParams.success === "location";
  const paySaved = searchParams.success === "pay";
  const pay = servicesEnabled() ? await payDetailsForStore(store.id).catch(() => null) : null;

  return (
    <div>
      <h1>Settings</h1>
      
      {error && <p className="error">{error}</p>}
      {locationSaved && <p className="success" style={{ color: 'green', marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#e6ffe6', borderRadius: '4px' }}>Shop location saved.</p>}
      {paySaved && <p className="success" style={{ color: 'green', marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#e6ffe6', borderRadius: '4px' }}>Payment details saved.</p>}
      {success && <p className="success" style={{ color: 'green', marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#e6ffe6', borderRadius: '4px' }}>Settings updated successfully.</p>}

      <form action={updateStore} className="stack" style={{ maxWidth: '600px' }}>
        <label>
          Store name
          <input name="name" required placeholder="Golden Grain Bakery" defaultValue={store.name} />
        </label>
        
        <label>
          Store URL
          <span className="slug-field">
            <span className="muted">/store/</span>
            <input name="slug" required placeholder="golden-grain" pattern="[a-zA-Z0-9-]+" defaultValue={store.slug} />
          </span>
          <small className="muted" style={{ display: 'block', marginTop: '0.25rem', color: '#ff6b6b' }}>
            Warning: Changing your URL will break any links you have previously shared.
          </small>
        </label>

        <label>
          Custom Domain (Edge Routing)
          <input
            name="customDomain"
            placeholder="e.g. bakery.mybrand.com or artisan-bakery.com"
            defaultValue={store.customDomain || ""}
          />
          <small className="muted" style={{ display: 'block', marginTop: '0.25rem' }}>
            Connect your own apex domain or subdomain. The Edge Domain Resolver will map it directly to your storefront.
          </small>
        </label>


        <div className="brand-field">
          <strong>Logo</strong>
          <div className="brand-logo-row">
            <div className="brand-logo-preview" aria-hidden="true">
              {store.logoUrl
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={store.logoUrl} alt="" />
                : store.name.trim().charAt(0).toUpperCase()}
            </div>
            <input type="file" name="logo" accept="image/png,image/jpeg,image/gif,image/webp" aria-label="Upload a new logo" style={{ flex: 1, minWidth: 200 }} />
          </div>
          {store.logoUrl && (
            <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", fontWeight: 400 }}>
              <input type="checkbox" name="removeLogo" value="1" /> Remove the current logo
            </label>
          )}
          <small className="muted">Shown in the same fixed spot in every template. PNG, JPEG, GIF or WebP, up to 5 MB.</small>
        </div>

        <fieldset className="swatches-group" style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: "0.6rem", padding: 0 }}>Theme colour</legend>
          <div className="swatches">
            {THEME_PRESETS.map((p) => (
              <label key={p.id} className="swatch" title={p.label} style={{ ["--swatch" as string]: p.hex }}>
                <input type="radio" name="themeColor" value={p.hex} defaultChecked={themeOrDefault(store.themeColor) === p.hex} aria-label={p.label} />
                <span />
              </label>
            ))}
          </div>
          <small className="muted" style={{ display: "block", marginTop: "0.5rem" }}>Used for buttons and highlights on your storefront.</small>
        </fieldset>

        <fieldset className="template-picker">
          <legend>Choose a template</legend>
          <label className="template-option">
            <input type="radio" name="template" value="classic" defaultChecked={store.template === "classic"} />
            <div className="template-preview preview-classic">
              <div className="pv-bar" />
              <div className="pv-hero">Classic</div>
              <div className="pv-row">
                <div className="pv-card" />
                <div className="pv-card" />
                <div className="pv-card" />
              </div>
              <span className="template-name">Classic — warm, editorial, bakery vibes</span>
            </div>
          </label>
          
          <label className="template-option">
            <input type="radio" name="template" value="modern" defaultChecked={store.template === "modern"} />
            <div className="template-preview preview-modern">
              <div className="pv-bar dark" />
              <div className="pv-hero dark">Modern</div>
              <div className="pv-row">
                <div className="pv-card" />
                <div className="pv-card" />
                <div className="pv-card" />
              </div>
              <span className="template-name">Modern — bold hero, clean product cards</span>
            </div>
          </label>
        </fieldset>

        <button type="submit" className="button">
          Save Settings
        </button>
      </form>

      {servicesEnabled() && (
        <section id="location" className="card" style={{ maxWidth: 600, marginTop: "2.5rem", padding: "1.25rem", scrollMarginTop: 80 }}>
          {!store.hasLocation && (
            <p className="error" style={{ marginTop: 0 }}>
              Your shop has no location yet. Buyers find shops by distance, so until you set it your shop may be hidden from them.
            </p>
          )}
          <form action={saveLocation} className="stack" style={{ margin: 0 }}>
            <ShopLocationField defaults={{ latitude: store.latitude, longitude: store.longitude, district: store.district, address: store.address }} />
            <button type="submit" className="button">Save location</button>
          </form>
        </section>
      )}

      {servicesEnabled() && pay && (
        <section id="pay" className="card" style={{ maxWidth: 600, marginTop: "2.5rem", padding: "1.25rem", scrollMarginTop: 80 }}>
          <h2 style={{ marginTop: 0 }}>Receive payments</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Buyers in the app can pay you directly before delivery. They see these numbers and your Bangla QR in a pop-up and send the money
            themselves. CheapBazar does not process, hold or check these payments, so confirm each one in your own bKash, Nagad or Rocket app.
          </p>
          <form action={savePayDetails} className="stack" style={{ margin: 0 }} autoComplete="off">
            <label>
              bKash number
              <input type="tel" name="bkash" inputMode="numeric" placeholder="01712345678" defaultValue={pay.bkash ?? ""} maxLength={20} />
            </label>
            <label>
              Nagad number
              <input type="tel" name="nagad" inputMode="numeric" placeholder="01712345678" defaultValue={pay.nagad ?? ""} maxLength={20} />
            </label>
            <label>
              Rocket number
              <input type="tel" name="rocket" inputMode="numeric" placeholder="01712345678" defaultValue={pay.rocket ?? ""} maxLength={20} />
            </label>

            <div className="brand-field">
              <strong>Bangla QR</strong>
              {pay.banglaQrUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={pay.banglaQrUrl} alt="Your Bangla QR" style={{ width: 160, height: 160, objectFit: "contain", border: "1px solid #ddd", borderRadius: 8, background: "#fff" }} />
              )}
              <input type="file" name="banglaQr" accept="image/png,image/jpeg,image/gif,image/webp" aria-label="Upload your Bangla QR image" />
              {pay.banglaQrUrl && (
                <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", fontWeight: 400 }}>
                  <input type="checkbox" name="removeBanglaQr" value="1" /> Remove the current QR
                </label>
              )}
              <small className="muted">One Bangla QR works with every bank and wallet app. PNG, JPEG, GIF or WebP, up to 5 MB. Leave a field empty to hide that option.</small>
            </div>

            <label>
              Your current password
              <input type="password" name="password" autoComplete="current-password" placeholder="Needed to change payment details" />
            </label>
            <button type="submit" className="button">Save payment details</button>
          </form>
        </section>
      )}
    </div>
  );
}
