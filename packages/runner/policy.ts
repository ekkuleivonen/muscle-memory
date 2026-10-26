/** The player and trusted publication validator must enforce the same run policy. */
export const RUN_TIMEOUT_MS = 5000;
export function effectiveRunTimeout(engine: { readonly timeoutMs?: number }) {
  return Math.max(RUN_TIMEOUT_MS, engine.timeoutMs ?? 0);
}
