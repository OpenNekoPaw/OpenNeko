import type {
  ViewportEvent,
  ViewportFrameMeta,
  ViewportOverlayDescriptor,
  ViewportSerializableRecord,
} from '@neko/shared';

export type ViewportPredictionKind =
  | 'selection'
  | 'marquee'
  | 'transform'
  | 'camera'
  | 'overlay'
  | 'custom'
  | (`custom:${string}` & {});

export type ViewportPredictionStatus =
  'active' | 'committed' | 'rolled-back' | 'timed-out' | 'invalidated';

export type ViewportPredictionTransitionReason =
  'ack' | 'error' | 'frame' | 'resync' | 'timeout' | 'revision' | 'topology' | 'manual';

export interface ViewportPredictionInput {
  readonly id?: string;
  readonly kind: ViewportPredictionKind;
  readonly seq: number;
  readonly correlationId?: string;
  readonly sceneId: string;
  readonly viewportId: string;
  readonly baseRevision: number;
  readonly topologyVersion?: number;
  readonly targetId?: string;
  readonly sessionId?: string;
  readonly payload?: ViewportSerializableRecord;
  readonly overlays?: readonly ViewportOverlayDescriptor[];
  readonly metadata?: ViewportSerializableRecord;
  readonly nowMs?: number;
  readonly timeoutMs?: number;
}

export interface ViewportPredictionUpdate {
  readonly payload?: ViewportSerializableRecord;
  readonly overlays?: readonly ViewportOverlayDescriptor[];
  readonly metadata?: ViewportSerializableRecord;
  readonly topologyVersion?: number;
}

export interface ViewportPredictionSnapshot extends Omit<
  ViewportPredictionInput,
  'id' | 'nowMs' | 'timeoutMs'
> {
  readonly id: string;
  readonly payload: ViewportSerializableRecord;
  readonly overlays: readonly ViewportOverlayDescriptor[];
  readonly metadata?: ViewportSerializableRecord;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly timeoutAtMs: number;
  readonly status: ViewportPredictionStatus;
  readonly transitionReason?: ViewportPredictionTransitionReason;
}

export interface ViewportPredictionTransition {
  readonly prediction: ViewportPredictionSnapshot;
  readonly previousStatus: ViewportPredictionStatus;
  readonly reason: ViewportPredictionTransitionReason;
}

export interface ViewportPredictionInvalidationFilter {
  readonly sceneId?: string;
  readonly viewportId?: string;
  readonly targetId?: string;
  readonly sessionId?: string;
  readonly topologyVersion?: number;
  readonly maxBaseRevisionExclusive?: number;
}

const DEFAULT_TIMEOUT_MS = 2_000;

export class ViewportPredictionLayer {
  private readonly predictions = new Map<string, ViewportPredictionSnapshot>();

  create(input: ViewportPredictionInput): ViewportPredictionSnapshot {
    const nowMs = input.nowMs ?? Date.now();
    const id = input.id ?? createViewportPredictionId(input);
    const prediction: ViewportPredictionSnapshot = {
      id,
      kind: input.kind,
      seq: input.seq,
      correlationId: input.correlationId,
      sceneId: input.sceneId,
      viewportId: input.viewportId,
      baseRevision: input.baseRevision,
      topologyVersion: input.topologyVersion,
      targetId: input.targetId,
      sessionId: input.sessionId,
      payload: input.payload ?? {},
      overlays: input.overlays ?? [],
      metadata: input.metadata,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      timeoutAtMs: nowMs + (input.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      status: 'active',
    };
    this.predictions.set(id, prediction);
    return prediction;
  }

  update(
    id: string,
    update: ViewportPredictionUpdate,
    nowMs = Date.now(),
  ): ViewportPredictionSnapshot | null {
    const prediction = this.predictions.get(id);
    if (!prediction || prediction.status !== 'active') return null;

    const next: ViewportPredictionSnapshot = {
      ...prediction,
      payload: update.payload ? { ...prediction.payload, ...update.payload } : prediction.payload,
      overlays: update.overlays ?? prediction.overlays,
      metadata: update.metadata
        ? { ...prediction.metadata, ...update.metadata }
        : prediction.metadata,
      topologyVersion: update.topologyVersion ?? prediction.topologyVersion,
      updatedAtMs: nowMs,
    };
    this.predictions.set(id, next);
    return next;
  }

  get(id: string): ViewportPredictionSnapshot | undefined {
    return this.predictions.get(id);
  }

  active(): readonly ViewportPredictionSnapshot[] {
    return this.all().filter((prediction) => prediction.status === 'active');
  }

  all(): readonly ViewportPredictionSnapshot[] {
    return Array.from(this.predictions.values());
  }

  commit(idOrSeq: string | number, nowMs = Date.now()): readonly ViewportPredictionTransition[] {
    return this.transition(
      (prediction) => prediction.id === idOrSeq || prediction.seq === idOrSeq,
      'committed',
      'manual',
      nowMs,
    );
  }

  commitThrough(
    appliedSeq: number,
    filter: Pick<ViewportPredictionInvalidationFilter, 'sceneId' | 'viewportId'> = {},
    nowMs = Date.now(),
    reason: ViewportPredictionTransitionReason = 'ack',
  ): readonly ViewportPredictionTransition[] {
    return this.transition(
      (prediction) =>
        prediction.seq <= appliedSeq &&
        matchesOptionalFilter(prediction.sceneId, filter.sceneId) &&
        matchesOptionalFilter(prediction.viewportId, filter.viewportId),
      'committed',
      reason,
      nowMs,
    );
  }

  rollback(
    idOrSeq: string | number,
    nowMs = Date.now(),
    reason: ViewportPredictionTransitionReason = 'manual',
  ): readonly ViewportPredictionTransition[] {
    return this.transition(
      (prediction) => prediction.id === idOrSeq || prediction.seq === idOrSeq,
      'rolled-back',
      reason,
      nowMs,
    );
  }

  timeout(nowMs = Date.now()): readonly ViewportPredictionTransition[] {
    return this.transition(
      (prediction) => prediction.timeoutAtMs <= nowMs,
      'timed-out',
      'timeout',
      nowMs,
    );
  }

  invalidate(
    filter: ViewportPredictionInvalidationFilter = {},
    nowMs = Date.now(),
    reason: ViewportPredictionTransitionReason = 'manual',
  ): readonly ViewportPredictionTransition[] {
    return this.transition(
      (prediction) => isPredictionInvalidatedByFilter(prediction, filter),
      'invalidated',
      reason,
      nowMs,
    );
  }

  reconcileEvent(
    event: ViewportEvent,
    nowMs = Date.now(),
  ): readonly ViewportPredictionTransition[] {
    if (event.status === 'error' || event.error) {
      return this.transition(
        (prediction) =>
          prediction.seq === event.ackSeq &&
          prediction.sceneId === event.sceneId &&
          matchesOptionalFilter(prediction.viewportId, event.viewportId),
        'rolled-back',
        'error',
        nowMs,
      );
    }

    if (event.status === 'resync') {
      return this.invalidate(
        {
          sceneId: event.sceneId,
          viewportId: event.viewportId,
        },
        nowMs,
        'resync',
      );
    }

    const topologyVersion = readTopologyVersion(event.payload);
    if (topologyVersion !== undefined) {
      const invalidated = this.invalidate(
        {
          sceneId: event.sceneId,
          viewportId: event.viewportId,
          topologyVersion,
        },
        nowMs,
        'topology',
      );
      if (invalidated.length > 0) return invalidated;
    }

    return this.commitThrough(
      event.appliedSeq ?? event.ackSeq,
      {
        sceneId: event.sceneId,
        viewportId: event.viewportId,
      },
      nowMs,
      'ack',
    );
  }

  reconcileFrameMeta(
    frameMeta: ViewportFrameMeta,
    nowMs = Date.now(),
  ): readonly ViewportPredictionTransition[] {
    const committed = this.commitThrough(
      frameMeta.appliedSeq,
      {
        sceneId: frameMeta.sceneId,
        viewportId: frameMeta.viewportId,
      },
      nowMs,
      'frame',
    );
    const invalidated = this.invalidate(
      {
        sceneId: frameMeta.sceneId,
        viewportId: frameMeta.viewportId,
        maxBaseRevisionExclusive: frameMeta.revision,
      },
      nowMs,
      'revision',
    );
    return committed.concat(invalidated);
  }

  clearFinalized(): void {
    for (const [id, prediction] of this.predictions) {
      if (prediction.status !== 'active') {
        this.predictions.delete(id);
      }
    }
  }

  private transition(
    predicate: (prediction: ViewportPredictionSnapshot) => boolean,
    status: Exclude<ViewportPredictionStatus, 'active'>,
    reason: ViewportPredictionTransitionReason,
    nowMs: number,
  ): readonly ViewportPredictionTransition[] {
    const changed: ViewportPredictionTransition[] = [];
    for (const [id, prediction] of this.predictions) {
      if (prediction.status !== 'active' || !predicate(prediction)) continue;
      const next: ViewportPredictionSnapshot = {
        ...prediction,
        status,
        transitionReason: reason,
        updatedAtMs: nowMs,
      };
      this.predictions.set(id, next);
      changed.push({
        prediction: next,
        previousStatus: prediction.status,
        reason,
      });
    }
    return changed;
  }
}

export function createViewportPredictionId(
  input: Pick<ViewportPredictionInput, 'sceneId' | 'viewportId' | 'kind' | 'seq'>,
): string {
  return `${input.sceneId}:${input.viewportId}:${input.kind}:${input.seq}`;
}

function isPredictionInvalidatedByFilter(
  prediction: ViewportPredictionSnapshot,
  filter: ViewportPredictionInvalidationFilter,
): boolean {
  if (!matchesOptionalFilter(prediction.sceneId, filter.sceneId)) return false;
  if (!matchesOptionalFilter(prediction.viewportId, filter.viewportId)) return false;
  if (!matchesOptionalFilter(prediction.targetId, filter.targetId)) return false;
  if (!matchesOptionalFilter(prediction.sessionId, filter.sessionId)) return false;

  if (
    filter.topologyVersion !== undefined &&
    prediction.topologyVersion !== undefined &&
    prediction.topologyVersion !== filter.topologyVersion
  ) {
    return true;
  }

  if (
    filter.maxBaseRevisionExclusive !== undefined &&
    prediction.baseRevision < filter.maxBaseRevisionExclusive
  ) {
    return true;
  }

  return (
    filter.topologyVersion === undefined &&
    filter.maxBaseRevisionExclusive === undefined &&
    (filter.sceneId !== undefined ||
      filter.viewportId !== undefined ||
      filter.targetId !== undefined ||
      filter.sessionId !== undefined)
  );
}

function matchesOptionalFilter<T>(actual: T | undefined, expected: T | undefined): boolean {
  return expected === undefined || actual === expected;
}

function readTopologyVersion(payload: ViewportSerializableRecord): number | undefined {
  const value = payload['topologyVersion'];
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}
