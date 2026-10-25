import type { Metadata } from "next";
import { requireConsent } from "../../lib/gate";
import { NOT_INDEXED } from "../../lib/site";
import { TermFooter } from "../_terminal/footer";
import { KeyMenu } from "../_terminal/key-menu";
import "../_terminal/terminal.css";
import { COMMANDS, DESTRUCTIVE, GROUPS } from "./commands";

export const metadata: Metadata = { title: "Settings", robots: NOT_INDEXED };

/** Settings: every command as a row to pick by key or click, each its own page at /settings/<name>. */
export default async function SettingsPage() {
  await requireConsent("/settings");
  return (
    <>
      <div className="term">
        <main className="t-prose t-settings">
          <h1 className="t-doc-title">Settings</h1>
          <KeyMenu
            id="settings"
            label="Settings"
            items={GROUPS.flatMap((group) =>
              group.commands.map((name) => ({
                href: `/settings/${name}`,
                name,
                hint: COMMANDS[name],
                group: group.label,
                danger: DESTRUCTIVE.includes(name),
              })),
            )}
          />
        </main>
      </div>
      <TermFooter trail={[{ label: "settings", href: "/settings" }]} />
    </>
  );
}
