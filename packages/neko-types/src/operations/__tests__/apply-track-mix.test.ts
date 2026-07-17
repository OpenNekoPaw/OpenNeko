// =============================================================================
// Track Mix Operations 测试
// =============================================================================

import { describe, expect, it } from 'vitest';
import { applyOperation, invertOperation } from '../index';
import type { AudioProjectData, TrackMixOperation } from '../index';
import type { AudioAutomationLane } from '../../types/audioAutomation';
import type { AudioEffectConfig } from '../../types/audioMix';
import { createMeta, createTestTrack } from './test-helpers';

function createAudioProject(overrides: Partial<AudioProjectData> = {}): AudioProjectData {
  return {
    version: '2.1',
    name: 'Test Audio Project',
    sampleRate: 48000,
    channels: 2,
    tracks: [createTestTrack({ id: 'track-1', type: 'audio' })],
    masterEffectsChain: [],
    markers: [],
    ...overrides,
  };
}

function createEffect(overrides: Partial<AudioEffectConfig> = {}): AudioEffectConfig {
  return {
    id: 'fx-1',
    effectType: 'gain',
    enabled: true,
    params: { gainDb: 3 },
    ...overrides,
  };
}

describe('applyTrackMixOperation', () => {
  it('applies volume and invert restores previous state', () => {
    const project = createAudioProject({
      trackMix: {
        'track-1': { volume: 0.8, pan: 0, solo: false, effectChain: [] },
      },
    });
    const op: TrackMixOperation = {
      type: 'track.mix.setVolume',
      meta: createMeta(),
      payload: { trackId: 'track-1', volume: 0.35 },
      before: { volume: 0.8 },
    };

    const updated = applyOperation(project, op) as AudioProjectData;
    expect(updated.trackMix?.['track-1']?.volume).toBe(0.35);

    const restored = applyOperation(
      updated,
      invertOperation(op) as TrackMixOperation,
    ) as AudioProjectData;
    expect(restored.trackMix?.['track-1']?.volume).toBe(0.8);
  });

  it('applies pan and solo operations', () => {
    const project = createAudioProject();

    const panned = applyOperation(project, {
      type: 'track.mix.setPan',
      meta: createMeta(),
      payload: { trackId: 'track-1', pan: -0.25 },
      before: { pan: 0 },
    }) as AudioProjectData;
    const soloed = applyOperation(panned, {
      type: 'track.mix.setSolo',
      meta: createMeta(),
      payload: { trackId: 'track-1', solo: true },
      before: { solo: false },
    }) as AudioProjectData;

    expect(soloed.trackMix?.['track-1']).toMatchObject({ pan: -0.25, solo: true });
  });

  it('throws for invalid track IDs', () => {
    const project = createAudioProject();

    expect(() =>
      applyOperation(project, {
        type: 'track.mix.setVolume',
        meta: createMeta(),
        payload: { trackId: 'missing', volume: 1.2 },
        before: { volume: 1 },
      }),
    ).toThrow('Track not found: missing');
  });

  it('rejects track mix volume and pan outside renderable ranges', () => {
    const project = createAudioProject();

    expect(() =>
      applyOperation(project, {
        type: 'track.mix.setVolume',
        meta: createMeta(),
        payload: { trackId: 'track-1', volume: 2.1 },
        before: { volume: 1 },
      }),
    ).toThrow('track mix volume out of range');

    expect(() =>
      applyOperation(project, {
        type: 'track.mix.setPan',
        meta: createMeta(),
        payload: { trackId: 'track-1', pan: -1.1 },
        before: { pan: 0 },
      }),
    ).toThrow('track mix pan out of range');
  });

  it('adds, updates, moves, removes effects, and undo restores the chain', () => {
    const fx1 = createEffect({ id: 'fx-1', effectType: 'gain' });
    const fx2 = createEffect({ id: 'fx-2', effectType: 'compressor', params: { threshold: -18 } });
    const project = createAudioProject({
      trackMix: {
        'track-1': { volume: 1, pan: 0, solo: false, effectChain: [fx1] },
      },
    });

    const addOp: TrackMixOperation = {
      type: 'track.mix.effect.add',
      meta: createMeta(),
      payload: { trackId: 'track-1', effect: fx2, index: 1 },
    };
    const updateOp: TrackMixOperation = {
      type: 'track.mix.effect.update',
      meta: createMeta(),
      payload: { trackId: 'track-1', effectId: 'fx-2', updates: { enabled: false } },
      before: { updates: { enabled: true } },
    };
    const moveOp: TrackMixOperation = {
      type: 'track.mix.effect.move',
      meta: createMeta(),
      payload: { trackId: 'track-1', effectId: 'fx-2', fromIndex: 1, toIndex: 0 },
    };
    const removeOp: TrackMixOperation = {
      type: 'track.mix.effect.remove',
      meta: createMeta(),
      payload: { trackId: 'track-1', effectId: 'fx-2' },
      before: { effect: { ...fx2, enabled: false }, index: 0 },
    };

    const added = applyOperation(project, addOp) as AudioProjectData;
    const updated = applyOperation(added, updateOp) as AudioProjectData;
    const moved = applyOperation(updated, moveOp) as AudioProjectData;
    const removed = applyOperation(moved, removeOp) as AudioProjectData;

    expect(removed.trackMix?.['track-1']?.effectChain.map((effect) => effect.id)).toEqual(['fx-1']);

    const restoredRemove = applyOperation(
      removed,
      invertOperation(removeOp) as TrackMixOperation,
    ) as AudioProjectData;
    expect(restoredRemove.trackMix?.['track-1']?.effectChain.map((effect) => effect.id)).toEqual([
      'fx-2',
      'fx-1',
    ]);
  });

  it('roundtrips effect update through inverse operation', () => {
    const project = createAudioProject({
      trackMix: {
        'track-1': {
          volume: 1,
          pan: 0,
          solo: false,
          effectChain: [createEffect({ id: 'fx-1', enabled: true })],
        },
      },
    });
    const op: TrackMixOperation = {
      type: 'track.mix.effect.update',
      meta: createMeta(),
      payload: { trackId: 'track-1', effectId: 'fx-1', updates: { enabled: false } },
      before: { updates: { enabled: true } },
    };

    const updated = applyOperation(project, op) as AudioProjectData;
    const restored = applyOperation(
      updated,
      invertOperation(op) as TrackMixOperation,
    ) as AudioProjectData;

    expect(restored.trackMix?.['track-1']?.effectChain[0]?.enabled).toBe(true);
  });

  it('roundtrips append effect add without moving the effect on redo', () => {
    const fx1 = createEffect({ id: 'fx-1', effectType: 'gain' });
    const fx2 = createEffect({ id: 'fx-2', effectType: 'compressor' });
    const fx3 = createEffect({ id: 'fx-3', effectType: 'limiter' });
    const project = createAudioProject({
      trackMix: {
        'track-1': { volume: 1, pan: 0, solo: false, effectChain: [fx1, fx2] },
      },
    });
    const op: TrackMixOperation = {
      type: 'track.mix.effect.add',
      meta: createMeta(),
      payload: { trackId: 'track-1', effect: fx3, index: 2 },
    };

    const added = applyOperation(project, op) as AudioProjectData;
    const undone = applyOperation(
      added,
      invertOperation(op) as TrackMixOperation,
    ) as AudioProjectData;
    const redone = applyOperation(undone, op) as AudioProjectData;

    expect(added.trackMix?.['track-1']?.effectChain.map((effect) => effect.id)).toEqual([
      'fx-1',
      'fx-2',
      'fx-3',
    ]);
    expect(undone.trackMix?.['track-1']?.effectChain.map((effect) => effect.id)).toEqual([
      'fx-1',
      'fx-2',
    ]);
    expect(redone.trackMix?.['track-1']?.effectChain.map((effect) => effect.id)).toEqual([
      'fx-1',
      'fx-2',
      'fx-3',
    ]);
  });

  it('sets automation lanes and undo restores previous collection', () => {
    const beforeAutomation: AudioAutomationLane[] = [
      {
        id: 'lane-old',
        enabled: true,
        target: { kind: 'track-pan' },
        points: [{ ticks: 0, value: 0, curve: 'linear' }],
      },
    ];
    const nextAutomation: AudioAutomationLane[] = [
      {
        id: 'lane-volume',
        enabled: true,
        target: { kind: 'track-volume' },
        points: [
          { ticks: 0, value: 0.4, curve: 'linear' },
          { ticks: 480, value: 1, curve: 'hold' },
        ],
      },
    ];
    const project = createAudioProject({
      trackMix: {
        'track-1': {
          volume: 1,
          pan: 0,
          solo: false,
          effectChain: [],
          automation: beforeAutomation,
        },
      },
    });
    const op: TrackMixOperation = {
      type: 'track.mix.setAutomation',
      meta: createMeta(),
      payload: { trackId: 'track-1', automation: nextAutomation },
      before: { automation: beforeAutomation },
    };

    const updated = applyOperation(project, op) as AudioProjectData;
    const restored = applyOperation(
      updated,
      invertOperation(op) as TrackMixOperation,
    ) as AudioProjectData;

    expect(updated.trackMix?.['track-1']?.automation).toEqual(nextAutomation);
    expect(restored.trackMix?.['track-1']?.automation).toEqual(beforeAutomation);
  });

  it('validates effect parameter automation targets and values', () => {
    const project = createAudioProject({
      trackMix: {
        'track-1': {
          volume: 1,
          pan: 0,
          solo: false,
          effectChain: [
            createEffect({ id: 'fx-1', effectType: 'compressor', params: { threshold: -18 } }),
          ],
        },
      },
    });

    expect(() =>
      applyOperation(project, {
        type: 'track.mix.setAutomation',
        meta: createMeta(),
        payload: {
          trackId: 'track-1',
          automation: [
            {
              id: 'lane-1',
              enabled: true,
              target: { kind: 'effect-param', effectId: 'fx-1', param: 'threshold' },
              points: [{ ticks: 0, value: -80, curve: 'linear' }],
            },
          ],
        },
        before: {},
      }),
    ).toThrow('automation point value out of range');

    expect(() =>
      applyOperation(project, {
        type: 'track.mix.setAutomation',
        meta: createMeta(),
        payload: {
          trackId: 'track-1',
          automation: [
            {
              id: 'lane-1',
              enabled: true,
              target: { kind: 'effect-param', effectId: 'fx-1', param: 'missing' },
              points: [{ ticks: 0, value: 0, curve: 'linear' }],
            },
          ],
        },
        before: {},
      }),
    ).toThrow('unsupported automatable parameter: missing');
  });

  it('rejects unsorted automation points', () => {
    const project = createAudioProject();

    expect(() =>
      applyOperation(project, {
        type: 'track.mix.setAutomation',
        meta: createMeta(),
        payload: {
          trackId: 'track-1',
          automation: [
            {
              id: 'lane-1',
              enabled: true,
              target: { kind: 'track-volume' },
              points: [
                { ticks: 480, value: 1, curve: 'linear' },
                { ticks: 0, value: 0.5, curve: 'linear' },
              ],
            },
          ],
        },
        before: {},
      }),
    ).toThrow('automation point ticks must be strictly increasing');
  });
});
