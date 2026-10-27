import type { AfterQuestion } from "../../../packages/domain/practice";
import type { Progress } from "./progress";
export interface ReflectionState {
  question: AfterQuestion;
  dismissed: boolean;
}
const questions: AfterQuestion[] = ["difficulty", "confidence", "would-use-ai"];
/** UI-only cooldown: at most one offer every five completed solves, starting at solve five. */
export const REFLECTION_SOLVE_INTERVAL = 5;
export function reflectionFor(progress: Progress): ReflectionState {
  const solves = Object.values(progress).reduce((n, p) => n + p.completions, 0);
  return {
    question:
      questions[
        Math.max(0, Math.floor(solves / REFLECTION_SOLVE_INTERVAL) - 1) %
          questions.length
      ],
    dismissed: solves === 0 || solves % REFLECTION_SOLVE_INTERVAL !== 0,
  };
}
export function parseReflection(value: unknown): ReflectionState | undefined {
  const v = value as ReflectionState | undefined;
  return v && questions.includes(v.question) && typeof v.dismissed === "boolean"
    ? { question: v.question, dismissed: v.dismissed }
    : undefined;
}
