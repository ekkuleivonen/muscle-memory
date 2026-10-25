"use client";

export default function BrowseError({ reset }: { reset: () => void }) {
  return (
    <main className="content recovery-state" role="alert">
      <h1>This page didn&apos;t load</h1>
      <p>
        Your work isn&apos;t lost. Try again, or reload the page if it keeps
        happening.
      </p>
      <button className="btn" onClick={reset}>
        Try again
      </button>
      <a className="btn" href="/dashboard">
        Back to your desk
      </a>
    </main>
  );
}
