/** Public condition labels come from recorded known tooling, never arbitrary telemetry strings. */
const features = new Set([
  "syntax-highlighting",
  "tab-indents",
  "undo-redo-history",
  "bracket-match-highlight",
  "line-numbers",
  "mod-enter-submits",
  "mod-enter-runs-examples",
  "vim-keybindings",
  "standard-keybindings",
  "type-diagnostics",
  "hover-types",
  "keyboard-type-info",
  "keyboard-diagnostics",
]);
export function knownEditor(
  value: unknown,
): { name: string; features: string[] } | null {
  if (!value || typeof value !== "object") return null;
  const e = value as { name: unknown; features: unknown };
  if (
    !["codemirror-6", "CodeMirror"].includes(e.name as string) ||
    !Array.isArray(e.features) ||
    e.features.length > 64 ||
    !e.features.every(
      (v) =>
        typeof v === "string" &&
        (features.has(v) ||
          /^(javascript|typescript|python|sql|html|php|ruby|go|c|cpp|csharp|java)-(syntax-highlighting|auto-indent)$/.test(
            v,
          )),
    ) ||
    new Set(e.features).size !== e.features.length
  )
    return null;
  return { name: e.name as string, features: [...e.features].sort() };
}
export function runtimeKey(value: unknown): string | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Object.keys(value).length ||
    Object.keys(value).length > 32 ||
    !Object.values(value).every((v) => typeof v === "string" && v.length <= 128)
  )
    return null;
  return JSON.stringify(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
  );
}
