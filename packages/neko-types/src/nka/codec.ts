// =============================================================================
// NKA Format SDK — Codec
//
// High-level API for loading and saving .nka audio project files.
// All functions are pure — no side effects.
// =============================================================================

import type { AudioProjectData, AudioTrackMixState } from '../types/audioProject';
import type { ValidationResult } from '../config/config-adapter';
import type { AudioEffectSnapshot, AudioMarkerSnapshot } from '../operations/types';
import type {
  AudioAutomationCurve,
  AudioAutomationLane,
  AutomationPoint,
  AutomationTarget,
} from '../types/audioAutomation';
import type { AudioProperties } from '../types/audio';
import type { TimelineElement } from '../types/element';
import type {
  AnimatableEffectParameter,
  EffectInstance,
  EffectParameterKeyframe,
  EffectParameterValue,
} from '../types/effects';
import type { EasingType } from '../types/easing';
import type { EngineClipLineage } from '../generated/timeline.engine';
import type { TimelineTrack } from '../types/timelineTrack';
import type { SpeedProperties, TimeRemapKeyframe } from '../types/speed';
import type { Transition } from '../types/transition';
import { isEngineAudioEffectType, isKnownAudioEffectType } from '../types/audioMix';
import { createDefaultTempoMap, type TempoMap } from '../types/audioTempo';
import { validateNka } from './validator';

/** Current NKA format version */
export const CURRENT_NKA_VERSION = '2.2';

export const SUPPORTED_NKA_VERSIONS = ['2.1', CURRENT_NKA_VERSION] as const;
type SupportedNkaVersion = (typeof SUPPORTED_NKA_VERSIONS)[number];

export type NkaCompatibilityMode = 'current' | 'future' | 'invalid';

export interface NkaCompatibilityMetadata {
  loadedVersion: string;
  currentVersion: string;
  mode: NkaCompatibilityMode;
  readOnly: boolean;
  warnings: string[];
}

/** Result of loading an NKA file */
export interface NkaLoadResult {
  /** Parsed audio project data */
  data: AudioProjectData;
  /** Validation result */
  validation: ValidationResult;
  /** Version compatibility metadata */
  compatibility: NkaCompatibilityMetadata;
}

/** Options for saving an NKA file */
export interface NkaSaveOptions {
  /** Whether to validate before saving (default: true) */
  validate?: boolean;
  /** JSON indentation (default: 2) */
  indent?: number;
  /** Preserve the input version instead of writing CURRENT_NKA_VERSION (default: false) */
  preserveVersion?: boolean;
}

/**
 * Load and validate an NKA audio project from a JSON string.
 *
 * Pipeline:
 * 1. JSON.parse (catch SyntaxError -> error result)
 * 2. Validate structure
 * 3. Return NkaLoadResult
 */
export function loadNka(json: string): NkaLoadResult {
  // Step 1: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (err) {
    const message = err instanceof SyntaxError ? err.message : 'Invalid JSON';
    return {
      data: createEmptyAudioProject(),
      validation: {
        valid: false,
        errors: [{ field: '', message: `JSON parse error: ${message}`, severity: 'error' }],
        warnings: [],
      },
      compatibility: createInvalidCompatibility(''),
    };
  }

  const data = parsed;

  // Step 2: Validate canonical data.
  const validation = validateNka(data);
  const compatibility = detectCompatibility(data);
  if (compatibility.mode === 'invalid') {
    return {
      data: createEmptyAudioProject(),
      validation: {
        valid: false,
        errors: [
          ...validation.errors,
          {
            field: 'version',
            message: `unsupported NKA version: "${compatibility.loadedVersion}"`,
            severity: 'error',
          },
        ],
        warnings: validation.warnings,
      },
      compatibility,
    };
  }

  if (!validation.valid) {
    return {
      data: createEmptyAudioProject(),
      validation,
      compatibility,
    };
  }

  // Step 3: Return result
  return {
    data: isRecord(data) ? toAudioProjectData(data) : createEmptyAudioProject(),
    validation: {
      ...validation,
      warnings: [...validation.warnings, ...compatibility.warnings.map(toWarning)],
    },
    compatibility,
  };
}

/**
 * Serialize an AudioProjectData to JSON string.
 *
 * Optionally validates before saving. Throws if validation fails and validate=true.
 */
export function saveNka(data: AudioProjectData, options: NkaSaveOptions = {}): string {
  const { validate = true, indent = 2, preserveVersion = false } = options;

  if (validate) {
    const result = validateNka(data as unknown);
    if (!result.valid) {
      const errorMessages = result.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      throw new Error(`NKA validation failed: ${errorMessages}`);
    }
  }

  const serializable = validate
    ? stripToCurrentSchema(data, preserveVersion)
    : withSerializedVersion(data, preserveVersion);

  return JSON.stringify(serializable, null, indent);
}

/**
 * Type guard: check whether unknown data is a valid AudioProjectData.
 */
export function isValidNka(data: unknown): data is AudioProjectData {
  const result = validateNka(data);
  return result.valid;
}

// =============================================================================
// Internal helper
// =============================================================================

function createEmptyAudioProject(): AudioProjectData {
  return {
    version: CURRENT_NKA_VERSION,
    name: '',
    sampleRate: 48000,
    channels: 2,
    tracks: [],
    masterEffectsChain: [],
    markers: [],
  };
}

function createInvalidCompatibility(loadedVersion: string): NkaCompatibilityMetadata {
  return {
    loadedVersion,
    currentVersion: CURRENT_NKA_VERSION,
    mode: 'invalid',
    readOnly: true,
    warnings: [],
  };
}

function detectCompatibility(data: unknown): NkaCompatibilityMetadata {
  if (!isRecord(data) || typeof data['version'] !== 'string') {
    return createInvalidCompatibility('');
  }

  const loadedVersion = data['version'];
  const ordering = compareVersions(loadedVersion, CURRENT_NKA_VERSION);

  if (ordering > 0) {
    return {
      loadedVersion,
      currentVersion: CURRENT_NKA_VERSION,
      mode: 'future',
      readOnly: true,
      warnings: [
        `NKA version ${loadedVersion} is newer than supported version ${CURRENT_NKA_VERSION}; opening read-only until explicitly downgraded.`,
      ],
    };
  }

  if (isSupportedNkaVersion(loadedVersion)) {
    return {
      loadedVersion,
      currentVersion: CURRENT_NKA_VERSION,
      mode: 'current',
      readOnly: false,
      warnings: [],
    };
  }

  return createInvalidCompatibility(loadedVersion);
}

function isSupportedNkaVersion(version: string): version is SupportedNkaVersion {
  return SUPPORTED_NKA_VERSIONS.some((supported) => supported === version);
}

function toAudioProjectData(data: Record<string, unknown>): AudioProjectData {
  return {
    version: readString(data, 'version', CURRENT_NKA_VERSION),
    name: readString(data, 'name', ''),
    sampleRate: readNumber(data, 'sampleRate', 48000),
    channels: readNumber(data, 'channels', 2),
    tracks: readArray(data, 'tracks').map(toTimelineTrack).filter(isDefined),
    masterEffectsChain: readArray(data, 'masterEffectsChain')
      .map(toAudioEffectSnapshot)
      .filter(isDefined),
    markers: readArray(data, 'markers').map(toAudioMarkerSnapshot).filter(isDefined),
    ...(typeof data['bpm'] === 'number' ? { bpm: data['bpm'] } : {}),
    tempoMap: toTempoMap(data['tempoMap']) ?? createDefaultTempoMap(readNumber(data, 'bpm', 120)),
    ...(isRecord(data['trackMix']) ? { trackMix: toTrackMix(data['trackMix']) } : {}),
    ...(typeof data['masterVolume'] === 'number' ? { masterVolume: data['masterVolume'] } : {}),
  };
}

function toTimelineTrack(track: unknown): TimelineTrack | undefined {
  if (!isRecord(track) || !isTrackType(track['type'])) {
    return undefined;
  }

  return {
    id: readString(track, 'id', ''),
    name: readString(track, 'name', ''),
    type: track['type'],
    elements: readArray(track, 'elements').map(toTimelineElement).filter(isDefined),
    muted: readBoolean(track, 'muted', false),
    locked: readBoolean(track, 'locked', false),
    hidden: readBoolean(track, 'hidden', false),
    isMain: readBoolean(track, 'isMain', false),
  };
}

function toTimelineElement(element: unknown): TimelineElement | undefined {
  if (!isRecord(element) || !isElementType(element['type'])) {
    return undefined;
  }

  const audio = toAudioProperties(element['audio']);
  const speed = toSpeedProperties(element['speed']);
  const transitionIn = toTransition(element['transitionIn']);
  const transitionOut = toTransition(element['transitionOut']);
  const lineage = toClipLineage(element['lineage']);
  const base = {
    id: readString(element, 'id', ''),
    name: readString(element, 'name', ''),
    duration: readNumber(element, 'duration', 0),
    startTime: readNumber(element, 'startTime', 0),
    trimStart: readNumber(element, 'trimStart', 0),
    trimEnd: readNumber(element, 'trimEnd', 0),
    transform: toTransform(element['transform']),
    opacity: readNumber(element, 'opacity', 1),
    blendMode: isBlendModeType(element['blendMode']) ? element['blendMode'] : 'normal',
    effects: readArray(element, 'effects').map(toEffectInstance).filter(isDefined),
    muted: readBoolean(element, 'muted', false),
    hidden: readBoolean(element, 'hidden', false),
    locked: readBoolean(element, 'locked', false),
    ...(audio ? { audio } : {}),
    ...(speed ? { speed } : {}),
    ...(transitionIn ? { transitionIn } : {}),
    ...(transitionOut ? { transitionOut } : {}),
    ...(lineage ? { lineage } : {}),
  };

  switch (element['type']) {
    case 'media':
      return {
        ...base,
        type: 'media',
        src: readString(element, 'src', ''),
        ...(typeof element['resourceId'] === 'string' ? { resourceId: element['resourceId'] } : {}),
        ...(isMediaType(element['mediaType']) ? { mediaType: element['mediaType'] } : {}),
        ...(typeof element['linkedAudioId'] === 'string'
          ? { linkedAudioId: element['linkedAudioId'] }
          : {}),
      };
    case 'audio':
      return {
        ...base,
        type: 'audio',
        src: readString(element, 'src', ''),
        ...(typeof element['resourceId'] === 'string' ? { resourceId: element['resourceId'] } : {}),
        ...(typeof element['linkedVideoId'] === 'string'
          ? { linkedVideoId: element['linkedVideoId'] }
          : {}),
      };
    case 'text': {
      const shadow = toTextShadow(element['shadow']);
      return {
        ...base,
        type: 'text',
        content: readString(element, 'content', ''),
        fontSize: readNumber(element, 'fontSize', 48),
        fontFamily: readString(element, 'fontFamily', 'Arial'),
        color: readString(element, 'color', '#ffffff'),
        backgroundColor: readString(element, 'backgroundColor', 'transparent'),
        textAlign: isTextAlign(element['textAlign']) ? element['textAlign'] : 'center',
        fontWeight: isFontWeight(element['fontWeight']) ? element['fontWeight'] : 'normal',
        fontStyle: isFontStyle(element['fontStyle']) ? element['fontStyle'] : 'normal',
        ...(isTextDecoration(element['textDecoration'])
          ? { textDecoration: element['textDecoration'] }
          : {}),
        ...(typeof element['lineHeight'] === 'number' ? { lineHeight: element['lineHeight'] } : {}),
        ...(typeof element['letterSpacing'] === 'number'
          ? { letterSpacing: element['letterSpacing'] }
          : {}),
        ...(typeof element['strokeColor'] === 'string'
          ? { strokeColor: element['strokeColor'] }
          : {}),
        ...(typeof element['strokeWidth'] === 'number'
          ? { strokeWidth: element['strokeWidth'] }
          : {}),
        ...(shadow ? { shadow } : {}),
      };
    }
    case 'shape':
      return {
        ...base,
        type: 'shape',
        shapeType: readString(element, 'shapeType', 'rectangle'),
        fill: readString(element, 'fill', '#ffffff'),
        stroke: readString(element, 'stroke', 'transparent'),
        strokeWidth: readNumber(element, 'strokeWidth', 0),
      };
    case 'subtitle': {
      const shadow = toTextShadow(element['shadow']);
      return {
        ...base,
        type: 'subtitle',
        text: readString(element, 'text', ''),
        fontSize: readNumber(element, 'fontSize', 48),
        color: readString(element, 'color', '#ffffff'),
        fontFamily: readString(element, 'fontFamily', 'Arial'),
        backgroundColor: readString(element, 'backgroundColor', 'transparent'),
        textAlign: readString(element, 'textAlign', 'center'),
        strokeColor: readString(element, 'strokeColor', 'transparent'),
        strokeWidth: readNumber(element, 'strokeWidth', 0),
        ...(shadow ? { shadow } : {}),
      };
    }
    case 'scene3d':
      return {
        ...base,
        type: 'scene3d',
        src: readString(element, 'src', ''),
        ...(typeof element['cameraNodeId'] === 'string'
          ? { cameraNodeId: element['cameraNodeId'] }
          : {}),
        ...(typeof element['animationClip'] === 'string'
          ? { animationClip: element['animationClip'] }
          : {}),
        ...(typeof element['animationLoop'] === 'boolean'
          ? { animationLoop: element['animationLoop'] }
          : {}),
        ...(typeof element['animationSpeed'] === 'number'
          ? { animationSpeed: element['animationSpeed'] }
          : {}),
        ...(isNumberTuple(element['backgroundColor'], 4)
          ? { backgroundColor: element['backgroundColor'] }
          : {}),
        ...(isRecord(element['cameraOverride'])
          ? { cameraOverride: toCameraOverride(element['cameraOverride']) }
          : {}),
      };
    case 'puppet':
      return {
        ...base,
        type: 'puppet',
        src: readString(element, 'src', ''),
        ...(typeof element['animationClip'] === 'string'
          ? { animationClip: element['animationClip'] }
          : {}),
        ...(typeof element['animationLoop'] === 'boolean'
          ? { animationLoop: element['animationLoop'] }
          : {}),
        ...(typeof element['animationSpeed'] === 'number'
          ? { animationSpeed: element['animationSpeed'] }
          : {}),
        ...(typeof element['expression'] === 'string' ? { expression: element['expression'] } : {}),
        ...(isNumberRecord(element['parameterOverrides'])
          ? { parameterOverrides: element['parameterOverrides'] }
          : {}),
      };
  }
}

function toAudioEffectSnapshot(effect: unknown): AudioEffectSnapshot | undefined {
  if (!isRecord(effect) || !isKnownAudioEffectTypeValue(effect['type'])) {
    return undefined;
  }

  return {
    id: readString(effect, 'id', ''),
    type: effect['type'],
    name: readString(effect, 'name', ''),
    enabled: readBoolean(effect, 'enabled', true),
    params: isRecord(effect['params']) ? { ...effect['params'] } : {},
  };
}

function toAudioMarkerSnapshot(marker: unknown): AudioMarkerSnapshot | undefined {
  if (!isRecord(marker)) {
    return undefined;
  }

  return {
    id: readString(marker, 'id', ''),
    time: readNumber(marker, 'time', 0),
    label: readString(marker, 'label', ''),
    ...(typeof marker['color'] === 'string' ? { color: marker['color'] } : {}),
  };
}

function toTrackMix(trackMix: Record<string, unknown>): Record<string, AudioTrackMixState> {
  return Object.fromEntries(
    Object.entries(trackMix)
      .map(([trackId, state]) => {
        if (!isRecord(state)) {
          return undefined;
        }

        return [
          trackId,
          {
            volume: readNumber(state, 'volume', 1),
            pan: readNumber(state, 'pan', 0),
            solo: readBoolean(state, 'solo', false),
            effectChain: readArray(state, 'effectChain')
              .map(toRenderableAudioEffectConfig)
              .filter(isDefined),
            ...(isArray(state['automation'])
              ? { automation: state['automation'].map(toAutomationLane).filter(isDefined) }
              : {}),
          },
        ] as const;
      })
      .filter(isDefined),
  );
}

function toRenderableAudioEffectConfig(
  effect: unknown,
): AudioTrackMixState['effectChain'][number] | undefined {
  if (!isRecord(effect) || !isEngineAudioEffectTypeValue(effect['effectType'])) {
    return undefined;
  }

  return {
    id: readString(effect, 'id', ''),
    effectType: effect['effectType'],
    enabled: readBoolean(effect, 'enabled', true),
    params: isRecord(effect['params']) ? { ...effect['params'] } : {},
  };
}

function toTempoMap(value: unknown): TempoMap | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    ppq: readNumber(value, 'ppq', 480),
    tempoEvents: readArray(value, 'tempoEvents')
      .map((event) => {
        if (!isRecord(event)) {
          return undefined;
        }

        return {
          ticks: readNumber(event, 'ticks', 0),
          bpm: readNumber(event, 'bpm', 120),
        };
      })
      .filter(isDefined),
    timeSignatureEvents: readArray(value, 'timeSignatureEvents')
      .map((event) => {
        if (!isRecord(event)) {
          return undefined;
        }

        return {
          ticks: readNumber(event, 'ticks', 0),
          numerator: readNumber(event, 'numerator', 4),
          denominator: readNumber(event, 'denominator', 4),
        };
      })
      .filter(isDefined),
  };
}

function toAutomationLane(value: unknown): AudioAutomationLane | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const target = toAutomationTarget(value['target']);
  if (!target) {
    return undefined;
  }

  return {
    id: readString(value, 'id', ''),
    target,
    enabled: readBoolean(value, 'enabled', true),
    points: readArray(value, 'points').map(toAutomationPoint).filter(isDefined),
  };
}

function toAutomationTarget(value: unknown): AutomationTarget | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (value['kind'] === 'track-volume') {
    return { kind: 'track-volume' };
  }
  if (value['kind'] === 'track-pan') {
    return { kind: 'track-pan' };
  }
  if (value['kind'] === 'effect-param') {
    return {
      kind: 'effect-param',
      effectId: readString(value, 'effectId', ''),
      param: readString(value, 'param', ''),
    };
  }

  return undefined;
}

function toAutomationPoint(value: unknown): AutomationPoint | undefined {
  if (!isRecord(value) || !isAutomationCurve(value['curve'])) {
    return undefined;
  }

  return {
    ticks: readNumber(value, 'ticks', 0),
    value: readNumber(value, 'value', 0),
    curve: value['curve'],
  };
}

function toEffectInstance(effect: unknown): EffectInstance | undefined {
  if (!isRecord(effect)) {
    return undefined;
  }

  const animatedParameters = toAnimatedEffectParameters(effect['animatedParameters']);
  return {
    id: readString(effect, 'id', ''),
    type: readString(effect, 'type', ''),
    enabled: readBoolean(effect, 'enabled', true),
    parameters: toEffectParameters(effect['parameters']),
    ...(animatedParameters ? { animatedParameters } : {}),
    order: readNumber(effect, 'order', 0),
  };
}

function toEffectParameters(value: unknown): Record<string, EffectParameterValue> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, EffectParameterValue] =>
      isEffectParameterValue(entry[1]),
    ),
  );
}

function toAnimatedEffectParameters(
  value: unknown,
): Record<string, AnimatableEffectParameter> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .map(([key, parameter]) => {
      if (!isRecord(parameter) || !isEffectParameterValue(parameter['baseValue'])) {
        return undefined;
      }

      return [
        key,
        {
          baseValue: parameter['baseValue'],
          keyframes: readArray(parameter, 'keyframes')
            .map(toEffectParameterKeyframe)
            .filter(isDefined),
        },
      ] as const;
    })
    .filter(isDefined);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function toEffectParameterKeyframe(keyframe: unknown): EffectParameterKeyframe | undefined {
  if (!isRecord(keyframe) || !isEffectParameterValue(keyframe['value'])) {
    return undefined;
  }

  return {
    id: readString(keyframe, 'id', ''),
    time: readNumber(keyframe, 'time', 0),
    value: keyframe['value'],
    easing: isEffectKeyframeEasing(keyframe['easing']) ? keyframe['easing'] : 'linear',
  };
}

function toAudioProperties(value: unknown): AudioProperties | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    volume: readNumber(value, 'volume', 1),
    pan: readNumber(value, 'pan', 0),
    muted: readBoolean(value, 'muted', false),
    fadeIn: readNumber(value, 'fadeIn', 0),
    fadeOut: readNumber(value, 'fadeOut', 0),
    fadeInCurve: isEasingType(value['fadeInCurve']) ? value['fadeInCurve'] : 'linear',
    fadeOutCurve: isEasingType(value['fadeOutCurve']) ? value['fadeOutCurve'] : 'linear',
    gain: readNumber(value, 'gain', 0),
    ...(isRecord(value['eq'])
      ? {
          eq: {
            lowGain: readNumber(value['eq'], 'lowGain', 0),
            midGain: readNumber(value['eq'], 'midGain', 0),
            highGain: readNumber(value['eq'], 'highGain', 0),
          },
        }
      : {}),
  };
}

function toSpeedProperties(value: unknown): SpeedProperties | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const timeRemap = toTimeRemap(value['timeRemap']);
  return {
    speed: readNumber(value, 'speed', 1),
    preservePitch: readBoolean(value, 'preservePitch', true),
    reverse: readBoolean(value, 'reverse', false),
    ...(timeRemap ? { timeRemap } : {}),
  };
}

function toTimeRemap(value: unknown): SpeedProperties['timeRemap'] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    enabled: readBoolean(value, 'enabled', false),
    keyframes: readArray(value, 'keyframes').map(toTimeRemapKeyframe).filter(isDefined),
  };
}

function toTimeRemapKeyframe(value: unknown): TimeRemapKeyframe | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    id: readString(value, 'id', ''),
    outputTime: readNumber(value, 'outputTime', 0),
    inputTime: readNumber(value, 'inputTime', 0),
    easing: isEasingType(value['easing']) ? value['easing'] : 'linear',
  };
}

function toTransition(value: unknown): Transition | undefined {
  if (!isRecord(value) || !isTransitionType(value['type'])) {
    return undefined;
  }

  return {
    ...(typeof value['id'] === 'string' ? { id: value['id'] } : {}),
    type: value['type'],
    duration: readNumber(value, 'duration', 0),
    easing: isEasingType(value['easing']) ? value['easing'] : 'linear',
    ...(isRecord(value['params']) ? { params: toTransitionParams(value['params']) } : {}),
  };
}

function toTransitionParams(value: Record<string, unknown>): NonNullable<Transition['params']> {
  return {
    ...(isTransitionDirection(value['direction']) ? { direction: value['direction'] } : {}),
    ...(typeof value['softness'] === 'number' ? { softness: value['softness'] } : {}),
    ...(typeof value['color'] === 'string' ? { color: value['color'] } : {}),
  };
}

function toTextShadow(
  value: unknown,
): NonNullable<Extract<TimelineElement, { type: 'text' }>['shadow']> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    color: readString(value, 'color', 'rgba(0,0,0,0.5)'),
    offsetX: readNumber(value, 'offsetX', 0),
    offsetY: readNumber(value, 'offsetY', 0),
    blur: readNumber(value, 'blur', 0),
  };
}

function toClipLineage(value: unknown): EngineClipLineage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    shotNodeId: readString(value, 'shotNodeId', ''),
    generationId: readString(value, 'generationId', ''),
    planId: readString(value, 'planId', ''),
    routeLevel: readString(value, 'routeLevel', ''),
    recordedAt: readNumber(value, 'recordedAt', 0),
  };
}

function toTransform(value: unknown): TimelineElement['transform'] {
  if (!isRecord(value)) {
    return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0 };
  }

  return {
    x: readNumber(value, 'x', 0),
    y: readNumber(value, 'y', 0),
    scaleX: readNumber(value, 'scaleX', 1),
    scaleY: readNumber(value, 'scaleY', 1),
    rotation: readNumber(value, 'rotation', 0),
    anchorX: readNumber(value, 'anchorX', 0),
    anchorY: readNumber(value, 'anchorY', 0),
  };
}

function toCameraOverride(
  value: Record<string, unknown>,
): NonNullable<Extract<TimelineElement, { type: 'scene3d' }>['cameraOverride']> {
  return {
    position: isNumberTuple(value['position'], 3) ? value['position'] : [0, 0, 0],
    target: isNumberTuple(value['target'], 3) ? value['target'] : [0, 0, 0],
    ...(isNumberTuple(value['up'], 3) ? { up: value['up'] } : {}),
    ...(typeof value['fovY'] === 'number' ? { fovY: value['fovY'] } : {}),
  };
}

function stripToCurrentSchema(data: AudioProjectData, preserveVersion: boolean): AudioProjectData {
  const tempoMap = data.tempoMap ?? createDefaultTempoMap(data.bpm ?? 120);
  const bpm = tempoMap.tempoEvents[0]?.bpm ?? data.bpm;

  return {
    version: preserveVersion ? data.version : CURRENT_NKA_VERSION,
    name: data.name,
    sampleRate: data.sampleRate,
    channels: data.channels,
    tracks: data.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      type: track.type,
      elements: track.elements.map(stripTimelineElement),
      muted: track.muted,
      locked: track.locked,
      hidden: track.hidden,
      isMain: track.isMain,
    })),
    masterEffectsChain: data.masterEffectsChain.map((effect) => ({
      id: effect.id,
      type: effect.type,
      name: effect.name,
      enabled: effect.enabled,
      params: { ...effect.params },
    })),
    markers: data.markers.map((marker) => ({
      id: marker.id,
      time: marker.time,
      label: marker.label,
      ...(marker.color !== undefined ? { color: marker.color } : {}),
    })),
    ...(bpm !== undefined ? { bpm } : {}),
    tempoMap: stripTempoMap(tempoMap),
    ...(data.trackMix
      ? {
          trackMix: Object.fromEntries(
            Object.entries(data.trackMix).map(([trackId, state]) => [
              trackId,
              {
                volume: state.volume,
                pan: state.pan,
                solo: state.solo,
                effectChain: state.effectChain.map((effect) => ({
                  id: effect.id,
                  effectType: effect.effectType,
                  enabled: effect.enabled,
                  params: { ...effect.params },
                })),
                ...(state.automation !== undefined
                  ? { automation: state.automation.map(stripAutomationLane) }
                  : {}),
              },
            ]),
          ),
        }
      : {}),
    ...(data.masterVolume !== undefined ? { masterVolume: data.masterVolume } : {}),
  };
}

function stripTimelineElement(element: AudioProjectData['tracks'][number]['elements'][number]) {
  const base = {
    id: element.id,
    name: element.name,
    duration: element.duration,
    startTime: element.startTime,
    trimStart: element.trimStart,
    trimEnd: element.trimEnd,
    transform: { ...element.transform },
    opacity: element.opacity,
    blendMode: element.blendMode,
    effects: element.effects.map((effect) => ({
      ...effect,
      parameters: { ...effect.parameters },
      ...(effect.animatedParameters !== undefined
        ? { animatedParameters: structuredClone(effect.animatedParameters) }
        : {}),
    })),
    muted: element.muted,
    hidden: element.hidden,
    locked: element.locked,
    ...(element.audio !== undefined ? { audio: structuredClone(element.audio) } : {}),
    ...(element.speed !== undefined ? { speed: structuredClone(element.speed) } : {}),
    ...(element.transitionIn !== undefined ? { transitionIn: { ...element.transitionIn } } : {}),
    ...(element.transitionOut !== undefined ? { transitionOut: { ...element.transitionOut } } : {}),
    ...(element.lineage !== undefined ? { lineage: { ...element.lineage } } : {}),
  };

  switch (element.type) {
    case 'media':
      return {
        ...base,
        type: element.type,
        src: element.src,
        ...(element.resourceId !== undefined ? { resourceId: element.resourceId } : {}),
        ...(element.mediaType !== undefined ? { mediaType: element.mediaType } : {}),
        ...(element.linkedAudioId !== undefined ? { linkedAudioId: element.linkedAudioId } : {}),
      };
    case 'audio':
      return {
        ...base,
        type: element.type,
        src: element.src,
        ...(element.resourceId !== undefined ? { resourceId: element.resourceId } : {}),
        ...(element.linkedVideoId !== undefined ? { linkedVideoId: element.linkedVideoId } : {}),
      };
    case 'text':
      return {
        ...base,
        type: element.type,
        content: element.content,
        fontSize: element.fontSize,
        fontFamily: element.fontFamily,
        color: element.color,
        backgroundColor: element.backgroundColor,
        textAlign: element.textAlign,
        fontWeight: element.fontWeight,
        fontStyle: element.fontStyle,
        ...(element.textDecoration !== undefined ? { textDecoration: element.textDecoration } : {}),
        ...(element.lineHeight !== undefined ? { lineHeight: element.lineHeight } : {}),
        ...(element.letterSpacing !== undefined ? { letterSpacing: element.letterSpacing } : {}),
        ...(element.strokeColor !== undefined ? { strokeColor: element.strokeColor } : {}),
        ...(element.strokeWidth !== undefined ? { strokeWidth: element.strokeWidth } : {}),
        ...(element.shadow !== undefined ? { shadow: { ...element.shadow } } : {}),
      };
    case 'shape':
      return {
        ...base,
        type: element.type,
        shapeType: element.shapeType,
        fill: element.fill,
        stroke: element.stroke,
        strokeWidth: element.strokeWidth,
      };
    case 'subtitle':
      return {
        ...base,
        type: element.type,
        text: element.text,
        fontSize: element.fontSize,
        color: element.color,
        fontFamily: element.fontFamily,
        backgroundColor: element.backgroundColor,
        textAlign: element.textAlign,
        strokeColor: element.strokeColor,
        strokeWidth: element.strokeWidth,
        ...(element.shadow !== undefined ? { shadow: { ...element.shadow } } : {}),
      };
    case 'scene3d':
      return {
        ...base,
        type: element.type,
        src: element.src,
        ...(element.cameraNodeId !== undefined ? { cameraNodeId: element.cameraNodeId } : {}),
        ...(element.animationClip !== undefined ? { animationClip: element.animationClip } : {}),
        ...(element.animationLoop !== undefined ? { animationLoop: element.animationLoop } : {}),
        ...(element.animationSpeed !== undefined ? { animationSpeed: element.animationSpeed } : {}),
        ...(element.backgroundColor !== undefined
          ? { backgroundColor: [...element.backgroundColor] as [number, number, number, number] }
          : {}),
        ...(element.cameraOverride !== undefined
          ? {
              cameraOverride: {
                position: [...element.cameraOverride.position] as [number, number, number],
                target: [...element.cameraOverride.target] as [number, number, number],
                ...(element.cameraOverride.up !== undefined
                  ? { up: [...element.cameraOverride.up] as [number, number, number] }
                  : {}),
                ...(element.cameraOverride.fovY !== undefined
                  ? { fovY: element.cameraOverride.fovY }
                  : {}),
              },
            }
          : {}),
      };
    case 'puppet':
      return {
        ...base,
        type: element.type,
        src: element.src,
        ...(element.animationClip !== undefined ? { animationClip: element.animationClip } : {}),
        ...(element.animationLoop !== undefined ? { animationLoop: element.animationLoop } : {}),
        ...(element.animationSpeed !== undefined ? { animationSpeed: element.animationSpeed } : {}),
        ...(element.expression !== undefined ? { expression: element.expression } : {}),
        ...(element.parameterOverrides !== undefined
          ? { parameterOverrides: { ...element.parameterOverrides } }
          : {}),
      };
  }
}

function withSerializedVersion(data: AudioProjectData, preserveVersion: boolean): AudioProjectData {
  return preserveVersion ? data : { ...data, version: CURRENT_NKA_VERSION };
}

function stripTempoMap(tempoMap: TempoMap): TempoMap {
  return {
    ppq: tempoMap.ppq,
    tempoEvents: tempoMap.tempoEvents.map((event) => ({ ticks: event.ticks, bpm: event.bpm })),
    timeSignatureEvents: tempoMap.timeSignatureEvents.map((event) => ({
      ticks: event.ticks,
      numerator: event.numerator,
      denominator: event.denominator,
    })),
  };
}

function stripAutomationLane(lane: AudioAutomationLane): AudioAutomationLane {
  return {
    id: lane.id,
    target: { ...lane.target },
    enabled: lane.enabled,
    points: lane.points.map((point) => ({
      ticks: point.ticks,
      value: point.value,
      curve: point.curve,
    })),
  };
}

function compareVersions(a: string, b: string): number {
  const aParts = parseVersionParts(a);
  const bParts = parseVersionParts(b);
  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i++) {
    const delta = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function parseVersionParts(value: string): number[] {
  return value.split('.').map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

function toWarning(message: string): { field: string; message: string; severity: 'warning' } {
  return { field: 'version', message, severity: 'warning' };
}

function readString(data: Record<string, unknown>, key: string, defaultValue: string): string {
  const value = data[key];
  return typeof value === 'string' ? value : defaultValue;
}

function readNumber(data: Record<string, unknown>, key: string, defaultValue: number): number {
  const value = data[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : defaultValue;
}

function readBoolean(data: Record<string, unknown>, key: string, defaultValue: boolean): boolean {
  const value = data[key];
  return typeof value === 'boolean' ? value : defaultValue;
}

function readArray(data: Record<string, unknown>, key: string): unknown[] {
  const value = data[key];
  return Array.isArray(value) ? value : [];
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, candidates: readonly T[]): value is T {
  return typeof value === 'string' && candidates.includes(value as T);
}

const TRACK_TYPES = [
  'video',
  'audio',
  'text',
  'effect',
  'subtitle',
  'shape',
  'scene3d',
  'puppet',
  'media',
] as const satisfies readonly TimelineTrack['type'][];

const ELEMENT_TYPES = [
  'media',
  'audio',
  'text',
  'shape',
  'subtitle',
  'scene3d',
  'puppet',
] as const satisfies readonly TimelineElement['type'][];

const BLEND_MODE_TYPES = [
  'normal',
  'dissolve',
  'darken',
  'multiply',
  'colorBurn',
  'linearBurn',
  'darkerColor',
  'lighten',
  'screen',
  'colorDodge',
  'linearDodge',
  'lighterColor',
  'overlay',
  'softLight',
  'hardLight',
  'vividLight',
  'linearLight',
  'pinLight',
  'hardMix',
  'difference',
  'exclusion',
  'subtract',
  'divide',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const satisfies readonly TimelineElement['blendMode'][];

const EASING_TYPES = [
  'linear',
  'ease-in-quad',
  'ease-out-quad',
  'ease-in-out-quad',
  'ease-in-cubic',
  'ease-out-cubic',
  'ease-in-out-cubic',
  'ease-in-quart',
  'ease-out-quart',
  'ease-in-out-quart',
  'ease-in-quint',
  'ease-out-quint',
  'ease-in-out-quint',
  'ease-in-sine',
  'ease-out-sine',
  'ease-in-out-sine',
  'ease-in-expo',
  'ease-out-expo',
  'ease-in-out-expo',
  'ease-in-circ',
  'ease-out-circ',
  'ease-in-out-circ',
  'ease-in-back',
  'ease-out-back',
  'ease-in-out-back',
  'ease-in-elastic',
  'ease-out-elastic',
  'ease-in-out-elastic',
  'ease-in-bounce',
  'ease-out-bounce',
  'ease-in-out-bounce',
  'bezier',
  'ease-in',
  'ease-out',
  'ease-in-out',
] as const satisfies readonly EasingType[];

const EFFECT_KEYFRAME_EASING_TYPES = [
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
] as const satisfies readonly EffectParameterKeyframe['easing'][];

const TRANSITION_TYPES = [
  'fade',
  'dissolve',
  'wipe-left',
  'wipe-right',
  'wipe-up',
  'wipe-down',
  'slide-left',
  'slide-right',
  'zoom-in',
  'zoom-out',
  'iris-circle',
  'iris-rectangle',
  'clock',
  'pixelate',
  'ripple',
  'swirl',
  'glitch',
  'flash',
] as const satisfies readonly Transition['type'][];

function isTrackType(value: unknown): value is TimelineTrack['type'] {
  return isOneOf(value, TRACK_TYPES);
}

function isElementType(value: unknown): value is TimelineElement['type'] {
  return isOneOf(value, ELEMENT_TYPES);
}

function isBlendModeType(value: unknown): value is TimelineElement['blendMode'] {
  return isOneOf(value, BLEND_MODE_TYPES);
}

function isEasingType(value: unknown): value is EasingType {
  return isOneOf(value, EASING_TYPES);
}

function isEffectKeyframeEasing(value: unknown): value is EffectParameterKeyframe['easing'] {
  return isOneOf(value, EFFECT_KEYFRAME_EASING_TYPES);
}

function isTransitionType(value: unknown): value is Transition['type'] {
  return isOneOf(value, TRANSITION_TYPES);
}

function isTransitionDirection(
  value: unknown,
): value is NonNullable<Transition['params']>['direction'] {
  return value === 'left' || value === 'right' || value === 'up' || value === 'down';
}

function isMediaType(
  value: unknown,
): value is Extract<TimelineElement, { type: 'media' }>['mediaType'] {
  return value === 'video' || value === 'image';
}

function isTextAlign(
  value: unknown,
): value is Extract<TimelineElement, { type: 'text' }>['textAlign'] {
  return value === 'left' || value === 'center' || value === 'right';
}

function isFontWeight(
  value: unknown,
): value is Extract<TimelineElement, { type: 'text' }>['fontWeight'] {
  return value === 'normal' || value === 'bold';
}

function isFontStyle(
  value: unknown,
): value is Extract<TimelineElement, { type: 'text' }>['fontStyle'] {
  return value === 'normal' || value === 'italic';
}

function isTextDecoration(
  value: unknown,
): value is NonNullable<Extract<TimelineElement, { type: 'text' }>['textDecoration']> {
  return value === 'none' || value === 'underline' || value === 'line-through';
}

function isKnownAudioEffectTypeValue(value: unknown): value is AudioEffectSnapshot['type'] {
  return typeof value === 'string' && isKnownAudioEffectType(value);
}

function isEngineAudioEffectTypeValue(
  value: unknown,
): value is AudioTrackMixState['effectChain'][number]['effectType'] {
  return typeof value === 'string' && isEngineAudioEffectType(value);
}

function isAutomationCurve(value: unknown): value is AudioAutomationCurve {
  return value === 'linear' || value === 'hold' || value === 'exponential';
}

function isNumberTuple<T extends number>(
  value: unknown,
  length: T,
): value is ExtractNumberTuple<T> {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => typeof item === 'number')
  );
}

type ExtractNumberTuple<T extends number> = T extends 3
  ? [number, number, number]
  : T extends 4
    ? [number, number, number, number]
    : T extends 2
      ? [number, number]
      : number[];

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'number');
}

function isEffectParameterValue(
  value: unknown,
): value is string | number | boolean | [number, number] {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    isNumberTuple(value, 2)
  );
}
