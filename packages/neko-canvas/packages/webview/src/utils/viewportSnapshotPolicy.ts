import type { CanvasViewport } from '@neko/shared';

export type ViewportSnapshotWriteReason = 'idle' | 'blur' | 'save' | 'close';

export interface ViewportSnapshotWriter {
  writeSnapshot: (viewport: CanvasViewport, reason: ViewportSnapshotWriteReason) => void;
}

export interface ViewportSnapshotPolicy {
  schedule: (viewport: CanvasViewport) => void;
  flush: (reason: Exclude<ViewportSnapshotWriteReason, 'idle'>) => void;
  cancel: () => void;
}

export interface ViewportSnapshotPolicyOptions {
  writer: ViewportSnapshotWriter;
  idleDelayMs?: number;
  setTimeoutFn?: typeof globalThis.setTimeout;
  clearTimeoutFn?: typeof globalThis.clearTimeout;
}

const DEFAULT_IDLE_DELAY_MS = 500;

export function createViewportSnapshotPolicy({
  writer,
  idleDelayMs = DEFAULT_IDLE_DELAY_MS,
  setTimeoutFn = globalThis.setTimeout.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout.bind(globalThis),
}: ViewportSnapshotPolicyOptions): ViewportSnapshotPolicy {
  let pendingViewport: CanvasViewport | null = null;
  let lastWrittenFingerprint: string | null = null;
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;

  const writePending = (reason: ViewportSnapshotWriteReason): void => {
    if (!pendingViewport) return;
    const fingerprint = createViewportSnapshotFingerprint(pendingViewport);
    if (fingerprint !== lastWrittenFingerprint) {
      writer.writeSnapshot(pendingViewport, reason);
      lastWrittenFingerprint = fingerprint;
    }
    pendingViewport = null;
  };

  const clearTimer = (): void => {
    if (!timer) return;
    clearTimeoutFn(timer);
    timer = null;
  };

  return {
    schedule: (viewport) => {
      pendingViewport = viewport;
      clearTimer();
      timer = setTimeoutFn(() => {
        timer = null;
        writePending('idle');
      }, idleDelayMs);
    },
    flush: (reason) => {
      clearTimer();
      writePending(reason);
    },
    cancel: () => {
      clearTimer();
      pendingViewport = null;
    },
  };
}

function createViewportSnapshotFingerprint(viewport: CanvasViewport): string {
  return JSON.stringify(viewport);
}
