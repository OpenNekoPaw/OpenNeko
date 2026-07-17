// =============================================================================
// applyAudioOperation — 音频项目操作应用
// =============================================================================

import type { AudioOperation } from './types';
import { arrayMove } from './helpers';
import { OperationError } from './errors';

// Re-export AudioProjectData from its canonical location
export type { AudioProjectData } from '../types/audioProject';
import type { AudioProjectData } from '../types/audioProject';

// =============================================================================
// applyAudioOperation — operates on masterEffectsChain and markers
// =============================================================================

export function applyAudioOperation(data: AudioProjectData, op: AudioOperation): AudioProjectData {
  switch (op.type) {
    case 'audio.effect.add': {
      const idx = op.payload.index ?? data.masterEffectsChain.length;
      const chain = [...data.masterEffectsChain];
      chain.splice(idx, 0, op.payload.effect);
      return { ...data, masterEffectsChain: chain };
    }

    case 'audio.effect.remove': {
      const chain = data.masterEffectsChain.filter((e) => e.id !== op.payload.effectId);
      if (chain.length === data.masterEffectsChain.length) {
        throw OperationError.invalidOperation(`Audio effect not found: ${op.payload.effectId}`);
      }
      return { ...data, masterEffectsChain: chain };
    }

    case 'audio.effect.update': {
      let didUpdate = false;
      const chain = data.masterEffectsChain.map((e) => {
        if (e.id !== op.payload.effectId) {
          return e;
        }
        didUpdate = true;
        return { ...e, ...op.payload.updates };
      });
      if (!didUpdate) {
        throw OperationError.invalidOperation(`Audio effect not found: ${op.payload.effectId}`);
      }
      return { ...data, masterEffectsChain: chain };
    }

    case 'audio.effect.toggle': {
      let didToggle = false;
      const chain = data.masterEffectsChain.map((e) => {
        if (e.id !== op.payload.effectId) {
          return e;
        }
        didToggle = true;
        return { ...e, enabled: !e.enabled };
      });
      if (!didToggle) {
        throw OperationError.invalidOperation(`Audio effect not found: ${op.payload.effectId}`);
      }
      return { ...data, masterEffectsChain: chain };
    }

    case 'audio.setBpm': {
      if (data.tempoMap) {
        if (op.payload.bpm === undefined) {
          const { bpm: _bpm, ...rest } = data;
          return rest;
        }

        assertFiniteRange('audio BPM', op.payload.bpm, 20, 300);
        const [firstEvent, ...remainingTempoEvents] = data.tempoMap.tempoEvents;
        const replacement = { ticks: firstEvent?.ticks ?? 0, bpm: op.payload.bpm };
        return {
          ...data,
          bpm: op.payload.bpm,
          tempoMap: {
            ...data.tempoMap,
            tempoEvents: [replacement, ...remainingTempoEvents],
          },
        };
      }

      if (op.payload.bpm === undefined) {
        const { bpm: _bpm, ...rest } = data;
        return rest;
      }
      assertFiniteRange('audio BPM', op.payload.bpm, 20, 300);
      return { ...data, bpm: op.payload.bpm };
    }

    case 'audio.setTimeSignature': {
      assertPositiveInteger('time signature numerator', op.payload.numerator, 1, 32);
      assertPositiveInteger('time signature denominator', op.payload.denominator, 1, 32);
      const tempoMap = data.tempoMap ?? {
        ppq: 480,
        tempoEvents: [{ ticks: 0, bpm: data.bpm ?? 120 }],
        timeSignatureEvents: [{ ticks: 0, numerator: 4, denominator: 4 }],
      };
      const [firstEvent, ...remainingEvents] = tempoMap.timeSignatureEvents;
      return {
        ...data,
        tempoMap: {
          ...tempoMap,
          timeSignatureEvents: [
            {
              ticks: firstEvent?.ticks ?? 0,
              numerator: op.payload.numerator,
              denominator: op.payload.denominator,
            },
            ...remainingEvents,
          ],
        },
      };
    }

    case 'audio.setMasterVolume': {
      if (op.payload.masterVolume === undefined) {
        const { masterVolume: _masterVolume, ...rest } = data;
        return rest;
      }
      assertFiniteRange('master volume', op.payload.masterVolume, 0, 2);
      return { ...data, masterVolume: op.payload.masterVolume };
    }

    case 'audio.effect.move': {
      if (data.masterEffectsChain[op.payload.fromIndex]?.id !== op.payload.effectId) {
        throw OperationError.invalidOperation(
          `Audio effect not found at index ${op.payload.fromIndex}: ${op.payload.effectId}`,
        );
      }
      return {
        ...data,
        masterEffectsChain: arrayMove(
          data.masterEffectsChain,
          op.payload.fromIndex,
          op.payload.toIndex,
        ),
      };
    }

    case 'audio.marker.add': {
      return { ...data, markers: [...data.markers, op.payload.marker] };
    }

    case 'audio.marker.remove': {
      const markers = data.markers.filter((m) => m.id !== op.payload.markerId);
      if (markers.length === data.markers.length) {
        throw OperationError.invalidOperation(`Audio marker not found: ${op.payload.markerId}`);
      }
      return { ...data, markers };
    }

    case 'audio.marker.update': {
      let didUpdate = false;
      const markers = data.markers.map((m) => {
        if (m.id !== op.payload.markerId) {
          return m;
        }
        didUpdate = true;
        return { ...m, ...op.payload.updates };
      });
      if (!didUpdate) {
        throw OperationError.invalidOperation(`Audio marker not found: ${op.payload.markerId}`);
      }
      return { ...data, markers };
    }

    default:
      throw OperationError.invalidOperation(
        `Unknown audio operation: ${(op as unknown as Record<string, unknown>).type}`,
      );
  }
}

function assertFiniteRange(label: string, value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw OperationError.invalidOperation(`${label} out of range [${min}, ${max}]: ${value}`);
  }
}

function assertPositiveInteger(label: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw OperationError.invalidOperation(`${label} out of range [${min}, ${max}]: ${value}`);
  }
}
