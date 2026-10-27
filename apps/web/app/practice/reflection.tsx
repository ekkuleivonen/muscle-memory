import React from "react";
import { AFTER_QUESTIONS } from "../../../../packages/domain/practice";
import type { ReflectionState } from "../../lib/solve-reflection";
export {
  reflectionFor,
  type ReflectionState,
} from "../../lib/solve-reflection";
const questions = {
  difficulty: {
    message: "How hard was it?",
    labels: ["too easy", "about right", "hard", "too hard"],
  },
  confidence: {
    message: "Before you submitted, how sure were you it would pass?",
    labels: ["sure", "fairly sure", "unsure", "guessing"],
  },
  "would-use-ai": {
    message: "At work, would you have used AI for this?",
    labels: ["yes", "maybe", "no"],
  },
};
export function Reflection({
  state,
  onDismiss,
}: {
  state: ReflectionState;
  onDismiss(answer?: string): void;
}) {
  if (state.dismissed) return null;
  const question = questions[state.question];
  return (
    <aside className="after-questions" aria-label="Optional reflection">
      <p className="faint">One optional reflection</p>
      <p className="after-question">{question.message}</p>
      <div className="reflection-choices">
        {AFTER_QUESTIONS[state.question].map((value, i) => (
          <button
            key={value}
            type="button"
            className="after-answer"
            onClick={() => onDismiss(value)}
          >
            {question.labels[i]}
          </button>
        ))}
        <button
          type="button"
          className="after-answer"
          onClick={() => onDismiss()}
        >
          Skip
        </button>
      </div>
    </aside>
  );
}
