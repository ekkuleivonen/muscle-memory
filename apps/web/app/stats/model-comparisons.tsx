"use client";
import { flushSync } from "react-dom";
import React, { useEffect, useState, useSyncExternalStore } from "react";
import { privateView } from "../../../../packages/developer-profile/private-view";
import {
  receiptMatch,
  type ModelReceipt,
} from "../../../../packages/model-runs/receipts";
import type { ReceiptRead } from "../../../../packages/model-runs/read-receipts";
import type { AttemptSummary } from "../../../../packages/developer-profile/derive";
import { deriveAttempts } from "../../../../packages/developer-profile/derive";
import type { StoredRecord } from "../../../../packages/domain/records";
import { ACCOUNT_CHANGE, readProfile } from "../../lib/account";
import { listenPrivateBoundary } from "../../lib/private-boundary";
import { acceptsCurrent } from "../../lib/legal";
import { PROFILE_KEY } from "../../lib/profile";

export function ModelReceipts({
  challenge,
  revision,
  conditions,
}: {
  challenge: string;
  revision: string;
  conditions: readonly string[];
}) {
  const [view] = useState(() => privateView<ReceiptRead>());
  const state = useSyncExternalStore(
    view.subscribe,
    view.getSnapshot,
    view.getSnapshot,
  );
  const [allowed, setAllowed] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let abort: AbortController | null = null;
    const check = () => {
      view.invalidate();
      abort?.abort();
      let profile;
      try {
        profile = readProfile();
      } catch {
        setAllowed(false);
        return;
      }
      const ok =
        !!profile &&
        !profile.stealth &&
        !profile.signedOut &&
        acceptsCurrent(profile.accepted);
      setAllowed(ok);
      if (!ok) return;
      abort = new AbortController();
      const signal = abort.signal;
      void view.read(async () => {
        const response = await fetch(
          `/api/model-receipts/${encodeURIComponent(challenge)}/${encodeURIComponent(revision)}`,
          { cache: "no-store", signal, redirect: "error" },
        );
        if (!response.ok) throw new Error("Comparison receipt unavailable.");
        const data = (await response.json()) as ReceiptRead;
        if (
          !["ready", "unconfigured", "unavailable"].includes(data.state) ||
          !Array.isArray(data.receipts)
        )
          throw new Error();
        return data;
      });
    };
    check();
    const stop = listenPrivateBoundary((phase) => {
      if (phase === "start") {
        flushSync(() => {
          view.invalidate(true);
          setAllowed(false);
        });
        abort?.abort();
      } else view.release();
    });
    const privacyCheck = () => {
      flushSync(() => {
        view.invalidate();
        setAllowed(false);
      });
      check();
    };
    const storage = (e: StorageEvent) => {
      if (e.key === null || e.key === PROFILE_KEY) privacyCheck();
    };
    window.addEventListener(ACCOUNT_CHANGE, privacyCheck);
    window.addEventListener("storage", storage);
    return () => {
      stop();
      view.invalidate();
      abort?.abort();
      window.removeEventListener(ACCOUNT_CHANGE, privacyCheck);
      window.removeEventListener("storage", storage);
    };
  }, [challenge, revision, retry, view]);
  if (!allowed)
    return (
      <p className="t-dim">
        Model comparisons stay hidden until privacy settings are read; stealth
        hides all comparisons.
      </p>
    );
  return (
    <section aria-label="Observed model results">
      <p className="t-dim">
        Offline model observations for {challenge}, exact test revision{" "}
        {revision}. Runtime and diagnostic policy are checked against your
        recorded context. Input tools differ: the model uses
        edit/write/run/submit tools, not your keyboard or type hover. External
        human assistance is unknown; this is a task-matched reference, not a
        controlled equality-of-assistance claim.
      </p>
      <p role="status">
        {state.loading
          ? "Reading stored model receipts…"
          : state.error
            ? "Stored model receipts could not be read."
            : state.value?.state === "unconfigured"
              ? "Model receipt storage is not configured here."
              : state.value?.state === "unavailable"
                ? "Stored model receipts are temporarily unavailable."
                : `Receipts read ${state.value?.readAt ?? ""}; results may be up to one minute old.`}
        {state.error && state.value ? " Previous model view is stale." : ""}
      </p>
      <button
        type="button"
        className="t-cmd"
        disabled={state.loading}
        onClick={() => setRetry((n) => n + 1)}
      >
        Refresh model receipts
      </button>
      {state.value?.state === "ready" && !state.value.receipts.length && (
        <p>
          No model slot is recorded for this exact revision/protocol yet.
          Another challenge or profile answer cannot create the missing
          benchmark.
        </p>
      )}
      {state.value?.receipts.map((r, i) => (
        <ModelReceiptView
          key={`${r.model}:${r.reasoning}:${r.try}:${i}`}
          receipt={r}
          conditions={conditions}
        />
      ))}
      {state.value?.truncated && (
        <p className="t-dim">
          Only the first 25 slots are shown; additional slots were not loaded.
          This is not full benchmark coverage.
        </p>
      )}
      <p className="t-dim">
        Each row is one observed try (current target: one per
        revision/model/setting); no stable success probabilities, ranks or speed
        race. Human elapsed time and model latency are different measures.
      </p>
    </section>
  );
}
export function ModelReceiptView({
  receipt: r,
  conditions,
}: {
  receipt: ModelReceipt;
  conditions: readonly string[];
}) {
  const match = receiptMatch(r, conditions);
  const waiting = [
    "queued",
    "running",
    "infrastructure-failed",
    "missing",
    "incompatible",
    "receipt-unavailable",
  ].includes(r.state);
  return (
    <details className="stats-metric">
      <summary>
        {r.model} · reasoning {r.reasoning} · try {r.try} —{" "}
        {waiting ? r.state : match === "matched" ? r.state : `context ${match}`}
      </summary>
      <p>
        Requested model: {r.model}. Reported model/version identifiers:{" "}
        {r.reportedModels.length
          ? r.reportedModels.join(", ")
          : "not recorded; exact resolved model/version is unavailable"}
        . A reported alias is not a pinned provider version.
      </p>
      <p>
        Protocol {r.harness}; reasoning {r.reasoning}{" "}
        {r.reasoning === "default"
          ? "(provider/model default, not an assumed fixed level)"
          : ""}
        .{" "}
        {r.budget
          ? `Budget: ${r.budget.turns} turns / ${r.budget.submissions} submissions.`
          : "Budget receipt unavailable."}
      </p>
      {waiting ? (
        <p>
          {r.state === "missing"
            ? "This slot has no stored receipt; missing is not failure."
            : r.state === "incompatible"
              ? "The stored evidence could not verify this protocol/slot."
              : r.state === "receipt-unavailable"
                ? "The receipt could not be read within the size/time budget; this is not the model’s outcome."
                : r.state === "infrastructure-failed"
                  ? "The harness failed; this is not a judged model attempt."
                  : `This slot is ${r.state}; no observed outcome yet.`}
        </p>
      ) : match === "matched" ? (
        <p>
          Observed outcome: {r.state}; {r.submissions}{" "}
          {r.submissions === 1 ? "submission" : "submissions"}. Same task/tests,
          recorded runtime and diagnostics policy. This single observation is
          not a success rate.
        </p>
      ) : (
        <p>
          Outcome withheld from comparison: {match}. A new profile answer cannot
          make incompatible runtimes or tools equivalent.
        </p>
      )}
      {r.runtime && (
        <p className="t-dim">
          Recorded runtime: {JSON.stringify(r.runtime)}. Model tools:{" "}
          {r.features.join(", ")}.
        </p>
      )}
    </details>
  );
}
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
  const own = records.find((r) => {
    try {
      const o = JSON.parse(r.payload);
      return o.attemptId === attempt && o.actor === "person";
    } catch {
      return false;
    }
  })?.participantId;
  const summary = own
    ? deriveAttempts(records, own).find(
        (a) => a.attempt === attempt && a.revision === revision,
      )
    : undefined;
  return (
    <details>
      <summary>Compare this completed task with stored model tries</summary>
      <ModelReceipts
        challenge={challenge}
        revision={revision}
        conditions={summary?.conditions ?? []}
      />
    </details>
  );
}
