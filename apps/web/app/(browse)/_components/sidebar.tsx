"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CategoryRef } from "../../../lib/library";
import { CategorySquare } from "./bits";
import { CategoriesIcon, IssuesIcon, TerminalIcon } from "./icons";

export function Sidebar({
  categories,
  issueCount,
}: {
  categories: (CategoryRef & { count: number })[];
  issueCount: number;
}) {
  const pathname = usePathname();
  const current = (href: string, exact = false) =>
    (exact ? pathname === href : pathname.startsWith(href))
      ? "page"
      : undefined;
  return (
    <aside className="sidebar" aria-label="Workspace">
      <Link href="/" className="workspace-name">
        <span className="logo-mark">M</span>
        muscle memory
      </Link>
      <Link
        className="side-link"
        href="/issues"
        aria-current={current("/issues")}
      >
        <IssuesIcon /> Issues <span className="count">{issueCount}</span>
      </Link>
      <Link
        className="side-link"
        href="/categories"
        aria-current={current("/categories", true)}
      >
        <CategoriesIcon /> Categories
      </Link>
      <div className="side-heading">Categories</div>
      {categories.map((category) => (
        <Link
          key={category.slug}
          className="side-link category-link"
          href={`/categories/${category.slug}`}
          aria-current={current(`/categories/${category.slug}`)}
        >
          <CategorySquare category={category} /> {category.title}
          <span className="key">{category.key}</span>
        </Link>
      ))}
      <div className="spacer" />
      <Link className="side-link" href="/onboarding">
        <TerminalIcon /> Setup
      </Link>
    </aside>
  );
}
