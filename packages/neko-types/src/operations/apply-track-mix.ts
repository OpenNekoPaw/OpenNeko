// =============================================================================
// applyTrackMixOperation — persisted per-track audio mix operations
// =============================================================================

import type { AudioProjectData, AudioTrackMixState } from '../types/audioProject';
import type { AudioAutomationLane, AutomationTarget } from '../types/audioAutomation';
import type { OperationMeta, TrackMixOperation } from './types';
import { arrayMove, findTrack } from './helpers';
import { OperationError } from './errors';
import { getAudioEffectParameterMetadata } from '../types/audioEffectParams';

const DEFAULT_TRACK_MIX_STATE: AudioTrackMixState = {
  volume: 1,
  pan: 0,
  solo: false,
  effectChain: [],
};

export function createDefaultTrackMixState(): AudioTrackMixState {
  return {
    volume: DEFAULT_TRACK_MIX_STATE.volume,
    pan: DEFAULT_TRACK_MIX_STATE.pan,
    solo: DEFAULT_TRACK_MIX_STATE.solo,
    effectChain: [],
  };
}

export function applyTrackMixOperation(
  data: AudioProjectData,
  op: TrackMixOperation,
): AudioProjectData {
  findTrack(data, op.payload.trackId);

  const current = data.trackMix?.[op.payload.trackId] ?? createDefaultTrackMixState();

  switch (op.type) {
    case 'track.mix.setVolume':
      assertFiniteRange('track mix volume', op.payload.volume, 0, 2);
      return withTrackMixState(data, op.payload.trackId, {
        ...current,
        volume: op.payload.volume,
      });

    case 'track.mix.setPan':
      assertFiniteRange('track mix pan', op.payload.pan, -1, 1);
      return withTrackMixState(data, op.payload.trackId, {
        ...current,
        pan: op.payload.pan,
      });

    case 'track.mix.setSolo':
      return withTrackMixState(data, op.payload.trackId, {
        ...current,
        solo: op.payload.solo,
      });

    case 'track.mix.effect.add': {
      const index = op.payload.index;
      const effectChain = [...current.effectChain];
      effectChain.splice(index, 0, op.payload.effect);
      return withTrackMixState(data, op.payload.trackId, { ...current, effectChain });
    }

    case 'track.mix.effect.remove': {
      const effectChain = current.effectChain.filter((effect) => effect.id !== op.payload.effectId);
      if (effectChain.length === current.effectChain.length) {
        throw OperationError.invalidOperation(`Track mix effect not found: ${op.payload.effectId}`);
      }
      return withTrackMixState(data, op.payload.trackId, { ...current, effectChain });
    }

    case 'track.mix.effect.update': {
      let didUpdate = false;
      const effectChain = current.effectChain.map((effect) => {
        if (effect.id !== op.payload.effectId) {
          return effect;
        }
        didUpdate = true;
        return { ...effect, ...op.payload.updates };
      });
      if (!didUpdate) {
        throw OperationError.invalidOperation(`Track mix effect not found: ${op.payload.effectId}`);
      }
      return withTrackMixState(data, op.payload.trackId, { ...current, effectChain });
    }

    case 'track.mix.effect.move':
      if (current.effectChain[op.payload.fromIndex]?.id !== op.payload.effectId) {
        throw OperationError.invalidOperation(
          `Track mix effect not found at index ${op.payload.fromIndex}: ${op.payload.effectId}`,
        );
      }
      return withTrackMixState(data, op.payload.trackId, {
        ...current,
        effectChain: arrayMove(current.effectChain, op.payload.fromIndex, op.payload.toIndex),
      });

    case 'track.mix.setAutomation': {
      const nextAutomation = op.payload.automation?.map(cloneAutomationLane);
      if (nextAutomation) {
        validateAutomationLanes(nextAutomation, current);
      }
      return withTrackMixState(
        data,
        op.payload.trackId,
        nextAutomation === undefined
          ? withoutAutomation(current)
          : { ...current, automation: nextAutomation },
      );
    }

    default:
      throw OperationError.invalidOperation(
        `Unknown track mix operation: ${(op as unknown as Record<string, unknown>).type}`,
      );
  }
}

export function invertTrackMixOperation(
  op: TrackMixOperation,
  meta: OperationMeta,
): TrackMixOperation {
  switch (op.type) {
    case 'track.mix.setVolume':
      return {
        type: 'track.mix.setVolume',
        meta,
        payload: { trackId: op.payload.trackId, volume: op.before.volume },
        before: { volume: op.payload.volume },
      };

    case 'track.mix.setPan':
      return {
        type: 'track.mix.setPan',
        meta,
        payload: { trackId: op.payload.trackId, pan: op.before.pan },
        before: { pan: op.payload.pan },
      };

    case 'track.mix.setSolo':
      return {
        type: 'track.mix.setSolo',
        meta,
        payload: { trackId: op.payload.trackId, solo: op.before.solo },
        before: { solo: op.payload.solo },
      };

    case 'track.mix.effect.add':
      return {
        type: 'track.mix.effect.remove',
        meta,
        payload: { trackId: op.payload.trackId, effectId: op.payload.effect.id },
        before: {
          effect: op.payload.effect,
          index: op.payload.index,
        },
      };

    case 'track.mix.effect.remove':
      return {
        type: 'track.mix.effect.add',
        meta,
        payload: {
          trackId: op.payload.trackId,
          effect: op.before.effect,
          index: op.before.index,
        },
      };

    case 'track.mix.effect.update':
      return {
        type: 'track.mix.effect.update',
        meta,
        payload: {
          trackId: op.payload.trackId,
          effectId: op.payload.effectId,
          updates: op.before.updates,
        },
        before: { updates: op.payload.updates },
      };

    case 'track.mix.effect.move':
      return {
        type: 'track.mix.effect.move',
        meta,
        payload: {
          trackId: op.payload.trackId,
          effectId: op.payload.effectId,
          fromIndex: op.payload.toIndex,
          toIndex: op.payload.fromIndex,
        },
      };

    case 'track.mix.setAutomation':
      return {
        type: 'track.mix.setAutomation',
        meta,
        payload: {
          trackId: op.payload.trackId,
          ...(op.before.automation === undefined
            ? {}
            : { automation: op.before.automation.map(cloneAutomationLane) }),
        },
        before: {
          ...(op.payload.automation === undefined
            ? {}
            : { automation: op.payload.automation.map(cloneAutomationLane) }),
        },
      };

    default:
      throw OperationError.invalidOperation(
        `Unknown track mix operation: ${(op as unknown as Record<string, unknown>).type}`,
      );
  }
}

function assertFiniteRange(label: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw OperationError.invalidOperation(`${label} out of range [${min}, ${max}]: ${value}`);
  }
}

function validateAutomationLanes(lanes: AudioAutomationLane[], state: AudioTrackMixState): void {
  const laneIds = new Set<string>();
  for (const lane of lanes) {
    if (!lane.id) {
      throw OperationError.invalidOperation('automation lane id is required');
    }
    if (laneIds.has(lane.id)) {
      throw OperationError.invalidOperation(`duplicate automation lane id: ${lane.id}`);
    }
    laneIds.add(lane.id);

    const range = resolveAutomationTargetRange(lane.target, state);
    let previousTicks = -1;
    for (const point of lane.points) {
      if (!Number.isInteger(point.ticks) || point.ticks < 0) {
        throw OperationError.invalidOperation(
          `automation point ticks out of range: ${point.ticks}`,
        );
      }
      if (point.ticks <= previousTicks) {
        throw OperationError.invalidOperation('automation point ticks must be strictly increasing');
      }
      previousTicks = point.ticks;
      assertFiniteRange('automation point value', point.value, range.min, range.max);
      if (point.curve !== 'linear' && point.curve !== 'hold' && point.curve !== 'exponential') {
        throw OperationError.invalidOperation(`unsupported automation curve: ${point.curve}`);
      }
    }
  }
}

function resolveAutomationTargetRange(
  target: AutomationTarget,
  state: AudioTrackMixState,
): { min: number; max: number } {
  switch (target.kind) {
    case 'track-volume':
      return { min: 0, max: 2 };
    case 'track-pan':
      return { min: -1, max: 1 };
    case 'effect-param': {
      const effect = state.effectChain.find((candidate) => candidate.id === target.effectId);
      if (!effect) {
        throw OperationError.invalidOperation(`automation effect not found: ${target.effectId}`);
      }
      const metadata = getAudioEffectParameterMetadata(effect.effectType, target.param);
      if (!metadata || !metadata.automatable || metadata.valueKind !== 'number') {
        throw OperationError.invalidOperation(`unsupported automatable parameter: ${target.param}`);
      }
      return {
        min: metadata.min ?? Number.NEGATIVE_INFINITY,
        max: metadata.max ?? Number.POSITIVE_INFINITY,
      };
    }
  }
}

function cloneAutomationLane(lane: AudioAutomationLane): AudioAutomationLane {
  return {
    id: lane.id,
    target: { ...lane.target },
    enabled: lane.enabled,
    points: lane.points.map((point) => ({ ...point })),
  };
}

function withoutAutomation(state: AudioTrackMixState): AudioTrackMixState {
  const { automation: _automation, ...rest } = state;
  return rest;
}

function withTrackMixState(
  data: AudioProjectData,
  trackId: string,
  state: AudioTrackMixState,
): AudioProjectData {
  return {
    ...data,
    trackMix: {
      ...(data.trackMix ?? {}),
      [trackId]: state,
    },
  };
}
