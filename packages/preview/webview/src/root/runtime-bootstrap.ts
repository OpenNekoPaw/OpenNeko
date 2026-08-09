import type { PreviewHostRuntime, PreviewProjection } from '@neko/preview-domain';

export interface PreviewRuntimeBootstrap {
  readonly runtime: PreviewHostRuntime;
  prepare(): void;
  getSnapshot(): Promise<PreviewProjection>;
  dispose(): void;
}

export function createPreviewRuntimeBootstrap(
  runtime: PreviewHostRuntime,
): PreviewRuntimeBootstrap {
  let snapshotRequest: Promise<PreviewProjection> | undefined;
  let disposed = false;

  const getSnapshot = (): Promise<PreviewProjection> => {
    if (disposed) throw new Error('Preview runtime bootstrap is disposed.');
    snapshotRequest ??= runtime.getSnapshot();
    return snapshotRequest;
  };

  return {
    runtime,
    prepare() {
      void getSnapshot().catch(() => undefined);
    },
    getSnapshot,
    dispose() {
      disposed = true;
    },
  };
}
