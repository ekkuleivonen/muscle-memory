import Link from "next/link";
import { tryHref } from "../../../lib/share";
import "../../share.css";

/** The header of the public pages a shared link lands on. */
export function SharedHeader() {
  return (
    <header className="legal-head">
      <Link href="/" className="workspace-name">
        <img className="logo-mark" src="/logo.svg" alt="" width={22} height={22} />
        muscle memory
      </Link>
      <nav>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
      </nav>
    </header>
  );
}

/**
 * A shared link that cannot be shown: says so plainly, shows nothing in its place (never this
 * browser's own work, never a made-up result), and offers the issue it named when it still
 * exists, else the five-minute test.
 */
export function Unavailable({
  title,
  body,
  issue,
}: {
  title: string;
  body: string;
  issue?: { key: string; title: string } | null;
}) {
  return (
    <div className="legal home play">
      <SharedHeader />
      <main className="legal-body home-body recovery-state shared-unavailable">
        <h1>{title}</h1>
        <p>{body}</p>
        <div className="home-actions">
          {issue ? (
            <Link className="home-cta" href={tryHref(issue.key)}>
              Try {issue.key}: {issue.title} →
            </Link>
          ) : (
            <Link className="home-cta" href="/play">
              Try the five-minute test →
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
