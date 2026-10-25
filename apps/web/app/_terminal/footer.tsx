import Link from "next/link";

/** One step of the trail; the last one is the page itself and is not a link. */
export interface Crumb {
  label: string;
  href: string;
}

/**
 * The terminal's status bar: where this page sits, as a trail of clickable steps from home,
 * pinned to the bottom of every terminal page. Terms and privacy stay reachable on the right.
 */
export function TermFooter({ trail = [] }: { trail?: readonly Crumb[] }) {
  const steps: Crumb[] = [{ label: "muscle memory", href: "/" }, ...trail];
  return (
    <footer className="t-footer">
      <nav aria-label="Breadcrumb">
        <ol className="t-trail">
          {steps.map((step, index) => {
            const last = index === steps.length - 1;
            return (
              <li key={step.href}>
                {last ? (
                  <span className="t-footer-link" aria-current="page">
                    {step.label}
                  </span>
                ) : (
                  <Link href={step.href} className="t-footer-link">
                    {step.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
        <span className="t-footer-fill" />
        <Link href="/terms" className="t-footer-link">
          terms
        </Link>
        <Link href="/privacy" className="t-footer-link">
          privacy
        </Link>
      </nav>
    </footer>
  );
}
