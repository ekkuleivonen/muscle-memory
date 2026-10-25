"use client";
import { tabKeys } from "../../lib/tab-keys";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { EditorView } from "@codemirror/view";
import {
  openPracticeStore,
  type PracticeStore,
} from "../../../../packages/browser/practice-store";
import {
  latestSavedCode,
  type RecoveredCode,
} from "../../../../packages/capture/restore";
import {
  casesRun,
  executableOf,
  type Difficulty,
  type IssueKind,
  type Revision,
} from "../../../../packages/content/model";
import {
  runFeedback,
  type WorkspaceRecord,
} from "../../../../packages/domain/workspace";
import type { Json } from "../../../../packages/domain/json";
import {
  engineFor,
  Runner,
  type CaseResult,
  type LoadProgress,
} from "../../../../packages/runner/runner";
import { readProfile } from "../../lib/account";
import {
  pullRequestHistory,
  timeAgo,
  type PullRequestRecord,
} from "../../lib/activity";
import { attemptAt, attemptRecords } from "../../lib/attempts";
import { statusOf } from "../../lib/board";
import {
  allPullRequests,
  closedPullRequests,
  mergedPullRequests,
} from "../../lib/pulls";
import { mergeEligibility, type MergeBlocker } from "../../lib/merge";
import {
  due,
  feedbackOf,
  openRequired,
  type Feedback,
  type Release,
  type Thread,
} from "../../lib/feedback";
import { languageLabel, type IssueComment } from "../../lib/library";
import type { LanguageId } from "../../lib/languages";
import {
  mediaTypeOf,
  repoOf,
  tree,
  type RepoFile,
  type TreeNode,
} from "../../lib/repo";
import { LanguageDot } from "../(browse)/_components/bits";
import { StartWork, StatusMenu, useBoard } from "../(browse)/_components/board";
import {
  PREVIOUS_PATH_KEY,
  setIssueContext,
} from "../(browse)/_components/board-log";
import { Markdown } from "../(browse)/_components/markdown";
import { pullHref } from "../(browse)/_components/pulls";
import {
  createViewer,
  type ActivityHooks,
  type Keymap,
} from "../workspace/editor";
import { checksTypes, TypeChecker } from "../workspace/type-checker";
import { PANEL, panelMax, SIDE, Splitter, useIdeLayout } from "./splitter";
import {
  caseLabel,
  toolchain,
  transcript,
  type Executable,
} from "./transcript";
import { recoveryMessage, saveBadge, saveState } from "../workspace/save-state";
import {
  RUN_TIMEOUT_MS,
  WorkspaceSession,
  type RunView,
  type SaveStatus,
} from "../workspace/session";

import {
  fitView,
  readView,
  writeView,
  viewScope,
  type FileView,
} from "../workspace/continuity";

import { ChallengeExamples } from "../(browse)/_components/challenge-examples";
import { nextAction } from "./next-action";
import { nextProblem } from "../../lib/next-problem";
import type { IssueSummary } from "../../lib/library";

export interface IdeIssue {
  key: string;
  slug: string;
  /** The live revision the IDE opens: sha256:… of its content. */
  revision: string;
  title: string;
  task: string;
  kind?: IssueKind;
  difficulty?: Difficulty;
  estimate?: number;
  labels: string[];
  comments: IssueComment[];
  language: LanguageId;
  runnable: boolean;
}

type Runtime =
  | { state: "none" }
  | { state: "loading"; progress?: LoadProgress }
  | { state: "ready" }
  | { state: "unavailable"; message: string };

type Opening =
  | { state: "opening" }
  | { state: "open" }
  | { state: "failed"; message: string };

/**
 * One issue as a small repo in a VS Code-like IDE. The issue decides which files are editable;
 * their edits and runs are recorded on this device under the accepted Terms. Everything else
 * opens read-only.
 */
export function Ide({
  revisionsJson,
  candidates,
  issue,
  root,
}: {
  /**
   * Every published revision of the issue by id, as a JSON string: React's serializer would
   * drop a "__proto__" fixture key. The IDE opens the live one; feedback recorded against
   * earlier ones is read from theirs.
   */
  revisionsJson: string;
  candidates: IssueSummary[];
  issue: IdeIssue;
  /** The repo's folder: the project's key, as in project:shop. */
  root: string;
}) {
  const revisions = useMemo(
    () => JSON.parse(revisionsJson) as Record<string, Revision>,
    [revisionsJson],
  );
  const revision = revisions[issue.revision];
  const challenge = useMemo(() => executableOf(revision), [revision]);
  const repo = useMemo(
    () => repoOf(revision.workspace, issue, root),
    [revision, issue, root],
  );
  const testsFile = repo.files.find((f) => f.role === "tests")!;
  const editable = useMemo(
    () => repo.files.filter((f) => f.role === "edit"),
    [repo],
  );
  /** Where the IDE opens: the entry file when it is editable, else the first editable one. */
  const home =
    editable.find((f) => f.path === challenge.entry)?.path ?? editable[0].path;

  const [view, setView] = useState<"explorer" | "ticket">("ticket");
  const [tabs, setTabs] = useState<string[]>([
    home,
    ...editable.map((f) => f.path).filter((path) => path !== home),
    testsFile.path,
  ]);
  const [active, setActiveState] = useState(home);
  const setActive = (path: string) => {
    // Capture the old file while it still has a layout box.
    session.current?.places();
    setActiveState(path);
  };
  const [panel, setPanel] = useState<"tests" | "output" | "pulls">("tests");
  const savedScope = useRef<string | null>(null);
  const pendingPlaces = useRef<Record<string, FileView>>({});
  const viewNow = useRef({ tabs, active, side: view, panel });
  viewNow.current = { tabs, active, side: view, panel };
  const persistView = () => {
    if (savedScope.current && session.current)
      writeView({
        scope: savedScope.current,
        ...viewNow.current,
        files: { ...session.current.places(), ...pendingPlaces.current },
        savedAt: new Date().toISOString(),
      });
  };
  /** This person's pull requests for the issue, newest first, across sessions. */
  const [pulls, setPulls] = useState<PullRequestRecord[]>([]);
  /** Which of them the person has merged (on the pull request's page). */
  const [merged, setMerged] = useState<ReadonlySet<number>>(new Set());
  /** Which of them the person closed without merging. */
  const [closed, setClosed] = useState<ReadonlySet<number>>(new Set());
  const [opening, setOpening] = useState<Opening>({ state: "opening" });
  const [message, setMessage] = useState("");
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const mobileSide = useRef<HTMLDialogElement>(null);
  const [runtime, setRuntime] = useState<Runtime>(
    issue.runnable ? { state: "loading" } : { state: "none" },
  );
  const [run, setRun] = useState<RunView | null>(null);
  const [stale, setStale] = useState(false);
  const [capture, setCapture] = useState<SaveStatus | null>(null);
  const [keymap, setKeymap] = useState<Keymap>("standard");
  const [vimMode, setVimMode] = useState("normal");
  /** Editable files changed in this session. */
  const [edited, setEdited] = useState<ReadonlySet<string>>(new Set());
  /** The boot screen can be dismissed while only the runtime is still loading. */
  const [booted, setBooted] = useState(false);
  /** Teammate comments, hints and review threads released so far. */
  const [feedback, setFeedback] = useState<Feedback>({
    released: [],
    threads: [],
  });
  /** Something new arrived in the ticket's thread while another view was showing. */
  const [unread, setUnread] = useState(false);
  /** Whether this attempt's newest pull request can be merged, as last read from the records. */
  const [mergeable, setMergeable] = useState<{
    number: number;
    blocker: MergeBlocker | null;
  } | null>(null);
  /** What teammates just said, shown where the person is working: the latest release only. */
  const [notes, setNotes] = useState<TeamNote[]>([]);

  const router = useRouter();
  const layout = useIdeLayout();
  const mainRef = useRef<HTMLElement>(null);
  const board = useBoard();
  const currentProblem = candidates.find((i) => i.key === issue.key);
  const next = currentProblem
    ? nextProblem(currentProblem, candidates, board.items)
    : null;
  // The session's callbacks outlive renders; they read the latest board through this.
  const done = statusOf(board.items, issue.key) === "done";
  /** The pull request new work is pushed to: the latest one, unless it was merged or closed. */
  const openPull =
    pulls[0] &&
    !done &&
    pulls[0].result !== "merged" &&
    !merged.has(pulls[0].number) &&
    !closed.has(pulls[0].number)
      ? pulls[0]
      : null;
  const openPullRef = useRef(openPull);
  openPullRef.current = openPull;
  /** The ticket's thread: its own comments, then released comments and hints. */
  const thread = useMemo(
    () => [
      ...issue.comments.map((c) => ({
        ...c,
        at: undefined as string | undefined,
      })),
      ...feedback.released.flatMap((r) => {
        const from = revisions[r.issueRevision];
        if (r.kind === "hint") {
          const hint = from?.hints.find((h) => h.id === r.hint);
          return hint
            ? [
                {
                  author: hint.author.name,
                  role: hint.author.role,
                  body: hint.text,
                  at: r.at,
                },
              ]
            : [];
        }
        const comment = from?.team.find((c) => c.id === r.comment);
        return comment
          ? [
              {
                author: comment.author.name,
                role: comment.author.role,
                body: comment.text[r.wording] ?? comment.text[0],
                at: r.at,
              },
            ]
          : [];
      }),
    ],
    [issue.comments, feedback, revisions],
  );
  /** Open blocking review threads by pull request number. */
  const blocking = useMemo(() => {
    const counts = new Map<number, number>();
    // Blocking findings, and explicit ones of any severity (TeamComment.resolve).
    const explicit = (t: Feedback["threads"][number]) =>
      revisions[t.issueRevision]?.team.find((c) => c.id === t.comment)
        ?.resolve === "explicit";
    for (const t of feedback.threads)
      if (!t.resolved && (t.severity === "blocking" || explicit(t)))
        counts.set(t.number, (counts.get(t.number) ?? 0) + 1);
    return counts;
  }, [feedback, revisions]);

  /**
   * The open pull request once nothing blocks merging it (lib/merge, as its page decides) and
   * nothing was typed since: the next step is merging.
   */
  const reviewable =
    openPull &&
    mergeable?.number === openPull.number &&
    mergeable.blocker === null &&
    !stale
      ? openPull
      : null;

  const hosts = useRef(new Map<string, HTMLDivElement>());
  const viewers = useRef(new Map<string, EditorView>());
  const sandboxHost = useRef<HTMLDivElement>(null);
  const engine = engineFor(issue.language);
  const runner = useRef<Runner | null>(null);
  const session = useRef<WorkspaceSession | null>(null);
  const types = useRef<TypeChecker | null>(null);
  const store = useRef<PracticeStore | null>(null);
  // Each mount (twice in development) bumps this; a superseded open installs nothing.
  const generation = useRef(0);
  const participant = useRef("");
  /** Feedback checks run one at a time, in the order asked for. */
  const reviewing = useRef<Promise<void>>(Promise.resolve());
  const viewRef = useRef(view);
  viewRef.current = view;

  /**
   * Releases whatever teammate feedback the revision's triggers say is due, from what is
   * stored (so pending writes are flushed first), and shows it. `push` names a push whose
   * checks just finished: only then are review comments checked.
   */
  function review(push?: { number: number; push: number }) {
    reviewing.current = reviewing.current.then(async () => {
      const current = session.current;
      const opened = store.current;
      if (!current || !opened) return;
      try {
        await current.recorder.flush();
        // Feedback belongs to the attempt under way: a replay hears it all again.
        let records = attemptRecords(
          await opened.workspaceRecords(),
          issue.slug,
        );
        const releases = due({
          revision,
          records,
          issue: issue.slug,
          participantId: participant.current,
          revisionFor: (id) => revisions[id],
          files: current.code(),
          push,
        });
        if (releases.length) {
          current.release(releases);
          await current.recorder.flush();
          records = attemptRecords(await opened.workspaceRecords(), issue.slug);
          const said = teamNotes(releases);
          setNotes(said);
          // The ticket's words are shown as notes; review comments keep their own place under
          // the pull request, so the status line announces them and resolutions.
          setMessage(
            announcement(
              releases.filter(
                (r) =>
                  r.kind === "resolved" ||
                  ("pullRequest" in r && r.pullRequest),
              ),
            ),
          );
          if (
            releases.some(
              (r) =>
                r.kind !== "resolved" && !("pullRequest" in r && r.pullRequest),
            ) &&
            viewRef.current !== "ticket"
          )
            setUnread(true);
        }
        if (session.current === current) {
          setFeedback(feedbackOf(records, issue.slug, (id) => revisions[id]));
          setMergeable(mergeableOf(records));
        }
      } catch (cause) {
        console.warn("Teammate feedback could not be checked.", cause);
      }
    });
  }

  /** The merge gate for this attempt's newest pull request, from its records (lib/merge). */
  function mergeableOf(records: readonly WorkspaceRecord[]) {
    const pull = allPullRequests(records).find((p) => p.issue === issue.slug);
    if (!pull) return null;
    return {
      number: pull.number,
      blocker: mergeEligibility({
        records,
        issue: issue.slug,
        number: pull.number,
        pull,
        published: (id) => !!revisions[id],
        openRequired: openRequired(
          feedbackOf(records, issue.slug, (id) => revisions[id]),
          pull.number,
          (id) => revisions[id],
        ).length,
      }).blocker,
    };
  }

  function startRuntime() {
    if (!issue.runnable || !engine) return;
    runner.current?.dispose();
    const next = new Runner(engine, sandboxHost.current!, {
      timeoutMs: RUN_TIMEOUT_MS,
      onProgress: (progress) =>
        runner.current === next &&
        setRuntime((current) =>
          current.state === "loading"
            ? { state: "loading", progress }
            : current,
        ),
    });
    runner.current = next;
    setRuntime({ state: "loading" });
    next.ready().then(
      () => runner.current === next && setRuntime({ state: "ready" }),
      (cause: Error) =>
        // Fail closed: Run stays unavailable rather than executing outside the sandbox.
        runner.current === next &&
        setRuntime({ state: "unavailable", message: cause.message }),
    );
  }

  /** Opens the session on the editable files, restoring the latest saved code. */
  async function open(current: () => boolean) {
    try {
      const account = readProfile();
      const keys: Keymap =
        account?.profile.editor === "vim" ? "vim" : "standard";
      setKeymap(keys);
      store.current ??= await openPracticeStore();
      const participantId = await store.current.participantId();
      participant.current = participantId;
      const all = await store.current.workspaceRecords();
      // Only the attempt under way (a replay starts a new one); earlier ones stay recorded.
      const records = attemptRecords(all, issue.slug);
      const recovered: RecoveredCode | null = latestSavedCode(
        records,
        participantId,
        issue.slug,
      );
      const history = pullRequestHistory(records, participantId, issue.slug);
      // Numbers continue across attempts, so they come from every pull request.
      const numbered = pullRequestHistory(all, participantId, issue.slug);
      const mergedNumbers = mergedPullRequests(all, issue.slug);
      const closedNumbers = closedPullRequests(all, issue.slug);
      const homeHost = hosts.current.get(home);
      // A superseded open must not create a session or record anything.
      if (!homeHost || !current()) return;
      if (recovered) {
        const dropped = Object.keys(recovered.files).filter(
          (path) => !editable.some((f) => f.path === path),
        );
        setMessage(
          [
            recoveryMessage(recovered),
            records.some((r) => {
              try {
                const o = JSON.parse(r.payload);
                return (
                  o.type === "observation.workspace.opened" &&
                  o.issue === issue.slug &&
                  o.issueRevision !== issue.revision
                );
              } catch {
                return false;
              }
            })
              ? `The ticket changed since your last visit. Your matching files were restored.${dropped.length ? ` Files no longer present: ${dropped.join(", ")}.` : " Review the current requirements before checking again."}`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
      savedScope.current = `${participantId}:${viewScope(issue.slug, attemptAt(all, issue.slug).start)}`;
      const saved = readView(savedScope.current);
      if (saved) {
        const fitted = fitView(saved, {
          paths: repo.files.map((f) => f.path),
          tabs: [home, ...editable.map((f) => f.path), testsFile.path],
          lengths: Object.fromEntries(
            editable.map((f) => [
              f.path,
              (recovered?.files[f.path] ?? f.text).length,
            ]),
          ),
        });
        setTabs([...fitted.tabs]);
        setActive(fitted.active);
        setView(fitted.side);
        setPanel(fitted.panel);
        pendingPlaces.current = { ...fitted.files };
        setBooted(true);
      }
      setPulls(history);
      setMerged(mergedNumbers);
      setClosed(closedNumbers);
      setFeedback(feedbackOf(records, issue.slug, (id) => revisions[id]));
      setMergeable(mergeableOf(records));
      session.current = new WorkspaceSession({
        participantId,
        consentVersion: `terms-${account?.accepted?.version ?? "unknown"}`,
        issue: issue.slug,
        issueRevision: issue.revision,
        executable: challenge,
        sink: store.current,
        files: Object.fromEntries(
          editable.map((f) => [
            f.path,
            {
              text: recovered?.files[f.path] ?? f.text,
              language: f.language,
              mediaType: mediaTypeOf(f.language as LanguageId),
            },
          ]),
        ),
        sources: Object.fromEntries(
          repo.files
            .filter((f) => f.role === "read")
            .map((f) => [f.path, f.text]),
        ),
        restoredFrom: recovered?.revision,
        language: issue.language,
        keymap: keys,
        types: types.current ?? undefined,
        runtime: issue.runnable && engine ? engine.runtime : null,
        pullRequestsBefore: numbered[0]?.number ?? 0,
        hasPreviousChecks: numbered.length > 0,
        openPullRequest: () => {
          const open = openPullRef.current;
          return open ? { number: open.number, pushes: open.pushes } : null;
        },
        // Read at use time, so a runtime reloaded with Retry is the one that runs.
        runner: () => runner.current!,
        onRun: (next) => {
          setRun(next);
          setStale(next.revision !== session.current?.currentRevision);
          const pr = next.pullRequest;
          // Once a run or a push's checks finish, teammates may have something to say.
          if (next.status !== "queued" && next.status !== "running")
            review(pr ? { number: pr.number, push: pr.push } : undefined);
          if (!pr) return;
          // Opening shows the pull request at once; its checks fill in when they finish.
          setPulls((current) => [
            {
              number: pr.number,
              pushes: pr.push,
              runId: pr.runId,
              revision: pr.revision,
              result: pr.result ?? "running",
              passed: pr.passed ?? 0,
              total: pr.total ?? challenge.cases.length,
              at: pr.at,
            },
            ...current.filter((p) => p.number !== pr.number),
          ]);
          // It stays open: the person reviews and merges it on its page.
          if (next.status === "queued") setPanel("pulls");
        },
        onEditedAfterRun: () => setStale(true),
        onSaveStatus: setCapture,
        onVimMode: setVimMode,
        entry: entryPath(),
        profile: account?.profile ? ({ ...account.profile } as Json) : null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });
      // The home file mounts last, so it has the focus.
      for (const file of editable)
        if (file.path !== home)
          session.current.mount(file.path, hosts.current.get(file.path)!);
      session.current.mount(home, homeHost);
      session.current.page({
        visible: document.visibilityState === "visible",
        focused: document.hasFocus(),
        width: window.innerWidth,
        height: window.innerHeight,
      });
      setOpening({ state: "open" });
      review();
    } catch (cause) {
      console.warn("The IDE could not open.", cause);
      if (current())
        setOpening({
          state: "failed",
          message:
            "The editor couldn't open your branch. Close other tabs with this issue open, then reload the page.",
        });
    }
  }

  useEffect(() => {
    const attempt = ++generation.current;
    startRuntime();
    if (checksTypes(issue.language))
      types.current = new TypeChecker(challenge.entry);
    void open(() => attempt === generation.current);
    const saveView = () => persistView();
    window.addEventListener("pagehide", saveView);
    const timer = setInterval(() => {
      persistView();
      // Counts refresh each second; state changes arrive at once through onSaveStatus.
      setCapture(session.current?.saveStatus() ?? null);
      const changed = session.current?.editedFiles() ?? [];
      setEdited((before) =>
        before.size === changed.length && changed.every((p) => before.has(p))
          ? before
          : new Set(changed),
      );
    }, 1000);
    // Hints wait for active minutes, which pass without any other event.
    const feedbackTimer = setInterval(() => review(), 30_000);
    return () => {
      window.removeEventListener("pagehide", saveView);
      generation.current++;
      persistView();
      clearInterval(timer);
      clearInterval(feedbackTimer);
      runner.current?.dispose();
      runner.current = null;
      types.current?.dispose();
      types.current = null;
      // The session flushes its last writes on close; the store stays open for them.
      const closing = session.current;
      session.current = null;
      void closing?.close();
      for (const viewer of viewers.current.values()) viewer.destroy();
      viewers.current.clear();
    };
  }, []);

  /** The last input, so a navigation can say whether a person or the app made it. */
  const input = useRef<{ kind: "pointer" | "keyboard"; at: number } | null>(
    null,
  );
  const via = (): "pointer" | "keyboard" | "app" =>
    input.current && performance.now() - input.current.at < 1000
      ? input.current.kind
      : "app";
  /** Activity hooks that reach whichever session is open when the event happens. */
  function forward(path: string): ActivityHooks {
    const to = () => session.current?.activity(path);
    return {
      onKey: (...a) => to()?.onKey(...a),
      onSelection: (...a) => to()?.onSelection(...a),
      onScroll: (...a) => to()?.onScroll(...a),
      onFocus: (...a) => to()?.onFocus(...a),
      onClipboard: (...a) => to()?.onClipboard(...a),
    };
  }

  useEffect(
    () => setIssueContext({ id: issue.slug, revision: issue.revision }),
    [issue.slug, issue.revision],
  );

  // The page: visible or hidden, focused or not, its size, and its last moments.
  useEffect(() => {
    const noteInput = (kind: "pointer" | "keyboard") => () =>
      (input.current = { kind, at: performance.now() });
    const pointer = noteInput("pointer");
    const keyboard = noteInput("keyboard");
    let resize: ReturnType<typeof setTimeout> | undefined;
    const page = () =>
      session.current?.page({
        visible: document.visibilityState === "visible",
        focused: document.hasFocus(),
        width: window.innerWidth,
        height: window.innerHeight,
      });
    const resized = () => {
      clearTimeout(resize);
      resize = setTimeout(page, 250);
    };
    const hidden = () => session.current?.pageHidden();
    window.addEventListener("pointerdown", pointer, true);
    window.addEventListener("keydown", keyboard, true);
    document.addEventListener("visibilitychange", page);
    window.addEventListener("focus", page);
    window.addEventListener("blur", page);
    window.addEventListener("resize", resized);
    window.addEventListener("pagehide", hidden);
    return () => {
      clearTimeout(resize);
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("visibilitychange", page);
      window.removeEventListener("focus", page);
      window.removeEventListener("blur", page);
      window.removeEventListener("resize", resized);
      window.removeEventListener("pagehide", hidden);
    };
  }, []);

  // What was open: tabs opened and closed, the file shown, the side bar and the panel.
  const shownTabs = useRef<string[]>([]);
  const isOpen = opening.state === "open";
  useEffect(() => {
    const current = session.current;
    if (!isOpen || !current) return;
    const before = shownTabs.current;
    for (const path of tabs)
      if (!before.includes(path))
        current.navigated("file", "open", path, via());
    for (const path of before)
      if (!tabs.includes(path)) current.navigated("file", "close", path, via());
    shownTabs.current = tabs;
  }, [tabs, isOpen]);
  useLayoutEffect(() => {
    if (!isOpen) return;
    const how = via();
    const place = pendingPlaces.current[active];
    session.current?.restorePlace(
      active,
      place,
      how !== "app" || Boolean(place),
    );
    delete pendingPlaces.current[active];
    session.current?.navigated("file", "show", active, how);
    // Opening a file is investigation, which teammates may respond to.
    if (how !== "app") review();
  }, [active, isOpen]);
  useEffect(() => {
    if (isOpen) session.current?.navigated("side", "show", view, via());
  }, [view, isOpen]);
  useEffect(() => {
    if (isOpen) session.current?.navigated("panel", "show", panel, via());
  }, [panel, isOpen]);
  useEffect(() => {
    if (!isOpen || runtime.state === "none") return;
    session.current?.runtimeState(
      runtime.state,
      runtime.state === "unavailable" ? runtime.message : undefined,
    );
  }, [runtime.state, isOpen]);

  // Read-only files get a viewer the first time they are shown.
  useEffect(() => {
    const file = repo.files.find((f) => f.path === active);
    if (!file || file.role === "edit" || viewers.current.has(file.path)) return;
    const host = hosts.current.get(file.path);
    if (host)
      viewers.current.set(
        file.path,
        createViewer(host, file.text, {
          language: file.language,
          label: `${file.path} (read-only)`,
          activity: forward(file.path),
        }),
      );
  }, [active, tabs, repo]);

  function openFile(path: string) {
    mobileSide.current?.close();
    setTabs((current) =>
      current.includes(path) ? current : [...current, path],
    );
    setActive(path);
  }

  function closeTab(path: string) {
    if (editable.some((f) => f.path === path)) return;
    const next = tabs.filter((p) => p !== path);
    const selected = active === path ? (next[next.length - 1] ?? home) : active;
    setTabs(next);
    setActive(selected);
    requestAnimationFrame(() =>
      document.getElementById(`file-tab-${selected}`)?.focus(),
    );
  }

  const running = run?.status === "queued" || run?.status === "running";
  const ready = runtime.state === "ready" && opening.state === "open";
  const localFeedback =
    run?.purpose === "local" && run.outcome?.status === "completed"
      ? runFeedback(casesRun(challenge.cases, "local"), run.outcome.cases)
      : null;
  const action = nextAction({
    done,
    running,
    unavailable: runtime.state === "unavailable",
    openPull: !!openPull,
    blocker:
      mergeable?.number === openPull?.number ? mergeable?.blocker : undefined,
    stale,
    localPassed:
      !!localFeedback &&
      localFeedback.total > 0 &&
      localFeedback.correct === localFeedback.total,
  });
  const reviewTarget = action === "review" ? openPull : null;
  const booting =
    !booted &&
    (opening.state === "opening" ||
      (opening.state === "open" && runtime.state === "loading"));

  const sideContent = (
    <>
      {view === "explorer" ? (
        <Explorer
          root={repo.root}
          files={repo.files}
          active={active}
          edited={edited}
          onOpen={openFile}
        />
      ) : (
        <Ticket
          issue={issue}
          examples={casesRun(challenge.cases, "local")}
          testsPath={testsFile.path}
          thread={thread}
          onOpenTests={() => openFile(testsFile.path)}
        />
      )}
    </>
  );
  return (
    <div
      className="ide"
      onClickCapture={persistView}
      style={
        {
          "--side-w": `${layout.side}px`,
          "--panel-h": `${layout.panel}px`,
        } as CSSProperties
      }
    >
      <header className="ide-title">
        <Link
          href={`/issues/${issue.key}`}
          className="ide-back"
          title="Back to the issue"
        >
          ← <span className="mono">{issue.key}</span>
        </Link>
        <span className="ide-name">
          {issue.title}
          <span className="faint"> — {repo.root}</span>
        </span>
        <div className="ide-mobile-tools">
          <button
            onClick={() => {
              setView("ticket");
              setUnread(false);
              mobileSide.current?.showModal();
            }}
          >
            Challenge{unread ? " •" : ""}
          </button>
          <button
            onClick={() => {
              setView("explorer");
              mobileSide.current?.showModal();
            }}
          >
            Files
          </button>
        </div>
        <KeyboardHelp />
        <span className="ide-actions">
          <StatusMenu
            issue={{
              key: issue.key,
              slug: issue.slug,
              revision: issue.revision,
            }}
          />
          {issue.runnable ? (
            action === "retry" ? (
              <button type="button" className="ide-run" onClick={startRuntime}>
                Retry environment
              </button>
            ) : running ? (
              <button
                type="button"
                className="ide-run cancel"
                onClick={() => session.current?.cancel()}
              >
                ■ Cancel {run?.purpose === "pull-request" ? "checks" : "run"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={`ide-run${action === "test" ? "" : " secondary"}`}
                  disabled={!ready}
                  onClick={(event) =>
                    void session.current?.run(
                      "local",
                      event.detail === 0 ? "keyboard" : "pointer",
                    )
                  }
                  title="Run the tests on your code (Ctrl/⌘-Enter)"
                >
                  ▶ Run tests <Shortcut />
                </button>
                <button
                  type="button"
                  className={`ide-run${action === "push" ? "" : " secondary"}`}
                  disabled={!ready}
                  onClick={(event) =>
                    void session.current?.pullRequest(
                      event.detail === 0 ? "keyboard" : "pointer",
                    )
                  }
                  title={
                    openPull
                      ? `Push this code to pull request #${openPull.number}: CI checks it again (Ctrl/⌘-Shift-Enter)`
                      : "Open a pull request: CI checks this exact code; then you review it and merge it (Ctrl/⌘-Shift-Enter)"
                  }
                >
                  ⇡{" "}
                  {openPull
                    ? `Push to #${openPull.number}`
                    : done
                      ? "Open another PR"
                      : "Open pull request"}{" "}
                  <Shortcut shift />
                </button>
                {action === "continue" &&
                  (next ? (
                    <StartWork issue={next} href={`/work/${next.key}`} />
                  ) : (
                    <Link className="ide-run" href="/issues">
                      Browse issues →
                    </Link>
                  ))}
                {reviewTarget && (
                  <Link
                    className="ide-run"
                    href={pullHref(issue.key, reviewTarget.number)}
                  >
                    {reviewable ? "Review and merge" : "Resolve findings on"} #
                    {reviewTarget.number} →
                  </Link>
                )}
              </>
            )
          ) : (
            <span
              className="ide-run disabled"
              title="CI isn't set up for this repo yet"
            >
              ⇡ Open pull request
            </span>
          )}
        </span>
      </header>

      <dialog
        className="ide-mobile-dialog"
        ref={mobileSide}
        aria-label={view === "ticket" ? "Challenge" : "Files"}
      >
        <button
          className="dialog-close"
          onClick={() => mobileSide.current?.close()}
        >
          Back to editor ×
        </button>
        {sideContent}
      </dialog>
      <nav className="ide-activity" aria-label="Views">
        <ActivityButton
          label={unread ? "Challenge (new context)" : "Challenge"}
          active={view === "ticket"}
          dot={unread}
          onClick={() => {
            setView("ticket");
            setUnread(false);
          }}
        >
          <TicketIcon />
        </ActivityButton>
        <ActivityButton
          label="Files"
          active={view === "explorer"}
          onClick={() => setView("explorer")}
        >
          <FilesIcon />
        </ActivityButton>
      </nav>

      <aside className="ide-side">{sideContent}</aside>

      <Splitter
        axis="x"
        className="ide-side-splitter"
        label="Resize the side bar"
        value={layout.side}
        min={SIDE.min}
        max={() => SIDE.max}
        initial={SIDE.initial}
        onChange={layout.setSide}
      />

      <main className="ide-main" ref={mainRef}>
        {runtime.state === "loading" && !booting && (
          <div
            className="ide-progress"
            role="progressbar"
            aria-label="Setting up your environment"
            {...progressValue(runtime.progress)}
          />
        )}
        <div
          className="ide-tabs"
          role="tablist"
          aria-label="Open files"
          onKeyDown={tabKeys}
        >
          {tabs.map((path) => {
            const file = repo.files.find((f) => f.path === path)!;
            return (
              <div key={path} className="ide-tab-wrap">
                <button
                  type="button"
                  role="tab"
                  id={`file-tab-${file.path}`}
                  aria-controls={`file-panel-${file.path}`}
                  aria-selected={path === active}
                  tabIndex={path === active ? 0 : -1}
                  className="ide-tab"
                  onClick={() => setActive(path)}
                >
                  <LanguageDot language={file.language} />
                  {path.split("/").pop()}
                </button>
                {file.role === "edit" ? (
                  edited.has(path) && (
                    <span className="ide-dot" title="Modified" />
                  )
                ) : (
                  <button
                    type="button"
                    className="ide-close"
                    aria-label={`Close ${path}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(path);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="ide-crumbs faint">
          {repo.root} › {active.split("/").join(" › ")}
          {!editable.some((f) => f.path === active) && (
            <span className="ide-ro">read-only</span>
          )}
        </div>
        <div className="ide-editors">
          {repo.files.map((file) => (
            <div
              key={file.path}
              className="ide-editor"
              role="tabpanel"
              id={`file-panel-${file.path}`}
              aria-labelledby={`file-tab-${file.path}`}
              hidden={!tabs.includes(file.path) || file.path !== active}
              ref={(node) => {
                if (node) hosts.current.set(file.path, node);
              }}
            />
          ))}
          {opening.state === "failed" && (
            <p className="ide-overlay error" role="alert">
              {opening.message}
            </p>
          )}
        </div>

        <section className="ide-panel">
          <Splitter
            axis="y"
            className="ide-panel-splitter"
            label="Resize the panel"
            value={layout.panel}
            min={PANEL.min}
            max={() => panelMax(mainRef.current?.clientHeight ?? 600)}
            initial={PANEL.initial}
            onChange={layout.setPanel}
          />
          <div
            className="ide-panel-tabs"
            role="tablist"
            aria-label="Results"
            onKeyDown={tabKeys}
          >
            <button
              type="button"
              role="tab"
              aria-selected={panel === "tests"}
              tabIndex={panel === "tests" ? 0 : -1}
              id="result-tab-tests"
              aria-controls="result-panel-tests"
              onClick={() => setPanel("tests")}
            >
              Tests
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panel === "output"}
              tabIndex={panel === "output" ? 0 : -1}
              id="result-tab-output"
              aria-controls="result-panel-output"
              onClick={() => setPanel("output")}
            >
              Output
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panel === "pulls"}
              tabIndex={panel === "pulls" ? 0 : -1}
              id="result-tab-pulls"
              aria-controls="result-panel-pulls"
              onClick={() => setPanel("pulls")}
            >
              Pull requests{" "}
              {pulls.length > 0 && (
                <span className="ide-count">{pulls.length}</span>
              )}
            </button>
          </div>
          <div
            className="ide-panel-body"
            role="tabpanel"
            id={`result-panel-${panel}`}
            aria-labelledby={`result-tab-${panel}`}
            tabIndex={0}
          >
            {notes.length > 0 && (
              <div className="ide-team-notes" role="status">
                {notes.map((note, index) => (
                  <p key={index} className="ide-team-note">
                    <span className="ide-team-text">
                      <b>{note.author}</b>{" "}
                      <span className="faint">· {note.role}</span> {note.text}
                    </span>{" "}
                    {note.pullRequest ? (
                      <Link href={pullHref(issue.key, note.pullRequest)}>
                        View #{note.pullRequest}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="ide-link"
                        onClick={() => {
                          setView("ticket");
                          setUnread(false);
                          if (window.matchMedia("(max-width: 860px)").matches)
                            mobileSide.current?.showModal();
                        }}
                      >
                        Open challenge
                      </button>
                    )}
                  </p>
                ))}
              </div>
            )}
            {message && (
              <p className="ide-message" role="status">
                {message}
              </p>
            )}
            {panel === "pulls" ? (
              <PullRequests
                pulls={pulls}
                merged={merged}
                closed={closed}
                blocking={blocking}
                mergeable={reviewable?.number ?? null}
                threads={feedback.threads}
                revisions={revisions}
                issue={issue}
                done={done}
                runnable={issue.runnable}
              />
            ) : panel === "tests" ? (
              <Tests
                challenge={challenge}
                run={run}
                stale={stale}
                issue={issue}
                testsPath={testsFile.path}
                runtime={runtime}
                onRetry={startRuntime}
              />
            ) : (
              <Output
                run={run}
                challenge={challenge}
                runtime={engine?.label ?? languageLabel(issue.language)}
              />
            )}
          </div>
        </section>
      </main>

      <footer className="ide-status">
        <span
          title={
            offline ? "Keep editing; retry checks when reconnected." : "Branch"
          }
          role={offline ? "status" : undefined}
        >
          {offline ? "Offline · retry checks when online" : `⎇ ${repo.branch}`}
        </span>
        {capture && (
          <span
            className={`ide-save ${saveBadge(capture).tone}`}
            title={saveState(capture, true)}
          >
            {saveBadge(capture).label}
          </span>
        )}
        <span className="ide-status-right">
          {keymap === "vim" && (
            <span className="ide-vim">-- {vimMode.toUpperCase()} --</span>
          )}
          <span>{languageLabel(issue.language)}</span>
          <span>
            {issue.runnable && engine
              ? `${toolchain(engine.label)} · ${runtimeLabel(runtime)}`
              : "No test runner"}
          </span>
        </span>
      </footer>
      {booting && (
        <Boot
          issue={issue}
          root={repo.root}
          branch={repo.branch}
          opening={opening}
          runtime={runtime}
          onSkip={() => setBooted(true)}
        />
      )}
      <div ref={sandboxHost} hidden />
    </div>
  );
}

/** Download share as aria values and a CSS variable; indeterminate while starting. */
function progressValue(progress?: LoadProgress) {
  if (progress?.phase !== "download" || !progress.total) return {};
  const percent = Math.round((progress.loaded / progress.total) * 100);
  return {
    "aria-valuenow": percent,
    style: { "--progress": `${percent}%` } as CSSProperties,
  };
}

function megabytes(bytes: number): string {
  return (bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0);
}

function runtimeLabel(runtime: Runtime): string {
  if (runtime.state === "loading") {
    const p = runtime.progress;
    if (p?.phase === "download" && p.loaded < p.total)
      return `installing ${Math.round((p.loaded / p.total) * 100)}%`;
    return "starting…";
  }
  if (runtime.state === "ready") return "ready";
  if (runtime.state === "unavailable") return "unavailable";
  return "";
}

function ActivityButton({
  label,
  active,
  dot,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  /** Something new to look at. */
  dot?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="ide-activity-button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
      {dot && <span className="ide-activity-dot" aria-hidden />}
    </button>
  );
}

function Explorer({
  root,
  files,
  active,
  edited,
  onOpen,
}: {
  root: string;
  files: RepoFile[];
  active: string;
  edited: ReadonlySet<string>;
  onOpen(path: string): void;
}) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const render = (nodes: TreeNode[], depth: number): ReactNode =>
    nodes.map((node) =>
      node.children ? (
        <li key={node.path}>
          <span className="ide-folder" style={{ paddingLeft: 8 + depth * 12 }}>
            ▾ {node.name}
          </span>
          <ul>{render(node.children, depth + 1)}</ul>
        </li>
      ) : (
        <li key={node.path}>
          <button
            type="button"
            className="ide-file"
            aria-current={node.path === active ? "true" : undefined}
            style={{ paddingLeft: 20 + depth * 12 }}
            onClick={() => onOpen(node.path)}
          >
            <LanguageDot language={byPath.get(node.path)!.language} />
            {node.name}
            {edited.has(node.path) && (
              <span className="ide-git" title="Modified">
                M
              </span>
            )}
          </button>
        </li>
      ),
    );
  return (
    <div className="ide-explorer">
      <h2>Explorer</h2>
      <div className="ide-root">▾ {root.toUpperCase()}</div>
      <ul>{render(tree(files.map((f) => f.path)), 0)}</ul>
    </div>
  );
}

function Ticket({
  issue,
  examples,
  testsPath,
  thread,
  onOpenTests,
}: {
  issue: IdeIssue;
  examples: readonly { name?: string; input: unknown; expected: unknown }[];
  testsPath: string;
  /** The ticket's comments, then teammates' later ones, with when they were posted. */
  thread: (IssueComment & { at?: string })[];
  onOpenTests(): void;
}) {
  const now = new Date();
  return (
    <div className="ide-ticket">
      <h2>Challenge</h2>
      <p className="ide-ticket-key mono">{issue.key}</p>
      <h3>{issue.title}</h3>
      <h2>Goal and requirements</h2>
      <Markdown source={issue.task} />
      <ChallengeExamples examples={examples} />
      <p className="ide-ticket-tests">
        {examples.length} example check{examples.length === 1 ? "" : "s"} in{" "}
        <button type="button" className="ide-link" onClick={onOpenTests}>
          {testsPath}
        </button>
      </p>
      {thread.length > 0 && (
        <details className="ide-comments challenge-context" open>
          <summary>Notes and constraints</summary>
          {thread.map((comment, i) => (
            <div className="ide-comment" key={i}>
              <b>{comment.author}</b>
              {comment.role && <span className="faint"> · {comment.role}</span>}
              {comment.at && (
                <time className="faint" dateTime={comment.at}>
                  {" "}
                  · {timeAgo(comment.at, now)}
                </time>
              )}
              <Markdown source={comment.body} />
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

function Tests({
  challenge,
  run,
  stale,
  issue,
  testsPath,
  runtime,
  onRetry,
}: {
  challenge: Executable;
  run: RunView | null;
  stale: boolean;
  issue: IdeIssue;
  testsPath: string;
  runtime: Runtime;
  onRetry(): void;
}) {
  /** The cases in the repo's test file, which Run tests runs. */
  const visible = casesRun(challenge.cases, "local").length;
  if (!issue.runnable)
    return (
      <p className="faint">
        This repo has no test runner set up yet. Your edits are saved as you go;
        the {visible} cases are in {testsPath}.
      </p>
    );
  if (runtime.state === "unavailable")
    return (
      <p className="error" role="alert">
        Your environment couldn&apos;t be set up.{" "}
        <button type="button" className="ide-link" onClick={onRetry}>
          Retry
        </button>
      </p>
    );
  if (!run)
    return (
      <p className="faint">
        Start in {challenge.entry}: change the code to meet the requirements,
        then run tests (<Shortcut />
        ). {visible} acceptance checks are in {testsPath}.
      </p>
    );
  const o = run.outcome;
  if (!o) return <p className="faint">Running…</p>;
  if (o.status === "timeout")
    return (
      <p className="error">
        Stopped after {o.timeoutMs / 1000} s. Look for a loop that never ends.
      </p>
    );
  if (o.status === "cancelled") return <p className="faint">Run cancelled.</p>;
  if (o.status === "runner-error")
    return (
      <p className="error">
        The test runner crashed; this wasn&apos;t your code. Run the tests
        again.
      </p>
    );
  if (o.error && o.phase !== "tests")
    return (
      <pre className="ide-trace">
        {o.error.traceback.text || `${o.error.type}: ${o.error.message}`}
      </pre>
    );
  const cases = casesRun(challenge.cases, run.purpose);
  const feedback = runFeedback(cases, o.cases);
  const failed = feedback.total - feedback.correct;
  return (
    <div>
      <p className="ide-run-label faint">
        {run.pullRequest
          ? `Checks for pull request #${run.pullRequest.number}`
          : "Local run"}
      </p>
      <p className={`ide-summary ${failed ? "fail" : "pass"}`}>
        {failed ? "✘" : "✔"} {feedback.correct} passed
        {failed > 0 && `, ${failed} failed`} · {o.durationMs} ms
        {stale && <span className="faint"> · you&apos;ve edited since</span>}
      </p>
      <ol className="ide-cases">
        {cases.map((check, index) => (
          <Case
            key={index}
            index={index}
            label={check.name ?? caseLabel(challenge, check.input)}
            expected={check.expected}
            passed={feedback.passed[index]}
            result={o.cases[index]}
          />
        ))}
      </ol>
    </div>
  );
}

function Case({
  index,
  label,
  expected,
  passed,
  result,
}: {
  index: number;
  label: string;
  expected?: unknown;
  passed: boolean;
  result?: CaseResult;
}) {
  return (
    <li className={passed ? "pass" : "fail"}>
      <span className="ide-case-mark">{passed ? "✔" : "✘"}</span>
      <span className="ide-case-body">
        <code>{label}</code>
        {!passed && (
          <span className="ide-case-detail">
            <span>
              expected <code>{JSON.stringify(expected)}</code>
            </span>
            {result?.error ? (
              <pre className="ide-trace">{result.error.traceback.text}</pre>
            ) : result?.conversionError ? (
              <pre className="ide-trace">
                {result.conversionError.traceback.text ||
                  `${result.conversionError.type}: ${result.conversionError.message}`}
              </pre>
            ) : (
              <span>
                got <code>{result?.repr?.text ?? "nothing"}</code>
                {result?.unserializable &&
                  ` (not JSON: ${result.unserializable})`}
              </span>
            )}
          </span>
        )}
      </span>
      <span className="ide-case-index faint">#{index + 1}</span>
    </li>
  );
}

/** An open pull request by what its checks said; merged ones are labelled Merged. */
const PR_RESULTS: Record<
  string,
  { mark: string; label: string; tone: string }
> = {
  running: { mark: "●", label: "Checks running…", tone: "busy" },
  "checks-passed": { mark: "✔", label: "Open · checks passed", tone: "pass" },
  "checks-failed": { mark: "✘", label: "Open · checks failed", tone: "fail" },
  "checks-errored": { mark: "!", label: "Open · checks errored", tone: "fail" },
  cancelled: { mark: "–", label: "Open · checks cancelled", tone: "faint" },
};
const MERGED = { mark: "⇢", label: "Merged", tone: "merged" };
const CLOSED = { mark: "×", label: "Closed", tone: "faint" };

/** The pull requests list shows the newest few; the rest stay one click away. */
const PULLS_NEWEST = 3;

function PullRequests({
  pulls,
  merged,
  closed,
  blocking,
  mergeable,
  threads,
  revisions,
  issue,
  done,
  runnable,
}: {
  pulls: PullRequestRecord[];
  /** The pull request that can be merged now (lib/merge), if any. */
  mergeable: number | null;
  merged: ReadonlySet<number>;
  closed: ReadonlySet<number>;
  /** Open blocking review threads by pull request number. */
  blocking: ReadonlyMap<number, number>;
  /** Every review thread on this issue's pull requests. */
  threads: readonly Thread[];
  revisions: Readonly<Record<string, Revision>>;
  issue: IdeIssue;
  done: boolean;
  runnable: boolean;
}) {
  const now = new Date();
  const isMerged = (pr: PullRequestRecord) =>
    pr.result === "merged" || merged.has(pr.number);
  const mergedPull = pulls.find(isMerged);
  const latest = pulls[0];
  const [all, setAll] = useState(false);
  const older = Math.max(0, pulls.length - PULLS_NEWEST);
  const listed = all ? pulls : pulls.slice(0, PULLS_NEWEST);
  return (
    <div>
      {latest && !done && closed.has(latest.number) && (
        <p className="ide-review">
          Pull request #{latest.number} is closed. When your code is ready, open
          a new one (<Shortcut shift />
          ).
        </p>
      )}
      {latest &&
        !done &&
        !isMerged(latest) &&
        !closed.has(latest.number) &&
        latest.result !== "running" &&
        (latest.result === "checks-passed" && blocking.get(latest.number) ? (
          <div className="ide-review">
            <p>
              <b>Next: answer the review on #{latest.number}.</b> Its checks
              pass, but {comments(blocking.get(latest.number)!)}{" "}
              {blocking.get(latest.number) === 1 ? "blocks" : "block"} merging.
              {revisions[issue.revision]?.team.some(
                (c) => c.resolve === "explicit",
              ) ? (
                <>
                  Change the code and push (<Shortcut shift />
                  ), then resolve it on #{latest.number}.
                </>
              ) : (
                <>
                  Change the code and push (<Shortcut shift />
                  ), or reply on #{latest.number} if it should stay as it is.
                </>
              )}
            </p>
            <ReviewComments
              threads={threads.filter((t) => t.number === latest.number)}
              revisions={revisions}
            />
            <Link
              className="ide-run secondary"
              href={pullHref(issue.key, latest.number)}
            >
              {revisions[issue.revision]?.team.some(
                (c) => c.resolve === "explicit",
              )
                ? `Resolve on #${latest.number} →`
                : `Reply on #${latest.number} →`}
            </Link>
          </div>
        ) : latest.result === "checks-passed" && mergeable !== latest.number ? (
          <p className="ide-review">
            Pull request #{latest.number} passed its checks, but they don&apos;t
            cover the code or ticket you have now. Push again (
            <Shortcut shift />) so CI checks what you have.{" "}
            <Link href={pullHref(issue.key, latest.number)}>
              View #{latest.number}
            </Link>
          </p>
        ) : latest.result === "checks-passed" ? (
          <div className="ide-review">
            <p>
              <b>Next: review and merge #{latest.number}.</b> All its checks
              pass. Read through your changes on the pull request, then merge
              it; merging moves {issue.key} to Done.
            </p>
            <ReviewComments
              threads={threads.filter((t) => t.number === latest.number)}
              revisions={revisions}
            />
          </div>
        ) : (
          <p className="ide-review">
            Pull request #{latest.number} is open, but its checks don&apos;t
            pass yet, so it can&apos;t be merged. Keep working and push to it (
            <Shortcut shift />
            ); CI runs again on the new code.{" "}
            <Link href={pullHref(issue.key, latest.number)}>
              View #{latest.number}
            </Link>
          </p>
        ))}
      {done && mergedPull && (
        <p className="ide-done">
          Pull request #{mergedPull.number} merged. {issue.key} is <b>Done</b>.{" "}
          <Link href={pullHref(issue.key, mergedPull.number)}>
            View outcome
          </Link>{" "}
        </p>
      )}
      {pulls.length === 0 ? (
        <p className="faint">
          {runnable ? (
            <>
              When your code is ready, open a pull request (<Shortcut shift />
              ). CI runs every check on that exact code; then you review it and
              merge it, which moves {issue.key} to Done. Run the tests (
              <Shortcut />) as often as you like before that.
            </>
          ) : (
            <>
              CI isn&apos;t set up for this repo yet, so pull requests
              can&apos;t be opened. Your edits are saved.
            </>
          )}
        </p>
      ) : (
        <>
          <ol className="ide-pulls" id="ide-pull-list">
            {listed.map((pr) => {
              const shown = isMerged(pr)
                ? MERGED
                : closed.has(pr.number)
                  ? CLOSED
                  : (PR_RESULTS[pr.result] ?? PR_RESULTS["checks-errored"]);
              return (
                <li key={pr.number} className={shown.tone}>
                  <span className="ide-pr-mark">{shown.mark}</span>
                  {pr.result === "running" ? (
                    <span className="mono">#{pr.number}</span>
                  ) : (
                    <Link
                      className="mono"
                      href={pullHref(issue.key, pr.number)}
                    >
                      #{pr.number}
                    </Link>
                  )}
                  <span className="ide-pr-label">{shown.label}</span>
                  <span className="faint">
                    {pr.result === "running"
                      ? `${pr.total} checks`
                      : `${pr.passed}/${pr.total} checks`}
                    {pr.pushes > 1 && ` · ${pr.pushes} pushes`}
                    {!isMerged(pr) &&
                      !closed.has(pr.number) &&
                      blocking.get(pr.number) && (
                        <span className="ide-pr-blocking">
                          {" · "}
                          {comments(blocking.get(pr.number)!)}
                        </span>
                      )}
                  </span>
                  <time className="faint" dateTime={pr.at}>
                    {timeAgo(pr.at, now)}
                  </time>
                </li>
              );
            })}
          </ol>
          {older > 0 && (
            <button
              type="button"
              className="pull-more"
              aria-expanded={all}
              aria-controls="ide-pull-list"
              onClick={() => setAll((v) => !v)}
            >
              {all ? "Show fewer" : `Show all ${pulls.length} pull requests`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Teammates' review comments on a pull request, as they read on the pull request's page. */
function ReviewComments({
  threads,
  revisions,
}: {
  threads: readonly Thread[];
  revisions: Readonly<Record<string, Revision>>;
}) {
  const shown = threads.flatMap((t) => {
    const comment = revisions[t.issueRevision]?.team.find(
      (c) => c.id === t.comment,
    );
    return comment ? [{ thread: t, comment }] : [];
  });
  if (!shown.length) return null;
  return (
    <div className="ide-comments">
      {shown.map(({ thread, comment }) => (
        <div className="ide-comment" key={`${thread.comment}-${thread.push}`}>
          <b>{comment.author.name}</b>
          <span className="faint"> · {comment.author.role}</span>
          {thread.severity === "blocking" && (
            <span className="faint">
              {" "}
              · {thread.resolved ? "resolved" : "requested changes"}
            </span>
          )}
          <Markdown source={comment.text[thread.wording] ?? comment.text[0]} />
        </div>
      ))}
    </div>
  );
}

/** The app page the IDE was opened from, if it was one of ours. */
function entryPath(): string | null {
  // Client navigation leaves document.referrer at the first page loaded; the tracker notes
  // the page before this one.
  try {
    const previous = sessionStorage.getItem(PREVIOUS_PATH_KEY);
    if (previous && !previous.startsWith("/work/")) return previous;
  } catch {
    // Fall back to the referrer.
  }
  try {
    const from = new URL(document.referrer);
    return from.origin === location.origin ? from.pathname + from.search : null;
  } catch {
    return null;
  }
}

function comments(count: number): string {
  return `${count} blocking finding${count === 1 ? "" : "s"}`;
}

/** One line in the panel saying what teammates just did. */
interface TeamNote {
  author: string;
  role: string;
  text: string;
  /** A review comment's pull request; absent for the ticket's thread. */
  pullRequest?: number;
}

/**
 * What teammates just said on the ticket, for showing in place: issue comments and hints.
 * Review comments are shown with their pull request instead.
 */
function teamNotes(releases: readonly Release[]): TeamNote[] {
  return releases.flatMap((r): TeamNote[] => {
    if (r.kind === "resolved") return [];
    if (r.kind === "comment" && r.pullRequest) return [];
    const plain = (text: string) => text.replace(/`/g, "");
    if (r.kind === "hint")
      return [
        {
          author: r.hint.author.name,
          role: r.hint.author.role,
          text: plain(r.hint.text),
        },
      ];
    return [
      {
        author: r.comment.author.name,
        role: r.comment.author.role,
        text: plain(r.comment.text[r.wording] ?? r.comment.text[0]),
        ...(r.pullRequest ? { pullRequest: r.pullRequest } : {}),
      },
    ];
  });
}

function announcement(releases: readonly Release[]): string {
  return releases
    .map((r) => {
      if (r.kind === "hint")
        return `${r.hint.author.name} commented on the ticket.`;
      if (r.kind === "resolved")
        return `Review comment on #${r.pullRequest} resolved by your push.`;
      const who = r.comment.author.name;
      if (!r.pullRequest) return `${who} commented on the ticket.`;
      return r.comment.severity === "blocking"
        ? `${who} requested changes on #${r.pullRequest}.`
        : `${who} commented on #${r.pullRequest}.`;
    })
    .join(" ");
}

/** The run as a terminal shows it: printed output, errors with traces, cases, summary. */
function Output({
  run,
  challenge,
  runtime,
}: {
  run: RunView | null;
  challenge: Executable;
  runtime: string;
}) {
  const log = transcript(run, challenge, runtime);
  if (!log.length)
    return (
      <p className="faint">
        Everything your last run printed, raised or returned shows here.
      </p>
    );
  return (
    <pre className="ide-output">
      {log.map((line, index) => (
        <span key={index} className={`ide-line ${line.tone}`}>
          {line.text}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

function TicketIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

function FilesIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

/**
 * What the IDE is doing while it opens: checking out the issue's repo, restoring saved work and
 * loading the language's runtime into the tab, with download progress. Editing can start before the
 * runtime is ready; only Run waits for it.
 */
function Boot({
  issue,
  root,
  branch,
  opening,
  runtime,
  onSkip,
}: {
  issue: IdeIssue;
  root: string;
  branch: string;
  opening: Opening;
  runtime: Runtime;
  onSkip(): void;
}) {
  const engine = engineFor(issue.language);
  const opened = opening.state === "open";
  const progress = runtime.state === "loading" ? runtime.progress : undefined;
  const downloading =
    progress?.phase === "download" && progress.loaded < progress.total;
  return (
    <div className="ide-boot" role="status" aria-live="polite">
      <div className="ide-boot-card">
        <img src="/logo.svg" alt="" className="ide-boot-logo" />
        <p className="ide-boot-title">
          <span className="mono faint">{issue.key}</span> {issue.title}
        </p>
        <ol className="ide-boot-steps">
          <BootStep state="done">
            Cloned <b>{root}</b>
          </BootStep>
          <BootStep state={opened ? "done" : "busy"}>
            {opened ? "Checked out " : "Checking out "}
            <b className="mono">{branch}</b>
            {!opened && "…"}
          </BootStep>
          {engine ? (
            <BootStep state={runtime.state === "loading" ? "busy" : "done"}>
              {downloading
                ? `Installing ${toolchain(engine.label)}`
                : runtime.state === "loading"
                  ? `Starting ${toolchain(engine.label)}…`
                  : `${toolchain(engine.label)} ready`}
              {downloading && progress?.phase === "download" && (
                <>
                  <span className="faint">
                    {" "}
                    · {megabytes(progress.loaded)} of{" "}
                    {megabytes(progress.total)} MB
                  </span>
                  <span
                    className="ide-boot-bar"
                    style={
                      {
                        "--progress": `${Math.round((progress.loaded / progress.total) * 100)}%`,
                      } as CSSProperties
                    }
                  />
                </>
              )}
            </BootStep>
          ) : (
            <BootStep state="skipped">
              No test runner set up for this repo
            </BootStep>
          )}
        </ol>
        {opened && (
          <button
            type="button"
            className="ide-link ide-boot-skip"
            onClick={onSkip}
          >
            Start editing now; tests can run once setup finishes
          </button>
        )}
      </div>
    </div>
  );
}

function BootStep({
  state,
  children,
}: {
  state: "done" | "busy" | "skipped";
  children: ReactNode;
}) {
  return (
    <li className={`ide-boot-step ${state}`}>
      <span className="ide-boot-mark" aria-hidden>
        {state === "done" ? "✔" : state === "busy" ? "" : "–"}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Shortcut({ shift = false }: { shift?: boolean }) {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return (
    <kbd>
      {mac ? "⌘" : "Ctrl+"}
      {shift ? (mac ? "⇧" : "Shift+") : ""}
      {mac ? "↵" : "Enter"}
    </kbd>
  );
}

function KeyboardHelp() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        className="ide-help"
        onClick={() => dialog.current?.showModal()}
        aria-label="Keyboard shortcuts"
      >
        ?
      </button>
      <dialog
        className="keyboard-help"
        ref={dialog}
        aria-labelledby="keyboard-help-title"
      >
        <button
          className="dialog-close"
          onClick={() => dialog.current?.close()}
        >
          Close ×
        </button>
        <h2 id="keyboard-help-title">Keyboard shortcuts</h2>
        <p>
          <Shortcut /> Run tests
        </p>
        <p>
          <Shortcut shift /> Open or push a pull request
        </p>
        <p>Press Escape, then Tab to move focus out of the editor.</p>
        <p>
          Use arrow keys, Home and End within tab bars. Escape closes dialogs.
        </p>
        <p>
          Editor keybindings can be changed in{" "}
          <Link href="/settings?run=editor">Settings</Link>.
        </p>
      </dialog>
    </>
  );
}
