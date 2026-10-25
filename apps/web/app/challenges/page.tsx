import type { Metadata } from "next";
import { requireConsent } from "../../lib/gate";
import { getLibrary } from "../../lib/load";
import { TermFooter } from "../_terminal/footer";
import "../_terminal/terminal.css";
import { Picker, type PickerChallenge } from "./picker";

export const metadata: Metadata = { title: "Challenges · Muscle Memory" };

/**
 * Every listed challenge in one picker, like fzf: a search line, filters to toggle, the list,
 * and a preview of the highlighted one. Enter starts practice. The search is the URL's `q`.
 * Challenges travel as a JSON string: React's serializer would drop a "__proto__" example key.
 */
export default async function ChallengesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = (await searchParams).q ?? "";
  await requireConsent(
    q ? `/challenges?q=${encodeURIComponent(q)}` : "/challenges",
  );
  const { issues } = await getLibrary();
  const challenges: PickerChallenge[] = issues.map((issue) => ({
    key: issue.key,
    slug: issue.slug,
    revision: issue.revision,
    title: issue.title,
    summary: issue.summary,
    task: issue.task,
    kind: issue.kind,
    difficulty: issue.difficulty,
    language: issue.language,
    labels: [...issue.labels],
    runnable: issue.runnable,
    project: issue.project,
    comments: [],
    criteria: issue.criteria,
  }));
  return (
    <>
      <Picker challengesJson={JSON.stringify(challenges)} initialQuery={q} />
      <TermFooter trail={[{ label: "challenges", href: "/challenges" }]} />
    </>
  );
}
