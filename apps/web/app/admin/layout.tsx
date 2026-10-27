import type { Metadata } from "next";
import { requireAdmin } from "../../lib/admin-server";
import "./admin.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Operator admin",
  robots: { index: false, follow: false },
};
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <main className="admin-shell">
      <header>
        <p>Muscle Memory · operator</p>
        <nav aria-label="Admin">
          <a href="/admin">Challenges</a> ·{" "}
          <a href="/admin/authoring">Authoring</a> ·{" "}
          <a href="/admin/benchmarks">Benchmarks</a> ·{" "}
          <a href="/admin/statistics">Statistics</a> ·{" "}
          <a href="/admin/sql">SQL</a>
        </nav>
      </header>
      {children}
    </main>
  );
}
