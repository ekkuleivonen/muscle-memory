/** JSON values and their canonical text: sorted keys, no whitespace, finite numbers only. */
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export function canonical(value: Json): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return (
      "{" +
      Object.keys(value)
        // Like JSON.stringify, an undefined property is absent rather than invalid JSON.
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + canonical(value[key]))
        .join(",") +
      "}"
    );
  }
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("Numbers must be finite.");
  if (value === undefined) throw new Error("Values must be JSON.");
  return JSON.stringify(value);
}
