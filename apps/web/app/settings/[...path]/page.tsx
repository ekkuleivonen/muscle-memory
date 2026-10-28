import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireConsent } from "../../../lib/gate";
import { NOT_INDEXED } from "../../../lib/site";
import { TermFooter, type Crumb } from "../../_terminal/footer";
import "../../_terminal/terminal.css";
import { isCommand, isQuestion } from "../commands";
import { SettingsCommand } from "../settings-pages";

type Props = {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ from?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [command] = (await params).path;
  // Never echo an address that isn't a command; the page itself is a 404.
  return {
    title: isCommand(command) ? `${command} · Settings` : "Not found",
    robots: NOT_INDEXED,
  };
}

/**
 * One settings command on a clean screen: /settings/privacy, or /settings/profile/languages
 * to ask a single profile question.
 */
export default async function SettingsCommandPage({ params, searchParams }: Props) {
  const { path } = await params;
  const [command, question, ...rest] = path;
  // Only known pages to return to (?from=stats), never an address from the URL.
  const { from } = await searchParams;
  const back = from === "stats" && command === "profile" ? "stats" : undefined;
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
      <div className="term">
        {/* Fresh state per page: client navigation between commands reuses this route. */}
        <SettingsCommand key={here} command={command} question={question} from={back} />
      </div>
      <TermFooter trail={trail} />
    </>
  );
}
