import { createStore } from "./actions";

const ERRORS: Record<string, string> = {
  invalid: "Please enter a store name, a valid URL slug, and pick a template.",
  "slug-taken": "That store URL is taken. Try another one.",
};

export default function OnboardingPage({ searchParams }: { searchParams: { error?: string } }) {
  const error = searchParams.error ? ERRORS[searchParams.error] : undefined;
  return (
    <div className="auth-box wide">
      <h1>Name your store</h1>
      <p className="muted">Pick one of our two templates. That&rsquo;s the whole design process.</p>
      {error && <p className="error">{error}</p>}

      <form action={createStore} className="stack">
        <label>
          Store name
          <input name="name" required placeholder="Golden Grain Bakery" />
        </label>
        <label>
          Store URL
          <span className="slug-field">
            <span className="muted">/store/</span>
            <input name="slug" required placeholder="golden-grain" pattern="[a-zA-Z0-9-]+" />
          </span>
        </label>

        {/* Hidden fallback ensures Safari always sends a template value even if
            the defaultChecked radio isn't serialized into FormData */}
        <input type="hidden" name="template" value="classic" />

        <div className="template-picker" role="group" aria-labelledby="template-legend">
          <p id="template-legend" className="template-picker-legend">Choose a template</p>
          <label className="template-option">
            <input type="radio" name="template" value="classic" defaultChecked />
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
            <input type="radio" name="template" value="modern" />
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
        </div>

        <button type="submit" className="button">
          Open my store
        </button>
      </form>
    </div>
  );
}
