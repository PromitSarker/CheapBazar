import { requireStore } from "@/lib/tenant";
import { updateStore } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "Please enter a valid store name, URL slug, and template.",
  "slug-taken": "That store URL is already taken by another store. Try another one.",
  "domain-taken": "That custom domain is already registered to another store.",
};

export default async function SettingsPage({ searchParams }: { searchParams: { error?: string, success?: string } }) {
  const store = await requireStore();
  const error = searchParams.error ? ERRORS[searchParams.error] : undefined;
  const success = searchParams.success === "1";

  return (
    <div>
      <h1>Settings</h1>
      
      {error && <p className="error">{error}</p>}
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
    </div>
  );
}
