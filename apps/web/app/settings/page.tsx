import Link from "next/link";
import type { Metadata } from "next";
import { requireConsent } from "../../lib/gate";
import "../_terminal/terminal.css";
import { SettingsTerminal } from "./settings-terminal";

export const metadata: Metadata = { title: "Settings · Muscle Memory" };

/** Settings are the terminal; `?run=` opens it on one command (see `start` in the terminal). */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  await requireConsent(run ? `/settings?run=${encodeURIComponent(run)}` : "/settings");
  return (
    <>
      <nav className="settings-terminal-nav">
        <Link href="/dashboard">← Back to your desk</Link>
      </nav>
      <SettingsTerminal start={run} />
    </>
  );
}
