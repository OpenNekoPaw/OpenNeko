export type TerminalMarkdownPathEvent =
  | { readonly type: 'session-created'; readonly key: string }
  | { readonly type: 'source-updated'; readonly key: string; readonly sourceLength: number }
  | { readonly type: 'document-projected'; readonly key: string; readonly revision: number }
  | {
      readonly type: 'layout-created';
      readonly key: string;
      readonly revision: number;
      readonly viewportWidth: number;
    }
  | { readonly type: 'session-finalized'; readonly key: string; readonly revision: number }
  | {
      readonly type: 'source-update-coalesced';
      readonly key: string;
      readonly sourceLength: number;
    }
  | { readonly type: 'layout-discarded'; readonly key: string; readonly generation: number }
  | {
      readonly type: 'highlight-requested';
      readonly key: string;
      readonly revision: number;
      readonly generation: number;
    }
  | {
      readonly type: 'highlight-applied';
      readonly key: string;
      readonly revision: number;
      readonly generation: number;
    }
  | {
      readonly type: 'highlight-discarded';
      readonly key: string;
      readonly revision: number;
      readonly generation: number;
    };

export type TerminalMarkdownPathListener = (event: TerminalMarkdownPathEvent) => void;
const listeners = new Set<TerminalMarkdownPathListener>();

export function subscribeTerminalMarkdownPathEvents(
  listener: TerminalMarkdownPathListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitTerminalMarkdownPathEvent(event: TerminalMarkdownPathEvent): void {
  for (const listener of listeners) listener(event);
}
