export interface PreviewMediaViewerSnapshot {
  readonly currentTime: number;
  readonly playbackRate: number;
  readonly volume: number;
}

export interface PreviewImageViewerSnapshot {
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
}

export interface PreviewViewerSnapshot {
  readonly media?: PreviewMediaViewerSnapshot;
  readonly image?: PreviewImageViewerSnapshot;
  readonly modelState?: unknown;
  readonly documentState?: Readonly<Record<string, unknown>>;
}

export interface PreviewViewerSnapshotStore {
  read(descriptorId: string): PreviewViewerSnapshot | undefined;
  update(descriptorId: string, update: Partial<PreviewViewerSnapshot>): void;
  delete(descriptorId: string): void;
  clear(): void;
}

export function createPreviewViewerSnapshotStore(): PreviewViewerSnapshotStore {
  const snapshots = new Map<string, PreviewViewerSnapshot>();
  return {
    read(descriptorId) {
      return snapshots.get(requireIdentity(descriptorId));
    },
    update(descriptorId, update) {
      const identity = requireIdentity(descriptorId);
      snapshots.set(identity, Object.freeze({ ...snapshots.get(identity), ...update }));
    },
    delete(descriptorId) {
      snapshots.delete(requireIdentity(descriptorId));
    },
    clear() {
      snapshots.clear();
    },
  };
}

function requireIdentity(value: string): string {
  if (value.trim().length === 0) throw new Error('Preview descriptor identity is required.');
  return value;
}
