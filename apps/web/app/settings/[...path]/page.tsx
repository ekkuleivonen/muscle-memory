import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireConsent } from "../../../lib/gate";
import { TermFooter, type Crumb } from "../../_terminal/footer";
import "../../_terminal/terminal.css";
import { isCommand, isQuestion } from "../commands";
import { SettingsCommand } from "../settings-pages";
import { SettingsTerminal } from "../settings-terminal";

type Props = { params: Promise<{ path: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [command] = (await params).path;
  return { title: `${command} · Settings · Muscle Memory` };
}

/**
 * One settings command on a clean screen: /settings/privacy, or /settings/profile/languages
 * to ask a single profile question.
 */
export default async function SettingsCommandPage({ params }: Props) {
  const { path } = await params;
  const [command, question, ...rest] = path;
  if (!isCommand(command) || rest.length) notFound();
  if (
    question !== undefined &&
    (command !== "profile" || !isQuestion(question))
  )
    notFound();
  const here = `/settings/${path.join("/")}`;
  await requireConsent(here);
  const trail: Crumb[] = [
    { label: "settings", href: "/settings" },
    { label: command, href: `/settings/${command}` },
    ...(question ? [{ label: question, href: here }] : []),
  ];
  return (
    <>
      {/* Fresh state per page: client navigation between commands reuses this route. */}
      {command === "profile" ? (
        <SettingsTerminal key={here} question={question} />
      ) : (
        <div className="term">
          <SettingsCommand key={here} command={command} />
        </div>
      )}
      <TermFooter trail={trail} />
    </>
  );
}
