import Link from "next/link";
import { requireOnboarding } from "../../lib/gate";
import { Topbar } from "./_components/topbar";

export default async function Home() {
  await requireOnboarding("/");
  return (
    <>
      <Topbar>Home</Topbar>
      <main className="content">
        <h1>Hello, world.</h1>
        <p className="dim">
          Pick up an <Link href="/issues">issue</Link> or browse the{" "}
          <Link href="/projects">projects</Link>.
        </p>
      </main>
    </>
  );
}
