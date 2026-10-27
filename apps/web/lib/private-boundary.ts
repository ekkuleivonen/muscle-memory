/** Local UI invalidation only; no observation, upload, credential or persistent history. */
export const PRIVATE_BOUNDARY = "muscle-memory:private-boundary";
export type BoundaryPhase = "start" | "finish";
const CHANNEL = "muscle-memory-private-view";
export function notifyPrivateBoundary(phase: BoundaryPhase) {
  window.dispatchEvent(new CustomEvent(PRIVATE_BOUNDARY, { detail: phase }));
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(CHANNEL);
      channel.postMessage(phase);
      channel.close();
    }
  } catch {
    /* Same-tab invalidation still applies when cross-tab messaging is blocked. */
  }
}
export function listenPrivateBoundary(
  listener: (phase: BoundaryPhase) => void,
) {
  const receive = (event: Event) =>
    listener((event as CustomEvent<BoundaryPhase>).detail);
  window.addEventListener(PRIVATE_BOUNDARY, receive);
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined")
      channel = new BroadcastChannel(CHANNEL);
  } catch {
    /* Storage events still invalidate completed cross-tab changes. */
  }
  if (channel)
    channel.onmessage = (event) => {
      if (event.data === "start" || event.data === "finish")
        listener(event.data);
    };
  return () => {
    window.removeEventListener(PRIVATE_BOUNDARY, receive);
    channel?.close();
  };
}
