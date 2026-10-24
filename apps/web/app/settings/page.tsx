import Link from "next/link";
import { SettingsForm } from "./settings-form";
import type { Metadata } from "next";
import { requireConsent } from "../../lib/gate";
import "../_terminal/terminal.css";
import { SettingsTerminal } from "./settings-terminal";

export const metadata: Metadata = { title: "Settings · Muscle Memory" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requireConsent("/settings");
  const { view } = await searchParams;
  return view === "terminal" ? (
    <>
      <nav className="settings-terminal-nav">
        <Link href="/dashboard">← Back to your desk</Link>
        <Link href="/settings">Settings controls</Link>
      </nav>
      <SettingsTerminal />
    </>
  ) : (
    <SettingsForm />
  );
}
