/** The report's questions: one answer, one small visual, and only the context a player needs. */
import React from "react";
import { SHORT, type Part, type Question, type Visual } from "../../lib/report";

const percent = (x: number) => `${Math.round(x * 1000) / 10}%`;
/** Slice colours in a fixed order (checked for colour-blind separation on the terminal background); the folded "other" slice is grey. */
export const SLICE_COLOURS = ["#7d86f1", "#bf8418", "#2fa36f", "#c95f9f"];
const OTHER = "#5b5f68";
const colour = (parts: Part[], i: number) =>
  i < SLICE_COLOURS.length && !(i === parts.length - 1 && /^\d+ other languages$/.test(parts[i].label)) ? SLICE_COLOURS[i] : OTHER;
/** The parts in words, for screen readers and as the chart's text equivalent. */
const inWords = (whole: string, parts: Part[]) => `${whole}: ${parts.map((p) => `${p.label} ${p.display}`).join("; ")}.`;

/** A legend that names every part in text beside its swatch: the colour never carries meaning alone. */
function Legend({ parts }: { parts: Part[] }) {
  return (
    <ul className="report-legend" aria-hidden>
      {parts.map((p, i) => (
        <li key={p.label}>
          <span className="report-swatch" style={{ color: colour(parts, i) }}>
            ■
          </span>
          <span>{p.label}</span>
          <span className="t-dim">{p.display}</span>
        </li>
      ))}
    </ul>
  );
}

/** A ring split into parts that add up to the whole, with a 2 px gap between slices. */
function Pie({ whole, parts }: { whole: string; parts: Part[] }) {
  const total = parts.reduce((t, p) => t + p.value, 0) || 1;
  let at = 0;
  const stops = parts.map((p, i) => {
    const from = at;
    at += (p.value / total) * 360;
    return `${colour(parts, i)} ${from}deg ${at}deg`;
  });
  return (
    <figure className="report-pie" role="img" aria-label={inWords(whole, parts)}>
      <span className="report-ring" style={{ background: `conic-gradient(${stops.join(", ")})` }}>
        {parts.length > 1 &&
          parts.map((p, i) => {
            const turn = parts.slice(0, i).reduce((t, x) => t + x.value, 0) / total;
            return <span key={p.label} className="report-ring-gap" style={{ transform: `rotate(${turn}turn)` }} />;
          })}
      </span>
      <Legend parts={parts} />
    </figure>
  );
}

/** Two or more parts of one whole as one dotted bar, segments in order. */
function Split({ whole, parts }: { whole: string; parts: Part[] }) {
  const total = parts.reduce((t, p) => t + p.value, 0) || 1;
  return (
    <figure className="report-split" role="img" aria-label={inWords(whole, parts)}>
      <span className="report-split-bar">
        {parts.map((p, i) => (
          <span key={p.label} style={{ width: percent(p.value / total), color: colour(parts, i) }} />
        ))}
      </span>
      <Legend parts={parts} />
    </figure>
  );
}

/** Rows of marks: ● for one that passed, ○ for one that didn't, in order. */
function Dots({ visual }: { visual: Extract<Visual, { kind: "dots" }> }) {
  const [yes, no] = visual.legend;
  return (
    <div className="report-dots">
      <ul>
        {visual.rows.map((r, i) => (
          <li key={`${r.label}:${i}`}>
            <span className="sr-only">{`${r.label}: ${r.marks.map((m) => (m ? yes : no)).join(", ")}; ${r.display}`}</span>
            <span className="t-dim" aria-hidden>
              {r.label}
            </span>
            <span className="report-marks" aria-hidden>
              {r.marks.map((m, j) => (
                <span key={j} className={m ? "is-yes" : "is-no"}>
                  {m ? "●" : "○"}
                </span>
              ))}
            </span>
            <span aria-hidden>{r.display}</span>
          </li>
        ))}
      </ul>
      <p className="report-key t-dim" aria-hidden>
        <span className="is-yes">●</span> {yes} <span className="is-no">○</span> {no}
      </p>
    </div>
  );
}

export function VisualView({ visual, label }: { visual: Visual; label: string }) {
  if (visual.kind === "pie") return <Pie whole={visual.whole} parts={visual.parts} />;
  if (visual.kind === "split") return <Split whole={visual.whole} parts={visual.parts} />;
  if (visual.kind === "dots") return <Dots visual={visual} />;
  if (visual.kind === "number")
    return (
      <p className="report-figure">
        {visual.value} <span className="t-dim">{visual.unit}</span>
      </p>
    );
  if (visual.kind === "turn")
    return (
      <p className="report-turn">
        <span className="t-dim">{visual.from}</span>{" "}
        <span className="t-accent" aria-hidden>
          →
        </span>{" "}
        <span className="t-ok">{visual.to}</span>
      </p>
    );
  const most = Math.max(1, ...visual.bars.map((b) => b.value));
  return (
    <div className="report-bars" role="list" aria-label={label}>
      {visual.bars.map((b, i) => (
        <div className="report-bar-row" role="listitem" key={`${b.label}:${i}`}>
          <span className="t-dim">{b.label}</span>
          <span className="report-bar">
            <span className="report-fill is-ok" style={{ width: percent(b.value / most) }} />
          </span>
          <span>{b.display}</span>
        </div>
      ))}
    </div>
  );
}

export function QuestionView({ q, children }: { q: Question; children?: React.ReactNode }) {
  return (
    <section className="report-question t-md" id={`q-${q.id}`} aria-labelledby={`q-${q.id}-title`}>
      <h3 id={`q-${q.id}-title`}>
        {q.question}
      </h3>
      <p className="report-headline">{q.answer}</p>
      {q.visual && <VisualView visual={q.visual} label={q.answer} />}
      {q.detail && <p className="report-detail">{q.detail}</p>}
      {q.note && <p className="report-note">{q.note}</p>}
      {q.fyi && <p className="report-fyi">{q.fyi}</p>}
      {children}
    </section>
  );
}

/** One answer as a line of the first-solves summary: a short label, the answer, its shape when it has one, and only what reads it right. */
export function ReceiptLine({ q, children }: { q: Question; children?: React.ReactNode }) {
  return (
    <li id={`q-${q.id}`}>
      <span className="t-dim">{SHORT[q.id]}</span>
      <span className="report-first-answer">{q.answer}</span>
      {/* A big number would only repeat the line; shapes stay. */}
      {q.visual && q.visual.kind !== "number" && <VisualView visual={q.visual} label={q.answer} />}
      {q.detail && <span className="report-first-more">{q.detail}</span>}
      {q.note && <span className="report-first-more t-dim">{q.note}</span>}
      {children}
    </li>
  );
}
