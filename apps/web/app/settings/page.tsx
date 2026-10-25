import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireConsent } from "../../lib/gate";
import { TermFooter } from "../_terminal/footer";
import { KeyMenu } from "../_terminal/key-menu";
import "../_terminal/terminal.css";
import { COMMANDS, GROUPS, runPath } from "./commands";

export const metadata: Metadata = { title: "Settings · Muscle Memory" };

/**
 * Settings: every command as a row to pick by key or click, each its own page at /settings/<name>. Older
 * links name one with `?run=` and are sent to its page.
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
              })),
            )}
          />
        </main>
      </div>
      <TermFooter trail={[{ label: "settings", href: "/settings" }]} />
    </>
  );
}
