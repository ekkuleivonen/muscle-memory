import type { ReactNode } from "react";

export function Topbar({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="topbar">
      <nav className="crumbs" aria-label="Breadcrumb">
        {children}
      </nav>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export const Sep = () => (
  <span className="sep" aria-hidden>
    ›
  </span>
);
