import Link from "next/link";

/** One step of the trail; the last one is the page itself and is not a link. */
export interface Crumb {
  label: string;
  href: string;
}

/**
 * Always reachable, on the right: every challenge, settings, the manifesto and the legal
 * pages. Home is the trail's first segment. Settings asks for the Terms first, like any page behind the consent gate.
 */
const LINKS = [
  { href: "/challenges", label: "challenges" },
  { href: "/stats", label: "your profile" },
  { href: "/settings", label: "settings" },
  { href: "/manifesto", label: "manifesto" },
  { href: "/terms", label: "terms" },
  { href: "/privacy", label: "privacy" },
] as const;

/**
 * The terminal's status bar: where this page sits, as a trail of clickable steps from home,
 * pinned to the bottom of every terminal page, with a few fixed links on the right.
 */
export function TermFooter({ trail = [] }: { trail?: readonly Crumb[] }) {
  const steps: Crumb[] = [{ label: "muscle memory", href: "/" }, ...trail];
  return (
    <footer className="t-footer">
      <nav aria-label="Breadcrumb">
        <ol className="t-trail">
          {steps.map((step, index) => {
            const last = index === steps.length - 1;
            // Home's segment shortens to ~ on a phone; screen readers still hear the name.
            const label =
              index === 0 ? (
                <>
                  <span className="t-home-long">{step.label}</span>
                  <span className="t-home-short" aria-hidden>
                    ~
                  </span>
                </>
              ) : (
                step.label
              );
            return (
              <li key={step.href}>
                {last ? (
                  <span className="t-footer-link" aria-current="page">
                    {label}
                  </span>
                ) : (
                  <Link href={step.href} className="t-footer-link">
                    {label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
        <span className="t-footer-fill" />
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="t-footer-link">
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
