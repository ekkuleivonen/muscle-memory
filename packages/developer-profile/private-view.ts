/** Private-view read coordination. Boundaries discard data immediately; obsolete reads can
 * never publish either a snapshot or an error/loading state over a newer generation. */
export function privateView<T>() {
  let generation = 0,
    blocked = false;
  let state: { value: T | null; loading: boolean; error: boolean } = {
    value: null,
    loading: true,
    error: false,
  };
  const listeners = new Set<() => void>();
  const publish = (next: typeof state) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** An immediately available, already-authorized summary while a fuller read runs. */
    prime(value: T) {
      if (!blocked && state.value === null)
        publish({ value, loading: false, error: false });
    },
    invalidate(block = false) {
      generation++;
      if (block) blocked = true; // Only an explicit boundary finish may unblock reads.
      publish({ value: null, loading: false, error: false });
    },
    release() {
      blocked = false;
    },
    async read(load: () => Promise<T>) {
      if (blocked) return;
      const current = ++generation;
      publish({ ...state, loading: true, error: false });
      try {
        const value = await load();
        if (current === generation && !blocked)
          publish({ value, loading: false, error: false });
      } catch {
        if (current === generation && !blocked)
          publish({ ...state, loading: false, error: true });
      }
    },
  };
}
