"use client";
import { flushSync } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import type { StoredRecord } from "../../../../packages/domain/records";
import { deriveAttempts } from "../../../../packages/developer-profile/derive";
import {
  defaultComparisons,
  lengthDelta,
  solvedLength,
} from "../../../../packages/model-runs/comparison";
import { receiptMatch } from "../../../../packages/model-runs/receipts";
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
  const [status, setStatus] = useState("Loading…");
  const [retry, setRetry] = useState(0);
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
      setStatus("Loading…");
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
          setStatus(value.state === "ready" ? "" : "Unavailable");
        })
        .catch(() => {
          if (current === generation) setStatus("Unavailable");
        });
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
  }, [challenge, revision, attempt, retry]);
  if (!allowed) return null;
  return (
    <section className="completion-comparisons" aria-label="Model comparison">
      <h2>
        Model comparison <span className="faint">· default reasoning</span>
      </h2>
      {status && <p role="status">{status}</p>}
      <div className="completion-models">
        {defaultComparisons(data?.receipts ?? []).map(({ model, receipt }) => {
          const match = receipt && receiptMatch(receipt, conditions);
          const delta =
            receipt?.state === "completed" && match === "matched"
              ? lengthDelta(length, receipt.finalCodeLength)
              : null;
          return (
            <div className="completion-model" key={model}>
              <span>{model}</span>
              <strong
                title={
                  delta === null
                    ? undefined
                    : `Your submitted code: ${length} characters; model: ${receipt!.finalCodeLength}. (Yours − model) / model × 100. Unicode code points including whitespace; length, not quality.`
                }
              >
                {delta === null
                  ? receipt
                    ? receipt.state === "completed"
                      ? "Code length —"
                      : receipt.state
                    : "Default unavailable"
                  : `Code length ${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}%`}
              </strong>
              {receipt && <span className="faint">{receipt.reasoning}</span>}
            </div>
          );
        })}
      </div>
      {data?.state === "ready" && !data.receipts.length && (
        <p className="faint">No default model results yet.</p>
      )}
      <details>
        <summary>Comparison info</summary>
        <p>
          Code length counts Unicode characters including whitespace in the
          submitted file. Percent = (your length − model length) / model length;
          a negative value means yours is shorter. Length does not measure
          quality. Missing lengths and zero model lengths show —.
        </p>
        <p>
          One observed try per model, using its run-start declared default or
          provider-default configuration. Earliest try wins, including failure.
          Exact challenge/tests, recorded runtime and diagnostics must match.
          Model edit tools differ from the human editor; outside assistance is
          unknown.
        </p>
        <p>
          Timing deltas are unavailable: comparable start-to-success and
          execution measurement conditions have not been established. API
          latency is not solve duration.
        </p>
        <p>
          Revision {revision}. Protocol, versions and match:{" "}
          {defaultComparisons(data?.receipts ?? [])
            .map(
              ({ model, receipt }) =>
                `${model}: ${receipt ? `${receipt.harness}; ${receipt.reportedModels.join(", ") || "version unavailable"}; ${receiptMatch(receipt, conditions)}` : "default receipt unavailable"}`,
            )
            .join(" · ")}
        </p>
        <p>
          Read {data?.readAt ?? "unavailable"}; cached for up to one minute.
          {data?.truncated ? " Receipt coverage is partial." : ""}
        </p>
        <button
          type="button"
          className="after-answer"
          onClick={() => setRetry((n) => n + 1)}
        >
          Refresh comparison
        </button>
      </details>
    </section>
  );
}
