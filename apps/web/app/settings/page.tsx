import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireConsent } from "../../lib/gate";
import { TermFooter } from "../_terminal/footer";
import "../_terminal/terminal.css";
import { COMMANDS, GROUPS, runPath } from "./commands";

export const metadata: Metadata = { title: "Settings · Muscle Memory" };

/**
 * Settings: every command as a row to click, each its own page at /settings/<name>. Older
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
          {GROUPS.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="t-group">{group.label}</h2>
              <ul className="t-rows">
                {group.commands.map((name) => (
                  <li key={name}>
                    <Link href={`/settings/${name}`} className="t-row">
                      <span className="t-row-name">{name}</span>
                      <span className="t-dim">{COMMANDS[name]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </main>
      </div>
      <TermFooter trail={[{ label: "settings", href: "/settings" }]} />
    </>
  );
}
