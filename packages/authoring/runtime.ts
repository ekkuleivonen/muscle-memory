import { engineFor } from "../runner/engines";
import { BOOT_SCRIPT } from "../runner/sandbox";
import { canonical, type Json } from "../domain/json";
import type { RuntimePin } from "./contracts";
import { effectiveRunTimeout } from "../runner/policy";
export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value as Json));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return (
    "sha256:" +
    [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}
/** Same deterministic fingerprint in trusted server and operator browser; not an event schema. */
export async function runtimePin(language: string): Promise<RuntimePin> {
  const engine = engineFor(language);
  if (!engine) throw new Error("This language has no supported runtime.");
  const fingerprint = await digest({
    runtime: engine.runtime,
    files: engine.files,
    sizes: engine.sizes,
    config: engine.config,
    worker: engine.worker,
    bootstrap: BOOT_SCRIPT,
    timeout: effectiveRunTimeout(engine),
    allowEval: engine.allowEval ?? false,
  });
  return { engine: engine.id, version: engine.runtime.version, fingerprint };
}
