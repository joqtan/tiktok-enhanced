/** A cleanup callback owned by one live userscript session. */
export type SessionDisposer = () => void;

export interface SessionScope {
  /** Register a resource cleanup callback, or run it immediately if disposed. */
  add(disposer: SessionDisposer): () => void;
  /** Dispose every registered resource exactly once. */
  dispose(): void;
  readonly disposed: boolean;
}

/**
 * Creates an isolated owner for resources belonging to one engine/widget session.
 * Registration and disposal are both safe to repeat.
 */
export function createSessionScope(): SessionScope {
  const disposers = new Set<SessionDisposer>();
  let disposed = false;

  function add(disposer: SessionDisposer): () => void {
    if (disposed) {
      disposer();
      return () => undefined;
    }

    if (disposers.has(disposer)) return () => undefined;
    disposers.add(disposer);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      disposers.delete(disposer);
    };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    const current = [...disposers];
    disposers.clear();
    for (const disposer of current) disposer();
  }

  return { add, dispose, get disposed() { return disposed; } };
}
