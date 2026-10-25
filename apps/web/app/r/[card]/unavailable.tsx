import Link from "next/link";
import "../../share.css";

/** The header of the public pages a shared link lands on. */
export function SharedHeader() {
  return (
    <header className="legal-head">
      <Link href="/" className="site-name">
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
 * browser's own work, never a made-up result), and offers quick start.
 */
export function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <div className="legal home">
      <SharedHeader />
      <main className="legal-body home-body recovery-state shared-unavailable">
        <h1>{title}</h1>
        <p>{body}</p>
        <div className="home-actions">
          <Link className="home-cta" href="/start">
            Start a challenge →
          </Link>
        </div>
      </main>
    </div>
  );
}
