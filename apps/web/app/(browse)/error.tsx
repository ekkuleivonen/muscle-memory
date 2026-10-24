"use client";

export default function BrowseError({ reset }: { reset: () => void }) {
  return (
    <main className="content recovery-state" role="alert">
      <h1>Your workspace could not be loaded</h1>
      <p>
        We could not read the page or your saved practice. This does not mean
        your history is empty.
      </p>
      <p>
        Check your connection and that browser storage is available. Keep this
        browser's data while you try again.
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
