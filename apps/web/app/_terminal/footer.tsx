"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  { href: "/stats", label: "stats" },
  { href: "/settings", label: "settings" },
  { href: "/manifesto", label: "manifesto" },
  { href: "/terms", label: "terms" },
  { href: "/privacy", label: "privacy" },
] as const;

/**
 * The terminal's status bar: where this page sits, as a trail of clickable steps from home,
 * pinned to the bottom of every terminal page, with a few fixed links on the right. Where the
 * bar is short of room the links fold into a menu (a popover, so Escape or a tap outside
 * closes it), and the trail keeps its room.
 */
export function TermFooter({ trail = [] }: { trail?: readonly Crumb[] }) {
  const steps: Crumb[] = [{ label: "muscle memory", href: "/" }, ...trail];
  const path = usePathname();
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
      </nav>
      <button
        type="button"
        className="t-footer-link t-menu-button"
        popoverTarget="t-site-menu"
      >
        menu
      </button>
      <nav aria-label="Site" id="t-site-menu" className="t-menu" popover="auto">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="t-footer-link"
            aria-current={
              path === link.href
                ? "page"
                : path.startsWith(`${link.href}/`)
                  ? "true"
                  : undefined
            }
            onClick={(event) => {
              const menu = event.currentTarget.parentElement;
              if (menu?.matches(":popover-open")) menu.hidePopover();
            }}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
