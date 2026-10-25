import Link from "next/link";

/** Where the footer goes; `account` places only make sense once the Terms are accepted. */
const PLACES = [
  { href: "/issues", label: "explore", account: false },
  { href: "/projects", label: "projects", account: false },
  { href: "/profile", label: "profile", account: true },
  { href: "/settings", label: "settings", account: true },
] as const;
const FINE = [
  { href: "/terms", label: "terms" },
  { href: "/privacy", label: "privacy" },
] as const;

/**
 * The terminal's status bar: top-level navigation as clickable words, pinned to the bottom of
 * every terminal page. `current` is the href of the page it is on.
 */
export function TermFooter({
  current,
  signedIn,
}: {
  current: string;
  signedIn: boolean;
}) {
  const link = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      className="t-footer-link"
      aria-current={href === current ? "page" : undefined}
    >
      {label}
    </Link>
  );
  return (
    <footer className="t-footer">
      <nav aria-label="Site">
        {link("/", "muscle memory")}
        <span className="t-footer-sep" aria-hidden>
          │
        </span>
        {PLACES.filter((place) => signedIn || !place.account).map((place) =>
          link(place.href, place.label),
        )}
        <span className="t-footer-fill" />
        {FINE.map((place) => link(place.href, place.label))}
      </nav>
    </footer>
  );
}
