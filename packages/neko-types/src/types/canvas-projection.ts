import type { CanvasData, CanvasSerializableRecord, CanvasSerializableValue } from './canvas';

export type CanvasProjectionKind = 'entity' | 'memory';

export interface ProjectedCanvasSource {
  readonly kind: CanvasProjectionKind;
  readonly uri: string;
  readonly version?: string;
  readonly metadata?: CanvasSerializableRecord;
}

export interface ProjectedCanvasData extends CanvasData {
  projected: true;
  projectionSource: ProjectedCanvasSource;
  projectionStatus?: ProjectedCanvasStatus;
}

export type ProjectedCanvasSyncState =
  | 'clean'
  | 'regenerating'
  | 'source-changed'
  | 'writeback-error';

export interface ProjectedCanvasStatus {
  readonly state: ProjectedCanvasSyncState;
  readonly message?: string;
  readonly sourceOwnedPaths?: readonly string[];
  readonly cacheUri?: string;
  readonly updatedAt?: number;
}

export type ProjectionWriteBackOperation =
  | 'bind'
  | 'unbind'
  | 'update-alias'
  | 'update-weight'
  | 'update-field';

export interface ProjectionWriteBack {
  readonly operation: ProjectionWriteBackOperation;
  readonly targetPath: string;
  readonly value?: CanvasSerializableValue;
  readonly metadata?: CanvasSerializableRecord;
}

export interface ProjectionWriteBackResult {
  readonly ok: boolean;
  readonly warnings?: readonly string[];
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

export interface ProjectionSourceChangeEvent {
  readonly sourceUri: string;
  readonly reason: 'created' | 'changed' | 'deleted';
}

export interface ProjectionDisposable {
  dispose(): void;
}

export interface ProjectionAdapter {
  readonly kind: CanvasProjectionKind;
  readonly sourceUri: string;
  project(): Promise<ProjectedCanvasData>;
  writeBack(changes: readonly ProjectionWriteBack[]): Promise<ProjectionWriteBackResult>;
  onSourceChanged(listener: (event: ProjectionSourceChangeEvent) => void): ProjectionDisposable;
}

export interface ProjectionAdapterRegistry {
  register(adapter: ProjectionAdapter): ProjectionDisposable;
  get(kind: CanvasProjectionKind, sourceUri: string): ProjectionAdapter | undefined;
  list(kind?: CanvasProjectionKind): readonly ProjectionAdapter[];
}

export function createProjectionAdapterRegistry(): ProjectionAdapterRegistry {
  const adapters = new Map<string, ProjectionAdapter>();

  return {
    register(adapter) {
      const key = createProjectionAdapterKey(adapter.kind, adapter.sourceUri);
      adapters.set(key, adapter);
      return {
        dispose: () => {
          if (adapters.get(key) === adapter) {
            adapters.delete(key);
          }
        },
      };
    },
    get(kind, sourceUri) {
      return adapters.get(createProjectionAdapterKey(kind, sourceUri));
    },
    list(kind) {
      const values = Array.from(adapters.values());
      return kind ? values.filter((adapter) => adapter.kind === kind) : values;
    },
  };
}

export function createProjectionAdapterKey(kind: CanvasProjectionKind, sourceUri: string): string {
  return `${kind}:${sourceUri}`;
}

export function isProjectedCanvasData(data: CanvasData): data is ProjectedCanvasData {
  return (
    data.projected === true &&
    isProjectedCanvasSource((data as { projectionSource?: unknown }).projectionSource)
  );
}

export function isProjectedCanvasSource(value: unknown): value is ProjectedCanvasSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    isCanvasProjectionKind(candidate['kind']) &&
    typeof candidate['uri'] === 'string' &&
    (candidate['version'] === undefined || typeof candidate['version'] === 'string')
  );
}

export function isCanvasProjectionKind(value: unknown): value is CanvasProjectionKind {
  return value === 'entity' || value === 'memory';
}
