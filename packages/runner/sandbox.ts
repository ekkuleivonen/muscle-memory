/**
 * Isolation boundary for submitted code, shared by every language. Code runs in a dedicated worker created inside a
 * `sandbox="allow-scripts"` srcdoc iframe: an opaque origin with no access to the app's DOM,
 * cookies or storage. The frame's CSP denies every connection, so neither the frame nor its
 * blob worker (which inherits the policy) can reach the network. Runtime bytes arrive by
 * postMessage after the trusted parent has verified their hashes. Each language supplies its
 * own worker source (see workers/); this boundary does not change per language.
 */

/** Runs in the sandbox document. It only relays a bounded number of worker messages. */
export const BOOT_SCRIPT = String.raw`(() => {
  if (self.origin !== "null") throw new Error("Sandbox requires an opaque origin.");
  let worker = null;
  let relayed = 0;
  const send = (message) => parent.postMessage(message, "*");
  addEventListener("message", (event) => {
    if (event.source !== parent) return;
    const message = event.data;
    if (message && message.type === "init" && !worker) {
      try {
        const url = URL.createObjectURL(
          new Blob([message.workerSource], { type: "text/javascript" }),
        );
        // Classic: module workers from blob URLs do not load in an opaque origin.
        worker = new Worker(url);
      } catch (error) {
        send({ type: "boot-failed", message: "Worker unavailable: " + error });
        return;
      }
      worker.onmessage = (workerEvent) => {
        if (++relayed <= 64) send(workerEvent.data);
      };
      worker.onerror = (workerEvent) => {
        workerEvent.preventDefault();
        send({ type: "boot-failed", message: String(workerEvent.message) });
      };
      worker.postMessage(
        { type: "init", assets: message.assets, config: message.config },
        Object.values(message.assets),
      );
    } else if (message && message.type === "run" && worker) {
      worker.postMessage(message);
    }
  });
  send({ type: "frame-ready" });
})();`;

export const SANDBOX_CSP = (bootHash: string) =>
  [
    "default-src 'none'",
    `script-src '${bootHash}' blob: 'wasm-unsafe-eval'`,
    "worker-src blob:",
    "connect-src 'none'",
    "img-src 'none'",
    "style-src 'none'",
    "font-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");

/** The srcdoc for one sandbox. The inline boot script is allowed only by its exact hash. */
export async function sandboxDocument(): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(BOOT_SCRIPT),
  );
  const hash = "sha256-" + btoa(String.fromCharCode(...new Uint8Array(digest)));
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP(hash)}"></head><body><script>${BOOT_SCRIPT}</script></body></html>`;
}
