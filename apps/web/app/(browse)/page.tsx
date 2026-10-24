import Link from "next/link";
import { requireOnboarding } from "../../lib/gate";

export default async function Home() {
  await requireOnboarding("/");
  return (
    <main className="page">
      <h1>Hello, world.</h1>
      <p className="muted">
        Pick up an <Link href="/issues">issue</Link>, browse the{" "}
        <Link href="/categories">categories</Link>, or{" "}
        <Link href="/onboarding">revisit your setup</Link>.
      </p>
    </main>
  );
}
