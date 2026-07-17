import { describe, expect, it } from 'vitest';
import type { ViewportEvent, ViewportFrameMeta } from '@neko/shared';
import { ViewportPredictionLayer } from './prediction-layer';

describe('ViewportPredictionLayer', () => {
  it('manages create, update, commit, rollback, timeout, and topology invalidation', () => {
    const layer = new ViewportPredictionLayer();
    const transform = layer.create({
      kind: 'transform',
      seq: 10,
      correlationId: 'cmd-10',
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 2,
      targetId: 'node-1',
      payload: { x: 1 },
      nowMs: 100,
      timeoutMs: 50,
    });

    expect(transform.status).toBe('active');
    expect(layer.update(transform.id, { payload: { y: 2 } }, 120)?.payload).toEqual({
      x: 1,
      y: 2,
    });

    expect(layer.commit(transform.id, 130)[0]?.prediction.status).toBe('committed');
    expect(layer.active()).toHaveLength(0);

    const morph = layer.create({
      kind: 'custom:morph',
      seq: 11,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 3,
      topologyVersion: 7,
      payload: { morphId: 'Smile', weight: 0.5 },
      nowMs: 200,
    });
    expect(layer.rollback(morph.seq, 210)[0]?.reason).toBe('manual');
    expect(layer.active()).toHaveLength(0);

    layer.create({
      kind: 'custom:brush',
      seq: 12,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 3,
      sessionId: 'sculpt-1',
      topologyVersion: 7,
      payload: { strokeId: 'stroke-1' },
      nowMs: 300,
      timeoutMs: 10,
    });
    expect(layer.timeout(320)[0]?.prediction.status).toBe('timed-out');
    expect(layer.active()).toHaveLength(0);

    layer.create({
      kind: 'custom:topology',
      seq: 13,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 4,
      topologyVersion: 7,
    });
    expect(layer.invalidate({ topologyVersion: 8 }, 400, 'topology')[0]?.reason).toBe('topology');
    expect(layer.active()).toHaveLength(0);
  });

  it('reconciles predictions through ack, error, resync events, and frame metadata', () => {
    const layer = new ViewportPredictionLayer();
    layer.create({
      kind: 'selection',
      seq: 41,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 5,
    });
    layer.create({
      kind: 'transform',
      seq: 42,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 5,
    });
    layer.create({
      kind: 'camera',
      seq: 43,
      sceneId: 'scene-a',
      viewportId: 'side',
      baseRevision: 5,
    });

    const ack = event({ ackSeq: 42, appliedSeq: 42, status: 'ack' });
    expect(layer.reconcileEvent(ack, 500).map((item) => item.prediction.seq)).toEqual([41, 42]);
    expect(layer.active().map((item) => item.seq)).toEqual([43]);

    const sideFrame = frame({ viewportId: 'side', appliedSeq: 43, revision: 5 });
    expect(layer.reconcileFrameMeta(sideFrame, 520)[0]?.reason).toBe('frame');
    expect(layer.active()).toHaveLength(0);

    layer.create({
      kind: 'transform',
      seq: 44,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 6,
    });
    expect(
      layer.reconcileEvent(
        event({
          ackSeq: 44,
          status: 'error',
          error: { code: 'revisionConflict', message: 'stale revision' },
        }),
        600,
      )[0]?.prediction.status,
    ).toBe('rolled-back');

    layer.create({
      kind: 'custom:ik',
      seq: 45,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 6,
    });
    expect(layer.reconcileEvent(event({ ackSeq: 0, status: 'resync' }), 700)[0]?.reason).toBe(
      'resync',
    );
  });

  it('invalidates active predictions when an authoritative frame supersedes their base revision', () => {
    const layer = new ViewportPredictionLayer();
    layer.create({
      kind: 'overlay',
      seq: 20,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 9,
    });

    expect(layer.reconcileFrameMeta(frame({ revision: 10, appliedSeq: 0 }), 900)[0]?.reason).toBe(
      'revision',
    );
  });

  it('keeps ack-before-frame predictions active until compatible metadata arrives', () => {
    const layer = new ViewportPredictionLayer();
    layer.create({
      kind: 'transform',
      seq: 50,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 7,
      nowMs: 1_000,
    });

    expect(
      layer.reconcileFrameMeta(
        frame({
          revision: 7,
          appliedSeq: 49,
          diagnostics: {
            metadataState: 'ack-before-frame',
          },
        }),
        1_020,
      ),
    ).toEqual([]);
    expect(layer.active().map((prediction) => prediction.seq)).toEqual([50]);

    expect(layer.reconcileFrameMeta(frame({ revision: 8, appliedSeq: 50 }), 1_040)[0]?.reason).toBe(
      'frame',
    );
    expect(layer.active()).toHaveLength(0);
  });

  it('does not commit predictions from delayed metadata until applied sequence is compatible', () => {
    const layer = new ViewportPredictionLayer();
    layer.create({
      kind: 'custom:blendshape',
      seq: 60,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 8,
      nowMs: 2_000,
    });

    expect(
      layer.reconcileFrameMeta(
        frame({
          revision: 8,
          appliedSeq: 59,
          diagnostics: {
            metadataState: 'delayed',
            metadataDelayMs: 150,
          },
        }),
        2_050,
      ),
    ).toEqual([]);
    expect(layer.active()).toHaveLength(1);
  });

  it('covers timeout, error rollback, and revision invalidation states independently', () => {
    const layer = new ViewportPredictionLayer();
    layer.create({
      kind: 'custom:bone',
      seq: 70,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 10,
      nowMs: 3_000,
      timeoutMs: 20,
    });
    expect(layer.timeout(3_030)[0]?.prediction.status).toBe('timed-out');

    layer.create({
      kind: 'custom:bone',
      seq: 71,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 10,
    });
    expect(
      layer.reconcileEvent(
        event({
          ackSeq: 71,
          status: 'error',
          error: { code: 'staleRevision', message: 'stale revision' },
        }),
      )[0]?.prediction.status,
    ).toBe('rolled-back');

    layer.create({
      kind: 'custom:bone',
      seq: 72,
      sceneId: 'scene-a',
      viewportId: 'main',
      baseRevision: 10,
    });
    expect(
      layer.reconcileFrameMeta(frame({ revision: 11, appliedSeq: 0 }))[0]?.prediction.status,
    ).toBe('invalidated');
  });
});

function event(patch: Partial<ViewportEvent>): ViewportEvent {
  return {
    protocolVersion: 1,
    domain: 'viewport',
    event: 'viewport:ack',
    sceneId: 'scene-a',
    viewportId: 'main',
    ackSeq: 0,
    revision: 5,
    timestamp: 100,
    status: 'ack',
    payload: {},
    ...patch,
  };
}

function frame(patch: Partial<ViewportFrameMeta>): ViewportFrameMeta {
  return {
    protocolVersion: 1,
    streamId: 'stream-main',
    sceneId: 'scene-a',
    viewportId: 'main',
    frameId: 1,
    ptsUs: 0,
    durationUs: 16666,
    frameTimestamp: 100,
    revision: 5,
    appliedSeq: 0,
    viewTransform: [1, 0, 0, 1, 0, 0],
    ...patch,
  };
}
