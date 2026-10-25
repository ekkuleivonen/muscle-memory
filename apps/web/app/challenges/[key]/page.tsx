import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireConsent } from "../../../lib/gate";
import { summarize } from "../../../lib/challenges";
import { practiceHref } from "../../../lib/paths";
import { getChallenges } from "../../../lib/load";
import "../../_terminal/terminal.css";
import "../../practice/practice.css";
import { Practice } from "../../practice/practice";

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { findChallenge } = await getChallenges();
  const challenge = findChallenge(decodeURIComponent((await params).key));
  if (!challenge) return { title: "Challenge not found" };
  return {
    title: `${challenge.title} (${challenge.key})`,
    description: challenge.summary || undefined,
  };
}

/**
 * Practice on one challenge, `/challenges/PY-002`, on its live revision. A lowercase key or the
 * challenge's id redirects to the key. The revision travels to the browser as a JSON string,
 * because React's serializer would drop a "__proto__" fixture key from an object.
 */
export default async function PracticePage({ params }: Props) {
  const { key } = await params;
  await requireConsent(practiceHref(key));
  const { findChallenge, revision: revisionOf, challenges } = await getChallenges();
  const challenge = findChallenge(decodeURIComponent(key));
  if (!challenge) notFound();
  if (key !== challenge.key) redirect(practiceHref(challenge.key));
  const content = revisionOf(challenge.revision)!;
  return (
    <Practice
      key={`${challenge.key}:${challenge.revision}`}
      revisionJson={JSON.stringify(content)}
      trail={[
        { label: "challenges", href: "/challenges" },
        { label: challenge.key, href: practiceHref(challenge.key) },
      ]}
      candidates={[
        summarize(challenge),
        ...challenges.filter((i) => i.key !== challenge.key).map(summarize),
      ]}
      challenge={{
        key: challenge.key,
        revision: challenge.revision,
        title: challenge.title,
        task: content.task,
        difficulty: challenge.difficulty,
        tags: [...challenge.tags],
        language: challenge.language!,
        runnable: challenge.runnable,
      }}
    />
  );
}
