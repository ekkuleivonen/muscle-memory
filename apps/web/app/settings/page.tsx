import type { Metadata } from "next";
import { requireConsent } from "../../lib/gate";
import "../_terminal/terminal.css";
import { SettingsTerminal } from "./settings-terminal";

export const metadata: Metadata = { title: "Settings · Muscle Memory" };

export default async function SettingsPage() {
  await requireConsent("/settings");
  return <SettingsTerminal />;
}
