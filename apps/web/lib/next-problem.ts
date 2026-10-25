/**
 * What to work on after merging: the next problem in the language just used, so finishing a
 * Python issue never lands on a JavaScript one because it happens to come first in the catalog.
 * Pure, so the pull request page and the IDE suggest the same issue.
 */
import type { BoardItem } from "./board";
import type { IssueSummary } from "./library";

type Candidate = Pick<
  IssueSummary,
  "key" | "language" | "project" | "difficulty" | "runnable"
>;

const LEVELS = ["warm-up", "easy", "medium", "hard"];

/**
 * Issues worth doing next after `current`, best first. Leaves out `current`, whatever is Done
 * and whatever is already In progress (the dashboard resumes those). In order of weight: it
 * runs here; the same language, in the same project before another; then a language from the
 * person's profile; then the same difficulty, one step harder, one step easier; then catalog
 * order.
 */
export function nextProblems<T extends Candidate>(
  current: Candidate,
  candidates: readonly T[],
  items: readonly BoardItem[],
  languages: readonly string[] = [],
  count = 1,
): T[] {
  const status = new Map(items.map((item) => [item.key, item.status]));
  const level = (issue: Candidate) => {
    const index = LEVELS.indexOf(issue.difficulty);
    return index === -1 ? LEVELS.length : index;
  };
  const closeness = (issue: Candidate) => {
    const step = level(issue) - level(current);
    return step >= 0 ? step : 1 - 2 * step;
  };
  const relevance = (issue: Candidate) =>
    issue.language && issue.language === current.language
      ? issue.project.slug === current.project.slug
        ? 0
        : 1
      : issue.language && languages.includes(issue.language)
        ? 2
        : 3;
  return candidates
    .map((issue, index) => ({ issue, index }))
    .filter(
      ({ issue }) =>
        issue.key !== current.key &&
        status.get(issue.key) !== "done" &&
        status.get(issue.key) !== "in-progress",
    )
    .map((entry) => ({
      ...entry,
      rank: [
        entry.issue.runnable ? 0 : 1,
        relevance(entry.issue),
        closeness(entry.issue),
        entry.index,
      ],
    }))
    .sort((a, b) => {
      for (let i = 0; i < a.rank.length; i++)
        if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i];
      return 0;
    })
    .slice(0, count)
    .map(({ issue }) => issue);
}

/** The single best next problem, or null when nothing is left. */
export function nextProblem<T extends Candidate>(
  current: Candidate,
  candidates: readonly T[],
  items: readonly BoardItem[],
  languages: readonly string[] = [],
): T | null {
  return nextProblems(current, candidates, items, languages, 1)[0] ?? null;
}
