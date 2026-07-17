// =============================================================================
// Audio Mix Config Builder — AudioProjectData → Engine render config
// =============================================================================

import type { TimelineElement } from '../types/element';
import type { AudioProperties } from '../types/audio';
import type { AudioProjectData, AudioTrackMixState } from '../types/audioProject';
import type {
  AudioEffectConfig,
  MixAutomationLaneConfig,
  MixElementConfig,
  MixStreamConfig,
} from '../types/audioMix';
import type { AudioAutomationLane } from '../types/audioAutomation';
import {
  isPlannedAudioEffectType,
  normalizeAudioEffectType,
  normalizeRenderableAudioEffectType,
} from '../types/audioMix';
import { getAudioEffectParameterMetadata } from '../types/audioEffectParams';
import { createDefaultTempoMap, ticksToSeconds, type TempoMap } from '../types/audioTempo';

export interface MixConfigContext {
  projectDir: string;
  resolveSourcePath: (src: string, projectDir: string) => string;
}

export interface MixConfigWarning {
  code: 'planned-effect' | 'unknown-effect' | 'invalid-automation' | 'unsupported-automation';
  message: string;
  effectId?: string;
  effectType: string;
  trackId?: string;
}

export interface MixConfigBuildResult {
  config: MixStreamConfig;
  warnings: MixConfigWarning[];
}

export function buildMixConfig(
  data: AudioProjectData,
  context: MixConfigContext,
): MixConfigBuildResult {
  const warnings: MixConfigWarning[] = [];
  const tempoMap = data.tempoMap ?? createDefaultTempoMap(data.bpm ?? 120);

  const config: MixStreamConfig = {
    tracks: data.tracks.map((track) => {
      const mix = data.trackMix?.[track.id];
      const effectChain = normalizeEffectChain(mix?.effectChain ?? [], warnings, track.id);
      return {
        id: track.id,
        muted: track.muted,
        solo: mix?.solo ?? false,
        volume: mix?.volume ?? 1,
        pan: mix?.pan ?? 0,
        effectChain,
        automation: normalizeAutomationLanes(mix, effectChain, tempoMap, warnings, track.id),
        elements: track.elements
          .filter(isAudioSourceElement)
          .map((element) => toMixElementConfig(element, context)),
      };
    }),
    masterEffects: normalizeMasterEffects(data, warnings),
    masterVolume: data.masterVolume ?? 1,
    sampleRate: data.sampleRate,
    channels: data.channels,
  };

  return { config, warnings };
}

function normalizeAutomationLanes(
  mix: AudioTrackMixState | undefined,
  effectChain: AudioEffectConfig[],
  tempoMap: TempoMap,
  warnings: MixConfigWarning[],
  trackId: string,
): MixAutomationLaneConfig[] {
  return (mix?.automation ?? []).flatMap((lane) => {
    if (!lane.enabled) {
      return [];
    }

    const validation = validateAutomationLane(lane, effectChain);
    if (!validation.ok) {
      warnings.push({
        code: validation.unsupported ? 'unsupported-automation' : 'invalid-automation',
        message: validation.message,
        effectId: lane.target.kind === 'effect-param' ? lane.target.effectId : undefined,
        effectType: lane.target.kind,
        trackId,
      });
      return [];
    }

    return [
      {
        id: lane.id,
        target: lane.target,
        enabled: true,
        points: lane.points.map((point) => ({
          time: ticksToSeconds(point.ticks, tempoMap),
          value: point.value,
          curve: point.curve,
        })),
      },
    ];
  });
}

function validateAutomationLane(
  lane: AudioAutomationLane,
  effectChain: AudioEffectConfig[],
): { ok: true } | { ok: false; message: string; unsupported?: boolean } {
  if (lane.points.some((point) => point.ticks < 0 || !Number.isInteger(point.ticks))) {
    return { ok: false, message: `Automation lane "${lane.id}" has invalid tick positions.` };
  }

  for (let index = 1; index < lane.points.length; index += 1) {
    if (lane.points[index]!.ticks <= lane.points[index - 1]!.ticks) {
      return { ok: false, message: `Automation lane "${lane.id}" points are not sorted.` };
    }
  }

  if (lane.target.kind === 'track-volume') {
    return validatePointValues(lane, 0, 2);
  }
  if (lane.target.kind === 'track-pan') {
    return validatePointValues(lane, -1, 1);
  }

  const target = lane.target;
  const effect = effectChain.find((candidate) => candidate.id === target.effectId);
  if (!effect) {
    return {
      ok: false,
      message: `Automation lane "${lane.id}" references missing effect "${target.effectId}".`,
    };
  }
  const metadata = getAudioEffectParameterMetadata(effect.effectType, target.param);
  if (!metadata || !metadata.automatable || metadata.valueKind !== 'number') {
    return {
      ok: false,
      unsupported: true,
      message: `Effect automation "${effect.effectType}.${target.param}" is not supported by mix rendering yet.`,
    };
  }

  return {
    ok: false,
    unsupported: true,
    message: `Effect automation "${effect.effectType}.${target.param}" is not supported by mix rendering yet.`,
  };
}

function validatePointValues(
  lane: AudioAutomationLane,
  min: number,
  max: number,
): { ok: true } | { ok: false; message: string } {
  const invalid = lane.points.find(
    (point) => !Number.isFinite(point.value) || point.value < min || point.value > max,
  );
  if (invalid) {
    return {
      ok: false,
      message: `Automation lane "${lane.id}" value out of range [${min}, ${max}].`,
    };
  }
  return { ok: true };
}

function normalizeMasterEffects(
  data: AudioProjectData,
  warnings: MixConfigWarning[],
): AudioEffectConfig[] {
  return data.masterEffectsChain.flatMap((effect) => {
    const effectType = normalizeAudioEffectType(effect.type);
    if (effectType && isPlannedAudioEffectType(effectType)) {
      warnings.push({
        code: 'planned-effect',
        message: `Master effect "${effectType}" is planned but not renderable yet.`,
        effectId: effect.id,
        effectType,
      });
      return [];
    }

    const renderableType = normalizeRenderableAudioEffectType(effect.type);
    if (!renderableType) {
      warnings.push({
        code: 'unknown-effect',
        message: `Master effect "${effect.type}" is not supported by the render engine.`,
        effectId: effect.id,
        effectType: effect.type,
      });
      return [];
    }

    return [
      {
        id: effect.id,
        effectType: renderableType,
        enabled: effect.enabled,
        params: effect.params,
      },
    ];
  });
}

function normalizeEffectChain(
  effects: AudioEffectConfig[],
  warnings: MixConfigWarning[],
  trackId: string,
): AudioEffectConfig[] {
  return effects.flatMap((effect) => {
    const normalized = normalizeAudioEffectType(effect.effectType);
    if (normalized && isPlannedAudioEffectType(normalized)) {
      warnings.push({
        code: 'planned-effect',
        message: `Track effect "${normalized}" is planned but not renderable yet.`,
        effectId: effect.id,
        effectType: normalized,
        trackId,
      });
      return [];
    }

    const effectType = normalizeRenderableAudioEffectType(effect.effectType);
    if (!effectType) {
      warnings.push({
        code: 'unknown-effect',
        message: `Track effect "${effect.effectType}" is not supported by the render engine.`,
        effectId: effect.id,
        effectType: effect.effectType,
        trackId,
      });
      return [];
    }
    return [{ ...effect, effectType }];
  });
}

function toMixElementConfig(
  element: TimelineElement & { src: string },
  context: MixConfigContext,
): MixElementConfig {
  const topLevelAudio = getRuntimeAudioFields(element);

  return {
    id: element.id,
    src: context.resolveSourcePath(element.src, context.projectDir),
    startTime: element.startTime,
    duration: element.duration,
    trimStart: element.trimStart ?? 0,
    volume: topLevelAudio.volume ?? element.audio?.volume ?? 1,
    pan: topLevelAudio.pan ?? element.audio?.pan ?? 0,
    muted: element.muted ?? element.audio?.muted ?? false,
    fadeIn: topLevelAudio.fadeIn ?? element.audio?.fadeIn ?? 0,
    fadeOut: topLevelAudio.fadeOut ?? element.audio?.fadeOut ?? 0,
    gain: topLevelAudio.gain ?? element.audio?.gain ?? 0,
  };
}

function getRuntimeAudioFields(element: TimelineElement): Partial<AudioProperties> {
  const value = element as unknown;
  if (!isRecord(value)) {
    return {};
  }
  return {
    ...(typeof value['volume'] === 'number' ? { volume: value['volume'] } : {}),
    ...(typeof value['pan'] === 'number' ? { pan: value['pan'] } : {}),
    ...(typeof value['muted'] === 'boolean' ? { muted: value['muted'] } : {}),
    ...(typeof value['fadeIn'] === 'number' ? { fadeIn: value['fadeIn'] } : {}),
    ...(typeof value['fadeOut'] === 'number' ? { fadeOut: value['fadeOut'] } : {}),
    ...(typeof value['gain'] === 'number' ? { gain: value['gain'] } : {}),
  };
}

function isAudioSourceElement(
  element: TimelineElement,
): element is TimelineElement & { src: string } {
  return element.type === 'audio' && 'src' in element && typeof element.src === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
