import { login } from "../actions";

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="auth-box">
      <h1>Welcome back</h1>
      {searchParams.error && <p className="error">Invalid email or password.</p>}
      <form action={login} className="stack">
        <label>
          Email
          <input name="email" type="email" required placeholder="you@example.com" />
        </label>
        <label>
          Password
          <input name="password" type="password" required />
        </label>
        <button type="submit" className="button">
          Log in
        </button>
      </form>
      <p className="muted">
        New here? <a href="/signup">Create your store</a>
      </p>
    </div>
  );
}
