import type { Metadata } from "next";
import { requireOnboarding } from "../../lib/gate";
import "../_terminal/terminal.css";
import { SettingsTerminal } from "./settings-terminal";

export const metadata: Metadata = { title: "Settings · Muscle Memory" };

export default async function SettingsPage() {
  await requireOnboarding("/settings");
  return <SettingsTerminal />;
}
