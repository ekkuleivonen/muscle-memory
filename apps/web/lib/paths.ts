/**
 * Where a challenge is practised: /challenges/PY-003, under the picker at /challenges. One place
 * for the path, since some code needs to tell practice apart from every other page.
 */
export const practiceHref = (key: string) => `/challenges/${key}`;

/** Whether `path` is a challenge's practice page, not the picker or anything else. */
export const isPracticePath = (path: string) =>
  /^\/challenges\/[^/]+$/.test(path);
