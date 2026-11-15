import { signup } from "../actions";
import { servicesEnabled } from "@/lib/bff/client";

const ERRORS: Record<string, string> = {
  invalid: "Please fill in every field with valid details. The password needs at least 6 characters (8 on the new platform).",
  taken: "That email is already registered. Try logging in instead.",
  "rate-limited": "Too many sign-ups from this address. Please try again later.",
  unavailable: "Sign-up is temporarily unavailable. Please try again shortly.",
};

export default function SignupPage({ searchParams }: { searchParams: { error?: string } }) {
  const error = searchParams.error ? ERRORS[searchParams.error] : undefined;
  return (
    <div className="auth-box">
      <h1>Create your account</h1>
      <p className="muted">Next step: name your store and pick a template.</p>
      {error && <p className="error">{error}</p>}
      <form action={signup} className="stack">
        <label>
          Your name
          <input name="name" required placeholder="Ada Lovelace" />
        </label>
        <label>
          Email
          <input name="email" type="email" required placeholder="ada@example.com" />
        </label>
        <label>
          Password
          <input name="password" type="password" required minLength={servicesEnabled() ? 8 : 6} placeholder={servicesEnabled() ? "8+ characters" : "6+ characters"} />
        </label>
        
        <label>
          Account Type
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "0.25rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", background: "var(--bg-secondary)" }}>
              <input type="radio" name="role" value="SELLER" defaultChecked style={{ margin: 0 }} />
              <div>
                <strong style={{ fontSize: "0.85rem", display: "block" }}>Seller</strong>
                <span className="muted" style={{ fontSize: "0.75rem" }}>Create my store</span>
              </div>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "6px", cursor: "pointer", background: "var(--bg-secondary)" }}>
              <input type="radio" name="role" value="BUYER" style={{ margin: 0 }} />
              <div>
                <strong style={{ fontSize: "0.85rem", display: "block" }}>Buyer</strong>
                <span className="muted" style={{ fontSize: "0.75rem" }}>Browse stores</span>
              </div>
            </label>
          </div>
        </label>

        <button type="submit" className="button">
          Create account
        </button>
      </form>
      <p className="muted">
        Already have an account? <a href="/login">Log in</a>
      </p>
    </div>
  );
}
