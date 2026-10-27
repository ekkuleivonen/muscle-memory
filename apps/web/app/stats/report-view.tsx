"use client";
/** The report's chapters: one headline, one visual, one line of evidence, details on request. */
import Link from "next/link";
import React, { useEffect, useState } from "react";
import type {
  Cell,
  Chapter,
  ComparisonChapter,
  Evidence,
  HabitChapter,
  Marker,
  NextChapter,
  OutcomesChapter,
  Report,
  StoryChapter,
  SurpriseChapter,
} from "../../lib/report";
import { shareText } from "../../lib/report";

const percent = (x: number) => `${Math.round(x * 1000) / 10}%`;

export function EvidenceLine({ evidence }: { evidence: Evidence }) {
  return (
    <div className="report-evidence">
      <p>
        <span className="report-evidence-tag" aria-hidden>
          evidence
        </span>{" "}
        {evidence.basis}
        {evidence.caveat ? <span className="t-dim"> {evidence.caveat}</span> : null}
      </p>
      <details>
        <summary>How this was worked out</summary>
        <ul>
          {evidence.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function Frame({
  chapter,
  index,
  count,
  children,
}: {
  chapter: Chapter;
  index: number;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="report-chapter"
      id={`chapter-${chapter.id}`}
      aria-labelledby={`chapter-${chapter.id}-title`}
      data-chapter={chapter.id}
    >
      <p className="report-kicker">
        <span className="t-accent">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="t-dim"> / {String(count).padStart(2, "0")}</span>{" "}
        <span id={`chapter-${chapter.id}-title`}>{chapter.title}</span>
      </p>
      {children}
    </section>
  );
}

function Outcomes({ c }: { c: OutcomesChapter }) {
  return (
    <>
      <h2 className="report-headline">{c.headline}</h2>
      {c.context && <p className="report-context">{c.context}</p>}
      <dl className="report-heroes">
        {c.heroes.map((h) => (
          <div key={h.label}>
            <dt>{h.label}</dt>
            <dd>{h.value}</dd>
          </div>
        ))}
      </dl>
      <div className="report-grid" role="group" aria-label="Challenges you started">
        {c.languages.map((l) => (
          <div className="report-grid-row" key={l.language}>
            <span className="report-grid-label">{l.label}</span>
            <ul className="report-cells">
              {l.items.map((i) => (
                <li
                  key={i.key}
                  className={`report-cell is-${i.outcome}${i.revisited ? " is-revisited" : ""}`}
                  title={`${i.key} · ${i.title}: ${i.outcome === "completed" ? "finished" : "open"}${i.revisited ? ", revisited" : ""}${i.fromUploads ? ", from your uploads" : ""}`}
                >
                  <span className="sr-only">
                    {i.key} {i.title}: {i.outcome === "completed" ? "finished" : "open"}
                    {i.revisited ? ", revisited" : ""}
                    {i.fromUploads ? ", from your uploads" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="report-legend t-dim" aria-hidden>
        <span className="report-cell is-completed" /> finished{" "}
        <span className="report-cell is-unfinished" /> open{" "}
        <span className="report-cell is-completed is-revisited" /> revisited
        {c.unexplored > 0 ? ` · ${c.unexplored} more waiting` : ""}
      </p>
      <EvidenceLine evidence={c.evidence} />
    </>
  );
}

const MARK: Record<Marker["kind"], string> = {
  start: "▸",
  resume: "↻",
  leave: "‖",
  examples: "·",
  pass: "●",
  fail: "✗",
  error: "◆",
  done: "✔",
  gap: "?",
};
function Story({ c }: { c: StoryChapter }) {
  return (
    <>
      <h2 className="report-headline">{c.headline}</h2>
      <div className="report-track" aria-hidden>
        <div className="report-track-line" />
        {c.markers.map((m, i) => (
          <span
            key={i}
            className={`report-mark is-${m.kind}`}
            style={{ left: percent(m.x) }}
            title={m.label}
          >
            {MARK[m.kind]}
          </span>
        ))}
      </div>
      <ol className="sr-only" aria-label={`Checkpoints on ${c.challenge}, in order`}>
        {c.markers.map((m, i) => (
          <li key={i}>{m.label}</li>
        ))}
      </ol>
      {c.submissions.length > 0 && (
        <div className="report-bars" aria-label="Checks passed by each submission" role="list">
          {c.submissions.map((s, i) => (
            <div className="report-bar-row" role="listitem" key={i}>
              <span className="t-dim">#{i + 1}</span>
              <span className="report-bar">
                <span
                  className={`report-fill ${s.result === "passed" && s.passed === s.total ? "is-ok" : "is-err"}`}
                  style={{ width: s.total ? percent(s.passed / s.total) : "0%" }}
                />
              </span>
              <span>
                {s.result === "errored" || s.result === "cancelled"
                  ? s.result
                  : `${s.passed}/${s.total} checks`}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="report-legend t-dim" aria-hidden>
        ▸ start · example run <span className="t-ok">●</span> passed{" "}
        <span className="t-err">✗</span> not yet <span className="t-warn">◆</span>{" "}
        error ‖ left ↻ came back ✔ done
      </p>
      <EvidenceLine evidence={c.evidence} />
    </>
  );
}

function Habits({ c }: { c: HabitChapter }) {
  const total = c.small + c.large;
  const most = Math.max(1, ...c.checks.map((x) => x.checks));
  return (
    <>
      <h2 className="report-headline">{c.headline}</h2>
      <div className="report-split" aria-label={`${c.small} small edits and ${c.large} bigger edits`} role="img">
        <span className="report-split-small" style={{ flexGrow: c.small }}>
          {c.small / total >= 0.12 ? `${Math.round((c.small / total) * 100)}% small` : ""}
        </span>
        <span className="report-split-large" style={{ flexGrow: c.large }}>
          {c.large / total >= 0.12 ? `${Math.round((c.large / total) * 100)}% bigger` : ""}
        </span>
      </div>
      <p className="t-dim report-caption">
        {c.small} small edits · {c.large} bigger pieces
        {c.editsBetween !== null
          ? ` · median ${Math.round(c.editsBetween * 10) / 10} ${c.editsBetween === 1 ? "edit" : "edits"} between checks`
          : ""}
      </p>
      {c.checks.length > 1 && (
        <div className="report-spark" role="img" aria-label={`Checks per attempt: ${c.checks.map((x) => `${x.challenge} ${x.checks}`).join(", ")}`}>
          {c.checks.map((x, i) => (
            <span key={i} title={`${x.challenge}: ${x.checks} checks`} style={{ height: `${Math.max(8, (x.checks / most) * 100)}%` }} />
          ))}
        </div>
      )}
      {c.checks.length > 1 && <p className="t-dim report-caption">checks per attempt, oldest first</p>}
      <p className="report-cohort">
        <span className="t-dim">People like you:</span> not enough comparable
        participants yet. Your position appears here once there are.
      </p>
      <EvidenceLine evidence={c.evidence} />
    </>
  );
}

const CELL: Record<Cell["kind"], string> = {
  solved: "✔",
  "not-solved": "✗",
  open: "…",
  withheld: "≠",
  none: "—",
};
function CellView({ cell }: { cell: Cell }) {
  return (
    <span className={`report-result is-${cell.kind}`}>
      <span aria-hidden>{CELL[cell.kind]}</span>{" "}
      {cell.kind === "solved" ? (
        <>
          solved <span className="t-dim">· {cell.note}</span>
        </>
      ) : (
        <span className={cell.kind === "not-solved" ? undefined : "t-dim"}>{cell.note}</span>
      )}
    </span>
  );
}
function Minds({ c }: { c: ComparisonChapter }) {
  return (
    <>
      {/* Practice's completion link (owned by ENG-375) still points here. */}
      <span id="comparisons" />
      <h2 className="report-headline">{c.headline}</h2>
      <p className="report-scroll-hint t-dim" aria-hidden>
        scroll sideways for every model →
      </p>
      <div className="report-table-wrap" tabIndex={0} role="region" aria-label="Results on the same challenges">
        <table className="report-table">
          <thead>
            <tr>
              <th scope="col">Challenge</th>
              <th scope="col">You</th>
              {c.columns.map((col) => (
                <th scope="col" key={col}>
                  {col}
                </th>
              ))}
              {!c.columns.length && <th scope="col">Models</th>}
              <th scope="col">People</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.revision}>
                <th scope="row">
                  <Link className="t-cmd" href={`/challenges/${r.challenge}`}>
                    {r.challenge}
                  </Link>
                </th>
                <td>
                  <CellView cell={r.you} />
                </td>
                {c.columns.map((col) => {
                  const m = r.models.find((x) => x.slot === col);
                  return (
                    <td key={col}>
                      {r.state === "loading" ? (
                        <span className="t-dim">reading…</span>
                      ) : r.state === "unavailable" ? (
                        <span className="t-dim">unavailable</span>
                      ) : m ? (
                        <CellView cell={m.cell} />
                      ) : (
                        <CellView cell={{ kind: "none", note: "not run" }} />
                      )}
                    </td>
                  );
                })}
                {!c.columns.length && (
                  <td>
                    <span className="t-dim">
                      {r.state === "loading"
                        ? "reading…"
                        : r.state === "unavailable"
                          ? "unavailable"
                          : "no try yet"}
                    </span>
                  </td>
                )}
                <td>
                  <span className="t-dim">too few yet</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {c.rows.some((r) => r.models.length) && (
        <details className="report-receipts">
          <summary>Exact models, versions and conditions</summary>
          <ul>
            {c.rows.flatMap((r) =>
              r.models.map((m) => (
                <li key={`${r.revision}:${m.slot}`}>
                  {r.challenge} · {m.receipt.model} · reasoning {m.receipt.reasoning} · try {m.receipt.try}
                  {" — "}
                  {m.receipt.reportedModels.length
                    ? `reported ${m.receipt.reportedModels.join(", ")}`
                    : "resolved version not recorded"}
                  {m.receipt.budget ? ` · budget ${m.receipt.budget.turns} turns / ${m.receipt.budget.submissions} submissions` : ""}
                  {m.receipt.runtime ? ` · runtime ${Object.values(m.receipt.runtime).join(" ")}` : ""}
                  <span className="t-dim"> · revision {r.revision.slice(0, 19)}…</span>
                </li>
              )),
            )}
          </ul>
        </details>
      )}
      <EvidenceLine evidence={c.evidence} />
    </>
  );
}

function Surprise({ c }: { c: SurpriseChapter }) {
  return (
    <>
      <h2 className="report-headline">{c.headline}</h2>
      <div className="report-compare">
        <div>
          <p className="t-dim">{c.before.label}</p>
          <p className="report-big is-before">{c.before.value}</p>
        </div>
        <span className="report-arrow" aria-hidden>
          →
        </span>
        <div>
          <p className="t-dim">{c.after.label}</p>
          <p className="report-big is-after">{c.after.value}</p>
        </div>
      </div>
      <EvidenceLine evidence={c.evidence} />
    </>
  );
}

function Share({ items, report }: { items: NextChapter["shareable"]; report: Report }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState("");
  if (!items.length) return null;
  const copy = async () => {
    const text = shareText(report, selected, `${location.origin}/`);
    if (!text) return setStatus("Pick at least one finding.");
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied. Nothing was posted; paste it wherever you like.");
    } catch {
      setStatus("Couldn't copy here. Select the text below instead.");
    }
  };
  return (
    <details className="report-share">
      <summary>Share a few findings (optional)</summary>
      <p className="t-dim">
        Pick what to include. Only these sentences are copied: no code, recordings or account.
      </p>
      <fieldset>
        <legend className="sr-only">Findings to share</legend>
        {items.map((i) => (
          <label key={i.id}>
            <input
              type="checkbox"
              checked={selected.has(i.id)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(i.id);
                else next.delete(i.id);
                setSelected(next);
                setStatus("");
              }}
            />{" "}
            {i.text}
          </label>
        ))}
      </fieldset>
      {selected.size > 0 && (
        <pre className="report-share-text">{shareText(report, selected, "")}</pre>
      )}
      <button type="button" className="t-cmd" onClick={() => void copy()}>
        Copy to clipboard
      </button>
      <p role="status" className="t-dim">
        {status}
      </p>
    </details>
  );
}

function Next({ c, report }: { c: NextChapter; report: Report }) {
  return (
    <>
      <h2 className="report-headline">{c.headline}</h2>
      {c.action && (
        <p>
          <Link className="report-action" href={c.action.href}>
            {c.action.label} →
          </Link>
        </p>
      )}
      <p className="report-context">{c.why}</p>
      {c.profile && (
        <p className="t-dim">
          <Link className="t-cmd" href={c.profile.href}>
            {c.profile.label}
          </Link>{" "}
          {c.profile.why}
        </p>
      )}
      <Share items={c.shareable} report={report} />
    </>
  );
}

export function ChapterView({ chapter, index, count, report }: { chapter: Chapter; index: number; count: number; report: Report }) {
  return (
    <Frame chapter={chapter} index={index} count={count}>
      {chapter.id === "outcomes" ? (
        <Outcomes c={chapter} />
      ) : chapter.id === "story" ? (
        <Story c={chapter} />
      ) : chapter.id === "habits" ? (
        <Habits c={chapter} />
      ) : chapter.id === "minds" ? (
        <Minds c={chapter} />
      ) : chapter.id === "surprise" ? (
        <Surprise c={chapter} />
      ) : (
        <Next c={chapter} report={report} />
      )}
    </Frame>
  );
}

const SHORT: Record<Chapter["id"], string> = {
  outcomes: "outcomes",
  story: "one attempt",
  habits: "how you work",
  minds: "models",
  surprise: "surprise",
  next: "next",
};
/** Where you are in the story; a list of links, highlighted as chapters scroll into view. */
export function ChapterNav({ chapters }: { chapters: Chapter[] }) {
  const [active, setActive] = useState(chapters[0]?.id);
  const ids = chapters.map((c) => c.id).join(",");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set((e.target as HTMLElement).dataset.chapter!, e.isIntersecting);
        const first = ids.split(",").find((id) => seen.get(id));
        if (first) setActive(first as Chapter["id"]);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    for (const id of ids.split(",")) {
      const el = document.getElementById(`chapter-${id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);
  return (
    <nav className="report-nav" aria-label="Report chapters">
      <ol>
        {chapters.map((c, i) => (
          <li key={c.id}>
            <a
              href={`#chapter-${c.id}`}
              aria-current={active === c.id ? "true" : undefined}
            >
              <span className="report-nav-dot" aria-hidden />
              <span className="report-nav-label">
                {i + 1}. {SHORT[c.id]}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** An explicitly labelled sample, so a new player sees what one challenge will reveal. */
export function Preview() {
  const cells = ["completed", "completed", "unfinished", "completed"];
  const marks: [Marker["kind"], number][] = [
    ["start", 0],
    ["examples", 0.2],
    ["examples", 0.35],
    ["fail", 0.5],
    ["examples", 0.7],
    ["pass", 0.9],
    ["done", 1],
  ];
  return (
    <figure className="report-preview" aria-label="Preview with sample data, not yours">
      <figcaption>
        <span className="report-evidence-tag">preview</span> sample data, not
        yours. After one challenge, your own version of this appears here.
      </figcaption>
      <p className="report-preview-line">Could you still do it?</p>
      <ul className="report-cells" aria-hidden>
        {cells.map((c, i) => (
          <li key={i} className={`report-cell is-${c}`} />
        ))}
      </ul>
      <p className="report-preview-line">How one attempt unfolded</p>
      <div className="report-track" aria-hidden>
        <div className="report-track-line" />
        {marks.map(([k, x], i) => (
          <span key={i} className={`report-mark is-${k}`} style={{ left: percent(x) }}>
            {MARK[k]}
          </span>
        ))}
      </div>
      <p className="report-preview-line">Same challenge, beside the models that tried it</p>
    </figure>
  );
}
