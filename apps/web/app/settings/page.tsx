import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireConsent } from "../../lib/gate";
import { TermFooter } from "../_terminal/footer";
import "../_terminal/terminal.css";
import { runPath } from "./commands";
import { SettingsTerminal } from "./settings-terminal";

export const metadata: Metadata = { title: "Settings · Muscle Memory" };

/**
 * Settings: the list of commands, each its own page at /settings/<name>. Older links name
 * one with `?run=` and are sent to its page.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  const moved = run ? runPath(run) : null;
  if (moved) redirect(moved);
  await requireConsent("/settings");
  return (
    <>
      <SettingsTerminal />
      <TermFooter trail={[{ label: "settings", href: "/settings" }]} />
    </>
  );
}
