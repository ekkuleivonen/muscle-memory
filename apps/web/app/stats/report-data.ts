"use client";
/**
 * Everything the report reads, assembled automatically on an ordinary visit (ENG-374):
 * this device's evidence first, then the owner's uploaded summaries and model receipts, each
 * arriving independently. Stealth reads nothing. Reset, deletion, import, logout and privacy
 * changes clear what is shown synchronously and discard every pending response.
 */
import {
  acceptPage,
  HistoryPacer,
  failureReason,
  readPageBody,
  thrownReason,
  type HistoryFailure,
  HISTORY_MAX_PAGES,
} from "../../lib/history-pages";
import { reportRead, reportReceipts } from "../../lib/report-reads";
import { flushSync } from "react-dom";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { privateView } from "../../../../packages/developer-profile/private-view";
import {
  historyWindow,
  type UploadedHistory,
} from "../../../../packages/developer-profile/uploaded-history";
import { localHistory } from "../../../../packages/developer-profile/history";
import type { AttemptSummary } from "../../../../packages/developer-profile/derive";
import type { ReceiptRead } from "../../../../packages/model-runs/read-receipts";
import { openPracticeStore } from "../../../../packages/browser/practice-store";
import { listenPrivateBoundary } from "../../lib/private-boundary";
import { ACCOUNT_CHANGE, readProfile } from "../../lib/account";
import { acceptsCurrent } from "../../lib/legal";
import { PROFILE_KEY, type StoredProfile } from "../../lib/profile";
import {
  PROGRESS_CHANGE,
  PROGRESS_KEY,
  readProgress,
  type Progress,
} from "../../lib/progress";
import type { ReceiptState } from "../../lib/report";
import {
  COHORTS_ENABLED,
  type CohortRead,
} from "../../../../packages/statistics/cohort";

export type Privacy = "reading" | "ok" | "stealth" | "signed-out" | "error";
export interface DeviceEvidence {
  attempts: AttemptSummary[];
  progress: Progress;
  profile: StoredProfile;
  at: string;
}
export type HistoryStatus =
  | { state: "idle" }
  | { state: "loading"; retryAt?: number }
  | {
      state: "ready";
      value: UploadedHistory;
      notice?: string;
      retryAt?: number;
      reason?: HistoryFailure;
    }
  | {
      state: "no-uploads" | "limited" | "unavailable" | "unauthorized" | "held";
      message: string;
      retryAt?: number;
      /** Why the last read failed, as a fixed code; never shown as copy. */
      reason?: HistoryFailure;
    };

/** After the report closes, uploaded summaries stay in page memory at most this long, so returning to /stats doesn't re-query. */
const HISTORY_TTL_MS = 5 * 60 * 1000;
/** The report holds at most this many uploaded attempt revisions, as the ENG-340 reader promised. */
export { HISTORY_MAX_ATTEMPTS } from "../../lib/history-pages";
/** The private reader's widest window: the past year of uploaded activity. */
export const HISTORY_DAYS = 366;
let cache: {
  participant: string;
  value: UploadedHistory;
  at: number;
  notice?: string;
} | null = null;
let expiry: ReturnType<typeof setTimeout> | undefined;
// One read per interval and one retry budget for the whole tab, across report remounts; no
// persistent history or identity.
const pacer = new HistoryPacer();
const dropCache = () => {
  cache = null;
  clearTimeout(expiry);
};
const keep = (participant: string, value: UploadedHistory, notice?: string) => {
  clearTimeout(expiry);
  cache = { participant, value, at: Date.now(), notice };
  expiry = setTimeout(dropCache, HISTORY_TTL_MS);
};
/**
 * Boundaries in progress anywhere in this tab, counted so a nested one (deletion wraps reset) keeps
 * reads blocked until the outermost finishes, and a report mounted mid-boundary starts blocked too.
 */
let boundaries = 0;
// Registered once per tab, before any report's own listener: a boundary anywhere drops the
// in-memory copy even while /stats is closed.
if (typeof window !== "undefined") {
  listenPrivateBoundary((phase) => {
    dropCache();
    boundaries =
      phase === "start" ? boundaries + 1 : Math.max(0, boundaries - 1);
  });
  window.addEventListener(ACCOUNT_CHANGE, () => {
    try {
      const p = readProfile();
      if (!p || p.stealth || p.signedOut || !acceptsCurrent(p.accepted))
        dropCache();
    } catch {
      dropCache();
    }
  });
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key === PROFILE_KEY) dropCache();
  });
}

function privacyOf(): { privacy: Privacy; profile: StoredProfile | null } {
  let profile;
  try {
    profile = readProfile();
  } catch {
    return { privacy: "error", profile: null };
  }
  if (!profile || profile.signedOut || !acceptsCurrent(profile.accepted))
    return { privacy: "signed-out", profile: null };
  if (profile.stealth) return { privacy: "stealth", profile };
  return { privacy: "ok", profile };
}

export function useReportData(
  revisions: readonly { challenge: string; revision: string }[],
) {
  const [device] = useState(() => privateView<DeviceEvidence>());
  const local = useSyncExternalStore(
    device.subscribe,
    device.getSnapshot,
    device.getSnapshot,
  );
  const [privacy, setPrivacy] = useState<Privacy>("reading");
  const [history, setHistory] = useState<HistoryStatus>({ state: "idle" });
  const [receipts, setReceipts] = useState<Record<string, ReceiptState>>({});
  const [cohorts, setCohorts] = useState<
    Record<string, CohortRead | "unavailable">
  >({});
  /** Bumped by every clear, so receipts are requested again for the same revisions. */
  const [epoch, setEpoch] = useState(0);
  const generation = useRef(0);
  const aborts = useRef(new Set<AbortController>());
  const blocked = useRef(false);
  /** Set by a boundary while this report is open; a new visit (mount) starts without it. */
  const held = useRef(false);
  const historyFlight = useRef<number | null>(null);
  const historyPages = useRef(0);

  /** Synchronously forget everything shown and everything in flight. */
  const clear = useCallback(
    (block = false) => {
      generation.current++;
      historyFlight.current = null;
      historyPages.current = 0;
      for (const a of aborts.current) a.abort();
      aborts.current.clear();
      device.invalidate(block);
      setHistory({ state: "idle" });
      setReceipts({});
      setCohorts({});
      setEpoch((e) => e + 1);
    },
    [device],
  );

  const readDevice = useCallback(
    (profile: StoredProfile) => {
      // Progress is already available locally: never hide it behind IndexedDB or interpretation.
      device.prime({
        attempts: [],
        progress: readProgress(),
        profile,
        at: new Date().toISOString(),
      });
      return device.read(() =>
        reportRead(
          async (signal) => {
            const store = await openPracticeStore();
            try {
              if (signal.aborted) throw new Error("Practice read cancelled.");
              const dump = await store.evidence(signal);
              return {
                attempts: localHistory(dump),
                progress: readProgress(),
                profile,
                at: new Date().toISOString(),
              };
            } finally {
              store.close();
            }
          },
          undefined,
          8000,
        ),
      );
    },
    [device],
  );

  const loadHistory = useCallback(
    async (more = false, previous: UploadedHistory | null = null) => {
      const ticket = generation.current;
      if (historyFlight.current === ticket) return;
      historyFlight.current = ticket;
      try {
        const live = () =>
          ticket === generation.current && !blocked.current && !boundaries;
        const began = Date.now();
        /**
         * One failure path: keep pages already read, record a fixed reason (attribute and one
         * console line, no request or identity), and retry transient failures at the read interval.
         */
        const fail = (reason: HistoryFailure, limited = false) => {
          if (!live()) return;
          console.info("Muscle Memory: earlier practice not added", {
            reason,
            ms: Date.now() - began,
          });
          const retryAt = pacer.retryAt(reason, Date.now());
          setHistory(
            more && previous
              ? {
                  state: "ready",
                  value: previous,
                  notice: retryAt ? "Earlier practice is still being added…" : "More uploads unavailable right now.",
                  retryAt,
                  reason,
                }
              : {
                  state: limited ? "limited" : "unavailable",
                  message: "Your uploads can't be read right now, so the report uses this device only.",
                  retryAt,
                  reason,
                },
          );
        };
        let identity;
        try {
          identity = await reportRead(
            async (signal) => {
              const store = await openPracticeStore();
              try {
                if (signal.aborted) throw new Error("Identity read cancelled.");
                return await store.existingIdentity();
              } finally {
                store.close();
              }
            },
            undefined,
            8000,
          );
        } catch {
          fail("identity");
          return;
        }
        if (!live()) return;
        if (!identity) {
          setHistory({
            state: "no-uploads",
            message:
              "No uploads are linked to this browser, so the report uses this device only.",
          });
          return;
        }
        if (
          !more &&
          cache?.participant === identity.participant &&
          Date.now() - cache.at < HISTORY_TTL_MS
        ) {
          setHistory({
            state: "ready",
            value: cache.value,
            notice: cache.notice,
          });
          return;
        }
        // Inside the interval (a remount, a click, a focus): wait for it rather than reading early.
        if (!pacer.begin(Date.now())) {
          const retryAt = pacer.readyAt(Date.now());
          setHistory((h) =>
            more && previous ? { state: "ready", value: previous, retryAt } : h.state === "ready" ? h : { state: "loading", retryAt },
          );
          return;
        }
        setHistory((h) =>
          h.state === "ready" && more ? h : { state: "loading" },
        );
        const controller = new AbortController();
        aborts.current.add(controller);
        const to = previous?.window.to ?? new Date().toISOString().slice(0, 10);
        const from =
          previous?.window.from ??
          new Date(Date.parse(to) - (HISTORY_DAYS - 1) * 86400000)
            .toISOString()
            .slice(0, 10);
        try {
          const response = await fetch("/api/private-history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...identity,
              window: historyWindow({ from, to, after: previous?.next ?? "" }),
            }),
            credentials: "same-origin",
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(20000),
            ]),
          });
          if (!live()) return;
          if (!response.ok) {
            if ([401, 403, 410].includes(response.status)) {
              dropCache();
              setHistory({
                state: "unauthorized",
                message:
                  "Your uploads couldn't be verified as yours from this browser, so the report uses this device only.",
              });
            } else {
              // Only the fixed diagnostic field is read from an error reply.
              const body = await response.json().catch(() => null);
              fail(failureReason(response.status, body?.diagnostic), response.status === 429);
            }
            return;
          }
          // A slow or cut-off body rejects to the transient classifier below; only a complete
          // body that isn't a page object is invalid-page.
          const page = await readPageBody(response);
          if (!live()) return;
          let merged;
          try {
            // Refills the retry budget only after the page validates and merges.
            merged = acceptPage(pacer, previous, page);
          } catch {
            return fail("invalid-page");
          }
          historyPages.current++;
          const value = merged.value;
          const stopped = Boolean(
            value.next && historyPages.current >= HISTORY_MAX_PAGES,
          );
          if (stopped) value.next = null;
          const notice = stopped
            ? "Some earlier practice could not be added."
            : merged.notice;
          keep(identity.participant, value, notice);
          setHistory({ state: "ready", value, notice });
        } catch (error) {
          fail(thrownReason(error));
        } finally {
          aborts.current.delete(controller);
        }
      } finally {
        if (historyFlight.current === ticket) historyFlight.current = null;
      }
    },
    [],
  );

  const start = useCallback(() => {
    if (blocked.current || boundaries) return;
    const { privacy, profile } = privacyOf();
    setPrivacy(privacy);
    if (privacy !== "ok" || !profile) {
      // Stealth and signed-out read nothing: no device evidence, history or comparisons.
      clear();
      dropCache();
      return;
    }
    void readDevice(profile);
    if (held.current)
      setHistory({
        state: "held",
        message:
          "Not re-read after the reset or import. Open the report again to include your uploads.",
      });
    else void loadHistory();
  }, [clear, readDevice, loadHistory]);

  useEffect(() => {
    start();
    const destructive = () => {
      flushSync(() => clear());
      start();
    };
    const deviceOnly = () => {
      const { privacy, profile } = privacyOf();
      if (privacy === "ok" && profile && !blocked.current && !boundaries)
        void readDevice(profile);
    };
    const storage = (e: StorageEvent) => {
      if (e.key === null || e.key === PROFILE_KEY) destructive();
      else if (e.key === PROGRESS_KEY) deviceOnly();
    };
    const stop = listenPrivateBoundary((phase) => {
      if (phase === "start") {
        blocked.current = true;
        // Reset, import and deletion: this report re-reads only the device. Uploads return on a
        // later visit (a new mount); deletion's tombstone and cleared identity refuse even that.
        held.current = true;
        flushSync(() => clear(true));
      } else if (!boundaries) {
        // Only the outermost finish reopens reads; the module listener has already counted it.
        blocked.current = false;
        device.release();
        start();
      }
    });
    window.addEventListener(ACCOUNT_CHANGE, destructive);
    window.addEventListener(PROGRESS_CHANGE, deviceOnly);
    window.addEventListener("focus", deviceOnly);
    window.addEventListener("storage", storage);
    return () => {
      stop();
      clear();
      window.removeEventListener(ACCOUNT_CHANGE, destructive);
      window.removeEventListener(PROGRESS_CHANGE, deviceOnly);
      window.removeEventListener("focus", deviceOnly);
      window.removeEventListener("storage", storage);
    };
  }, [start, clear, readDevice, device]);

  // Model receipts for the exact revisions chapter 4 shows; bounded by the report's task limit.
  const wanted = revisions.map((r) => `${r.challenge}/${r.revision}`).join("|");
  /** Revisions read or being read since the last clear, so a changed selection only asks for new ones. */
  const requested = useRef({ epoch: -1, revisions: new Set<string>() });
  useEffect(() => {
    if (privacy !== "ok" || !wanted) return;
    if (requested.current.epoch !== epoch)
      requested.current = { epoch, revisions: new Set() };
    const done = requested.current.revisions;
    const pending = new Set<string>();
    const ticket = generation.current;
    const controller = new AbortController();
    aborts.current.add(controller);
    const live = () =>
      ticket === generation.current &&
      !blocked.current &&
      !boundaries &&
      !controller.signal.aborted;
    const pairs = wanted.split("|").filter((pair) => {
      const revision = pair.split("/")[1];
      if (done.has(revision)) return false;
      done.add(revision);
      pending.add(revision);
      setReceipts((r) => (revision in r ? r : { ...r, [revision]: "loading" }));
      return true;
    });
    void reportReceipts(
      pairs,
      async (pair) => {
        const [challenge, revision] = pair.split("/");
        try {
          const data = await reportRead(async (signal) => {
            const response = await fetch(
              `/api/model-receipts/${encodeURIComponent(challenge)}/${encodeURIComponent(revision)}`,
              { cache: "no-store", signal, redirect: "error" },
            );
            if (!response.ok) {
              if ([429, 503].includes(response.status)) return null;
              throw new Error("Model result unavailable.");
            }
            return (await response.json()) as ReceiptRead;
          }, controller.signal);
          if (!live()) return true;
          const available =
            data?.state === "ready" && Array.isArray(data.receipts);
          setReceipts((r) => ({
            ...r,
            [revision]: available ? data.receipts : "unavailable",
          }));
          return data !== null && data.state !== "unavailable";
        } catch {
          if (live()) setReceipts((r) => ({ ...r, [revision]: "unavailable" }));
          return true; // A timed-out read is not retried automatically.
        } finally {
          pending.delete(revision);
        }
      },
      controller.signal,
    );
    const set = aborts.current;
    return () => {
      controller.abort();
      set.delete(controller);
      // Reads cut short here never finished: let the next selection ask for them again.
      for (const revision of pending) done.delete(revision);
    };
  }, [privacy, wanted, epoch]);

  // Human cohorts: no request at all while switched off (docs/human-cohorts.md).
  useEffect(() => {
    if (!COHORTS_ENABLED || privacy !== "ok" || !wanted) return;
    const ticket = generation.current;
    const controller = new AbortController();
    aborts.current.add(controller);
    const live = () =>
      ticket === generation.current &&
      !blocked.current &&
      !boundaries &&
      !controller.signal.aborted;
    for (const pair of wanted.split("|")) {
      const [challenge, revision] = pair.split("/");
      void fetch(
        `/api/cohort/${encodeURIComponent(challenge)}/${encodeURIComponent(revision)}`,
        {
          cache: "no-store",
          signal: controller.signal,
          redirect: "error",
        },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error();
          const data = (await response.json()) as CohortRead;
          if (live())
            setCohorts((c) => ({
              ...c,
              [revision]: Array.isArray(data.groups) ? data : "unavailable",
            }));
        })
        .catch(() => {
          if (live()) setCohorts((c) => ({ ...c, [revision]: "unavailable" }));
        });
    }
    const set = aborts.current;
    return () => {
      controller.abort();
      set.delete(controller);
    };
  }, [privacy, wanted, epoch]);

  // The first page is useful immediately. Continue at the existing server rate, never via a manual workflow.
  useEffect(() => {
    if (privacy !== "ok") return;
    const previous = history.state === "ready" ? history.value : null;
    const retryAt = "retryAt" in history ? history.retryAt : undefined;
    if (
      !retryAt &&
      !(history.state === "ready" && history.value.next && !history.notice)
    )
      return;
    const ticket = generation.current;
    const timer = setTimeout(
      () => {
        if (ticket !== generation.current || blocked.current || boundaries)
          return;
        void loadHistory(Boolean(previous), previous);
      },
      Math.max(0, (retryAt ?? pacer.readyAt(Date.now())) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [history, privacy, loadHistory]);

  /**
   * A person-initiated retry after automatic ones ran out, or on returning to the tab: paced to the
   * server's read interval, so a click can't add reads; a boundary still blocks it.
   */
  const retryHistory = useCallback(() => {
    if (privacy !== "ok" || blocked.current || boundaries) return;
    setHistory((h) =>
      (h.state === "unavailable" || h.state === "limited" || (h.state === "ready" && h.reason)) && !h.retryAt
        ? { ...h, retryAt: pacer.readyAt(Date.now()) }
        : h,
    );
  }, [privacy]);
  useEffect(() => {
    if (privacy !== "ok") return;
    const failed = (history.state === "unavailable" || history.state === "limited" || (history.state === "ready" && history.reason)) && !history.retryAt;
    if (!failed) return;
    const again = () => {
      const now = Date.now();
      if (document.visibilityState === "visible" && pacer.readyAt(now) === now) retryHistory();
    };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [history, privacy, retryHistory]);

  return { privacy, local, history, receipts, cohorts, retryHistory };
}
