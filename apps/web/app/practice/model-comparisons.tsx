"use client";
import { flushSync } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import type { StoredRecord } from "../../../../packages/domain/records";
import { deriveAttempts } from "../../../../packages/developer-profile/derive";
import { solvedLength } from "../../../../packages/model-runs/comparison";
import { comparisonFyi } from "./comparison-fyi";
import type { ReceiptRead } from "../../../../packages/model-runs/read-receipts";
import { ACCOUNT_CHANGE, readProfile } from "../../lib/account";
import { acceptsCurrent } from "../../lib/legal";
import { PROFILE_KEY } from "../../lib/profile";
import { listenPrivateBoundary } from "../../lib/private-boundary";

export function CompletionModelComparisons({
  records,
  challenge,
  revision,
  attempt,
}: {
  records: readonly StoredRecord[];
  challenge: string;
  revision: string;
  attempt: string;
}) {
  const [data, setData] = useState<ReceiptRead | null>(null);
  const [allowed, setAllowed] = useState(false);
  const length = useMemo(
    () => solvedLength(records, challenge, revision, attempt),
    [records, challenge, revision, attempt],
  );
  const conditions = useMemo(() => {
    const own = records.find((r) => {
      try {
        const o = JSON.parse(r.payload);
        return o.actor === "person" && o.attemptId === attempt;
      } catch {
        return false;
      }
    })?.participantId;
    return own
      ? (deriveAttempts(records, own).find(
          (a) => a.attempt === attempt && a.revision === revision,
        )?.conditions ?? [])
      : [];
  }, [records, attempt, revision]);
  useEffect(() => {
    let generation = 0;
    let abort: AbortController | undefined;
    let blocked = false;
    const clear = () => {
      generation++;
      abort?.abort();
      setData(null);
      setAllowed(false);
    };
    const load = () => {
      clear();
      if (blocked) return;
      let profile;
      try {
        profile = readProfile();
      } catch {
        return;
      }
      if (
        !profile ||
        profile.stealth ||
        profile.signedOut ||
        !acceptsCurrent(profile.accepted)
      )
        return;
      setAllowed(true);
      abort = new AbortController();
      const current = generation;
      void fetch(
        `/api/model-receipts/${encodeURIComponent(challenge)}/${encodeURIComponent(revision)}`,
        { cache: "no-store", signal: abort.signal, redirect: "error" },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error();
          const value = (await response.json()) as ReceiptRead;
          if (
            !Array.isArray(value.receipts) ||
            !["ready", "unavailable", "unconfigured"].includes(value.state)
          )
            throw new Error();
          if (current !== generation) return;
          setData(value);
        })
        .catch(() => {});
    };
    load();
    const privacy = () => flushSync(load);
    const storage = (e: StorageEvent) => {
      if (e.key === null || e.key === PROFILE_KEY) privacy();
    };
    const stop = listenPrivateBoundary((phase) => {
      if (phase === "start") {
        blocked = true;
        flushSync(clear);
      } else {
        blocked = false;
      }
    });
    window.addEventListener(ACCOUNT_CHANGE, privacy);
    window.addEventListener("storage", storage);
    return () => {
      clear();
      stop();
      window.removeEventListener(ACCOUNT_CHANGE, privacy);
      window.removeEventListener("storage", storage);
    };
  }, [challenge, revision, attempt]);
  const fyi =
    allowed && data?.state === "ready"
      ? comparisonFyi(length, data.receipts, conditions, data.truncated)
      : null;
  return fyi ? <p className="faint practice-fyi">{fyi}</p> : null;
}
