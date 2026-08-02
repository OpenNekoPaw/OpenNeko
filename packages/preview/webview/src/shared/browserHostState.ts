/** Browser-local state and message transport for embeddable preview viewers. */
export interface BrowserHostState {
  postMessage(message: unknown): void;
  getState(): Record<string, unknown> | null;
  setState(state: unknown): void;
}

let browserState: Record<string, unknown> | null = null;

export function getBrowserHostState(): BrowserHostState {
  return {
    postMessage(message: unknown): void {
      window.parent.postMessage(message, '*');
    },
    getState(): Record<string, unknown> | null {
      return browserState;
    },
    setState(state: unknown): void {
      if (typeof state !== 'object' || state === null || Array.isArray(state)) {
        throw new Error('Preview browser host state must be a record.');
      }
      browserState = state as Record<string, unknown>;
    },
  };
}
