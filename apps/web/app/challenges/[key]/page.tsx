import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireConsent } from "../../../lib/gate";
import { summarize } from "../../../lib/challenges";
import { practiceHref } from "../../../lib/paths";
import { getChallenges } from "../../../lib/load";
import "../../_terminal/terminal.css";
import "../../practice/practice.css";
import { PracticeContinuation } from "../../practice/continuation";
import { publicChallenge } from "../../../lib/catalog-source";

export const dynamic = "force-dynamic";

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
  const {
    findChallenge,
    revision: revisionOf,
    challenges,
  } = await getChallenges();
  const challenge = findChallenge(decodeURIComponent(key));
  if (!challenge) {
    const historical = await publicChallenge(decodeURIComponent(key));
    if (!historical) notFound();
    if (key !== historical.metadata.key)
      redirect(practiceHref(historical.metadata.key));
    return (
      <PracticeContinuation
        challengeKey={historical.metadata.key}
        currentJson={null}
        candidates={challenges.map(summarize)}
      />
    );
  }
  if (key !== challenge.key) redirect(practiceHref(challenge.key));
  return (
    <PracticeContinuation
      challengeKey={challenge.key}
      currentJson={JSON.stringify({
        metadata: {
          key: challenge.key,
          revision: challenge.revision,
          title: challenge.title,
          summary: challenge.summary,
          hook: challenge.hook,
          difficulty: challenge.difficulty,
          tags: challenge.tags,
        },
        revision: revisionOf(challenge.revision)!,
        archived: false,
      })}
      candidates={challenges.map(summarize)}
    />
  );
}
