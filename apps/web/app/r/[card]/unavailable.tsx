import Link from "next/link";
import { TermFooter } from "../../_terminal/footer";
import "../../_terminal/terminal.css";

/**
 * A shared link that cannot be shown: says so plainly, shows nothing in its place (never this
 * browser's own work, never a made-up result), and offers quick start.
 */
export function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <>
      <div className="term">
        <main className="t-prose t-shared">
          <h1 className="t-doc-title">{title}</h1>
          <p className="t-line">{body}</p>
          <div className="home-start">
            <Link className="t-btn t-btn-primary" href="/start">
              start a challenge →
            </Link>
          </div>
        </main>
      </div>
      <TermFooter trail={[{ label: "shared result", href: "" }]} />
    </>
  );
}
