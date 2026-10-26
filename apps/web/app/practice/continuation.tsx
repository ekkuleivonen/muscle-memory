"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { HistoricalChallenge } from "../../../../packages/authoring/contracts";
import { runtimePin } from "../../../../packages/authoring/runtime";
import { openPracticeStore } from "../../../../packages/browser/practice-store";
import {
  canContinueArchived,
  continuationRevision,
} from "../../lib/continuation";
import {
  indexChallenges,
  summarize,
  type ChallengeSummary,
} from "../../lib/challenges";
import { readProgress, writeProgress } from "../../lib/progress";
import { peekStart } from "../../lib/start";
import { Practice } from "./practice";

/** Resolve local continuation before mounting an editor or starting any observations. */
export function PracticeContinuation({
  challengeKey,
  currentJson,
  candidates,
}: {
  challengeKey: string;
  currentJson: string | null;
  candidates: ChallengeSummary[];
}) {
  const [state, setState] = useState<
    | { snapshot: HistoricalChallenge; earlier: boolean }
    | { error: string }
    | null
  >(null);
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const current = currentJson
        ? (JSON.parse(currentJson) as HistoricalChallenge)
        : null;
      const progress = readProgress();
      const attempt = progress[challengeKey];
      const starting = !!attempt?.completedAt && !!peekStart(challengeKey);
      let pin: string | null = null;
      if (attempt && !starting) {
        const store = await openPracticeStore();
        try {
          pin = continuationRevision(
            challengeKey,
            attempt,
            await store.records(),
          );
        } finally {
          store.close();
        }
        if (!pin)
          throw new Error(
            "The version of your saved attempt could not be identified. Your saved code is still on this device.",
          );
      }
      if (!current && !canContinueArchived(attempt, pin))
        throw new Error(
          "This challenge is archived or unavailable. Only an existing unfinished attempt can continue here.",
        );
      let snapshot = current;
      if (pin && pin !== current?.metadata.revision) {
        const response = await fetch(
          `/api/challenges/${encodeURIComponent(challengeKey)}/revisions/${encodeURIComponent(pin)}`,
          { cache: "no-store" },
        );
        if (!response.ok)
          throw new Error(
            "The exact version of your saved attempt is unavailable. Your saved code is still on this device; try again later.",
          );
        snapshot = (await response.json()) as HistoricalChallenge;
        if (
          snapshot.metadata.key !== challengeKey ||
          snapshot.metadata.revision !== pin
        )
          throw new Error("The saved challenge version could not be verified.");
      }
      if (!snapshot) throw new Error("This challenge is unavailable.");
      if (snapshot.revision.publication) {
        const available = await runtimePin(snapshot.revision.language);
        if (
          available.fingerprint !==
          snapshot.revision.publication.runtime.fingerprint
        )
          throw new Error(
            "The runtime for this saved challenge version is unavailable. Your code is preserved; try again later.",
          );
      }
      if (disposed) return;
      if (attempt && pin && !attempt.revision)
        writeProgress({
          ...progress,
          [challengeKey]: { ...attempt, revision: pin },
        });
      setState({
        snapshot,
        earlier:
          !!current && snapshot.metadata.revision !== current.metadata.revision,
      });
    })().catch((error: unknown) => {
      if (!disposed)
        setState({
          error:
            error instanceof Error
              ? error.message
              : "Your saved practice could not be opened. Try again later.",
        });
    });
    return () => {
      disposed = true;
    };
  }, [challengeKey, currentJson]);
  if (!state || "error" in state)
    return (
      <main className="t-prose">
        <p role="status">
          {state && "error" in state ? state.error : "Opening your practice…"}
        </p>
        <Link href="/challenges">Explore challenges</Link>
      </main>
    );
  const { snapshot, earlier } = state;
  const { metadata, revision, archived } = snapshot;
  const challenge = indexChallenges({
    schemaVersion: "1.0.0",
    challenges: [metadata],
    revisions: { [metadata.revision]: revision },
  }).challenges[0];
  return (
    <>
      {(archived || earlier) && (
        <p className="t-line" role="status">
          {archived
            ? "This challenge is archived. You can finish your saved attempt."
            : "Continuing your saved attempt on its earlier version."}
        </p>
      )}
      <Practice
        key={`${challenge.key}:${challenge.revision}`}
        revisionJson={JSON.stringify(revision)}
        trail={[
          { label: "challenges", href: "/challenges" },
          { label: challenge.key, href: `/challenges/${challenge.key}` },
        ]}
        candidates={[
          summarize(challenge),
          ...candidates.filter((item) => item.key !== challenge.key),
        ]}
        allowRepeat={!archived}
        challenge={{
          ...challenge,
          language: challenge.language!,
          tags: [...challenge.tags],
        }}
      />
    </>
  );
}
