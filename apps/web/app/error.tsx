"use client";
import Link from "next/link";
import { TermFooter } from "./_terminal/footer";
import "./_terminal/terminal.css";

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <>
      <div className="term">
        <main className="t-prose t-settings" role="alert">
          <h1 className="t-doc-title">This page didn&apos;t load</h1>
          <p>
            Your work isn&apos;t lost. Try again, or reload the page if it
            keeps happening.
          </p>
          <p>
            <button type="button" className="t-cmd" onClick={reset}>
              Try again
            </button>{" "}
            <span className="t-dim">·</span>{" "}
            <Link href="/challenges" className="t-cmd">
              Find a challenge
            </Link>
          </p>
        </main>
      </div>
      <TermFooter trail={[{ label: "error", href: "" }]} />
    </>
  );
}
