"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/issues", label: "Issues" },
  { href: "/categories", label: "Categories" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      {LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname.startsWith(href) ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
