/** Server-selected, at most 90 UTC days. Callers cannot choose a demographic/date slice. */
export interface CohortWindow {
  from: string;
  to: string;
  publication: string;
}
const DAY = 86_400_000;
export const MAX_COHORT_DAYS = 90;
function instant(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error("Invalid cohort boundary.");
  return value;
}
export function checkCohortWindow(value: CohortWindow): CohortWindow {
  const from = instant(value.from),
    to = instant(value.to),
    publication = instant(value.publication);
  if (
    Date.parse(from) >= Date.parse(to) ||
    Date.parse(to) - Date.parse(from) > MAX_COHORT_DAYS * DAY ||
    Date.parse(from) < Date.parse(publication)
  )
    throw new Error("Invalid cohort window.");
  return { from, to, publication };
}
export function cohortWindow(
  publishedAt: string,
  now = new Date(),
): CohortWindow {
  const publication = instant(publishedAt),
    to = now.toISOString();
  const from = new Date(
    Math.max(Date.parse(publication), now.getTime() - MAX_COHORT_DAYS * DAY),
  ).toISOString();
  return checkCohortWindow({ from, to, publication });
}
