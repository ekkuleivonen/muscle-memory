/** A report read must settle even when an underlying API ignores cancellation. */
export async function reportRead<T>(
  load: (signal: AbortSignal) => Promise<T>,
  parent?: AbortSignal,
  ms = 12000,
): Promise<T> {
  const control = new AbortController();
  const cancel = () => control.abort();
  if (parent?.aborted) control.abort();
  parent?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, ms);
  let stop!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    stop = () => reject(new Error("Report read unavailable."));
    if (control.signal.aborted) stop();
    else control.signal.addEventListener("abort", stop, { once: true });
  });
  try {
    if (control.signal.aborted) return await cancelled;
    return await Promise.race([load(control.signal), cancelled]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", cancel);
    control.signal.removeEventListener("abort", stop);
  }
}

/** Match the server's two-read limit; retry transient capacity only once, after this batch. */
export async function reportReceipts<T>(
  items: readonly T[],
  load: (item: T) => Promise<boolean>,
  signal: AbortSignal,
) {
  let at = 0;
  const retry: T[] = [];
  const worker = async () => {
    while (!signal.aborted) {
      const index = at++;
      if (index >= items.length) return;
      if (!(await load(items[index])) && !signal.aborted)
        retry.push(items[index]);
    }
  };
  await Promise.all([worker(), worker()]);
  // One sequential retry after other keys finish. No timer/polling or repeat loop.
  for (const item of retry) {
    if (signal.aborted) return;
    await load(item);
  }
}
