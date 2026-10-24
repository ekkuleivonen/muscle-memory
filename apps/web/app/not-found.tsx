import Link from "next/link";

export default function NotFound() {
  return (
    <main className="content recovery-state">
      <h1>That page isn't here</h1>
      <p>
        The link may be incomplete, or the issue may no longer be available.
        Your saved practice stays in this browser.
      </p>
      <Link className="btn start" href="/issues">
        Browse issues
      </Link>{" "}
      <Link className="btn" href="/dashboard">
        Back to your desk
      </Link>
    </main>
  );
}
