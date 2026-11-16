import Link from "next/link";

export default function OutOfRange({ message }: { message: string }) {
  return (
    <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
      <h1>Not available in your area</h1>
      <p className="muted" style={{ maxWidth: 460, margin: "0.5rem auto 1.25rem" }}>{message}</p>
      <Link href="/browse" className="button button-small glow-button">Browse shops near you</Link>
    </div>
  );
}
