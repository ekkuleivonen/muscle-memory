/** The report's questions: one answer, one small visual, and only the context a player needs. */
import React from "react";
import type { Question, Visual } from "../../lib/report";

const percent = (x: number) => `${Math.round(x * 1000) / 10}%`;

function VisualView({ visual, label }: { visual: Visual; label: string }) {
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
      <VisualView visual={q.visual} label={q.answer} />
      {q.detail && <p className="report-detail">{q.detail}</p>}
      {q.note && <p className="report-note">{q.note}</p>}
      {q.fyi && <p className="report-fyi">{q.fyi}</p>}
      {children}
    </section>
  );
}
