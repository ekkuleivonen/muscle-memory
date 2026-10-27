import type { AfterQuestion } from "../../../packages/domain/practice";
import type { Progress } from "./progress";
export interface ReflectionState {
  question: AfterQuestion;
  dismissed: boolean;
}
const questions: AfterQuestion[] = ["difficulty", "confidence", "would-use-ai"];
/** A single stable rotation across solves, saved with the latest local challenge progress. */
export function reflectionFor(progress: Progress): ReflectionState {
  const solves = Object.values(progress).reduce((n, p) => n + p.completions, 0);
  return {
    question: questions[Math.max(0, solves - 1) % questions.length],
    dismissed: false,
  };
}
export function parseReflection(value: unknown): ReflectionState | undefined {
  const v = value as ReflectionState | undefined;
  return v && questions.includes(v.question) && typeof v.dismissed === "boolean"
    ? { question: v.question, dismissed: v.dismissed }
    : undefined;
}
