import Link from "next/link";
import { TermFooter } from "./_terminal/footer";
import "./_terminal/terminal.css";

export default function NotFound() {
  return (
    <>
      <div className="term">
        <main className="t-prose t-settings">
          <h1 className="t-doc-title">That page isn&apos;t here</h1>
          <p>The link may be incomplete, or the page may have moved.</p>
          <p>
            <Link href="/challenges" className="t-cmd">
              Find a challenge
            </Link>
          </p>
        </main>
      </div>
      <TermFooter trail={[{ label: "not found", href: "" }]} />
    </>
  );
}
