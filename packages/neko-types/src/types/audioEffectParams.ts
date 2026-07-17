// =============================================================================
// Audio Effect Parameter Metadata — shared automation contract
// =============================================================================

import { ENGINE_AUDIO_EFFECT_TYPES, type RenderableAudioEffectType } from './audioMix';

export type AudioEffectParameterValueKind = 'number' | 'boolean' | 'string' | 'object';

export interface AudioEffectParameterOption {
  value: string;
  labelKey?: string;
}

export interface AudioEffectParameterMetadata {
  effectType: RenderableAudioEffectType;
  key: string;
  valueKind: AudioEffectParameterValueKind;
  defaultValue: unknown;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  automatable: boolean;
  labelKey?: string;
  options?: AudioEffectParameterOption[];
}

export type AudioEffectParameterRegistry = Readonly<
  Record<RenderableAudioEffectType, readonly AudioEffectParameterMetadata[]>
>;

type AudioEffectParameterMetadataInput = Omit<AudioEffectParameterMetadata, 'effectType'>;

type NumberParamInput = Omit<
  AudioEffectParameterMetadataInput,
  'key' | 'valueKind' | 'automatable'
> &
  Required<Pick<AudioEffectParameterMetadata, 'min' | 'max'>>;

type NonNumericParamInput = Omit<
  AudioEffectParameterMetadataInput,
  'key' | 'valueKind' | 'automatable'
> & {
  valueKind: Exclude<AudioEffectParameterValueKind, 'number'>;
};

const AUDIO_EFFECT_PARAMETER_METADATA_INPUT = {
  gain: [
    numberParam('gain', {
      defaultValue: 0,
      min: -60,
      max: 24,
      step: 0.1,
      unit: 'dB',
      labelKey: 'audioEffects.params.gain',
    }),
    numberParam('gainDb', {
      defaultValue: 0,
      min: -60,
      max: 24,
      step: 0.1,
      unit: 'dB',
      labelKey: 'audioEffects.params.gain',
    }),
  ],
  'high-pass': [frequencyParam(), resonanceParam(), qParam()],
  'low-pass': [frequencyParam(8000), resonanceParam(), qParam()],
  'band-pass': [
    frequencyParam(),
    numberParam('bandwidth', {
      defaultValue: 1,
      min: 0.1,
      max: 5,
      step: 0.1,
      unit: 'oct',
      labelKey: 'audioEffects.params.bandwidth',
    }),
    qParam(),
  ],
  notch: [frequencyParam(), qParam()],
  peaking: [frequencyParam(), qParam(), gainDbParam(), gainParam()],
  'low-shelf': [frequencyParam(200), qParam(0.707), gainDbParam(), gainParam()],
  'high-shelf': [frequencyParam(4000), qParam(0.707), gainDbParam(), gainParam()],
  'parametric-eq': [
    nonNumericParam('bands', {
      valueKind: 'object',
      defaultValue: [],
      labelKey: 'audioEffects.params.bands',
    }),
  ],
  compressor: [
    numberParam('threshold', {
      defaultValue: -24,
      min: -60,
      max: 0,
      step: 1,
      unit: 'dB',
      labelKey: 'audioEffects.params.threshold',
    }),
    numberParam('ratio', {
      defaultValue: 4,
      min: 1,
      max: 20,
      step: 0.5,
      labelKey: 'audioEffects.params.ratio',
    }),
    numberParam('attack', {
      defaultValue: 10,
      min: 0,
      max: 1000,
      step: 1,
      unit: 'ms',
      labelKey: 'audioEffects.params.attack',
    }),
    numberParam('release', {
      defaultValue: 100,
      min: 0,
      max: 3000,
      step: 10,
      unit: 'ms',
      labelKey: 'audioEffects.params.release',
    }),
    numberParam('knee', {
      defaultValue: 6,
      min: 0,
      max: 40,
      step: 1,
      unit: 'dB',
      labelKey: 'audioEffects.params.knee',
    }),
    numberParam('makeupGain', {
      defaultValue: 0,
      min: 0,
      max: 40,
      step: 1,
      unit: 'dB',
      labelKey: 'audioEffects.params.makeupGain',
    }),
  ],
  'noise-gate': [
    numberParam('threshold', {
      defaultValue: -40,
      min: -80,
      max: 0,
      step: 1,
      unit: 'dB',
      labelKey: 'audioEffects.params.threshold',
    }),
    numberParam('attack', {
      defaultValue: 1,
      min: 0,
      max: 1000,
      step: 1,
      unit: 'ms',
      labelKey: 'audioEffects.params.attack',
    }),
    numberParam('hold', {
      defaultValue: 50,
      min: 0,
      max: 3000,
      step: 10,
      unit: 'ms',
      labelKey: 'audioEffects.params.hold',
    }),
    numberParam('release', {
      defaultValue: 100,
      min: 0,
      max: 3000,
      step: 10,
      unit: 'ms',
      labelKey: 'audioEffects.params.release',
    }),
  ],
  limiter: [
    numberParam('threshold', {
      defaultValue: 0.95,
      min: 0,
      max: 1,
      step: 0.01,
      labelKey: 'audioEffects.params.threshold',
    }),
    numberParam('ceiling', {
      defaultValue: 1,
      min: 0,
      max: 1,
      step: 0.01,
      labelKey: 'audioEffects.params.ceiling',
    }),
    numberParam('release', {
      defaultValue: 50,
      min: 0,
      max: 1000,
      step: 5,
      unit: 'ms',
      labelKey: 'audioEffects.params.release',
    }),
  ],
  reverb: [
    numberParam('roomSize', {
      defaultValue: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      labelKey: 'audioEffects.params.roomSize',
    }),
    numberParam('damping', {
      defaultValue: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      labelKey: 'audioEffects.params.damping',
    }),
    numberParam('wetDry', {
      defaultValue: 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      labelKey: 'audioEffects.params.wetDry',
    }),
    numberParam('width', {
      defaultValue: 1,
      min: 0,
      max: 1,
      step: 0.01,
      labelKey: 'audioEffects.params.width',
    }),
    numberParam('preDelay', {
      defaultValue: 0,
      min: 0,
      max: 500,
      step: 5,
      unit: 'ms',
      labelKey: 'audioEffects.params.preDelay',
    }),
    nonNumericParam('type', {
      valueKind: 'string',
      defaultValue: 'room',
      labelKey: 'audioEffects.params.type',
      options: [
        { value: 'room', labelKey: 'audioEffects.reverbType.room' },
        { value: 'hall', labelKey: 'audioEffects.reverbType.hall' },
        { value: 'plate', labelKey: 'audioEffects.reverbType.plate' },
        { value: 'spring', labelKey: 'audioEffects.reverbType.spring' },
        { value: 'chamber', labelKey: 'audioEffects.reverbType.chamber' },
      ],
    }),
  ],
  delay: [
    numberParam('delayTime', {
      defaultValue: 500,
      min: 0,
      max: 2000,
      step: 10,
      unit: 'ms',
      labelKey: 'audioEffects.params.delayTime',
    }),
    numberParam('delayMs', {
      defaultValue: 250,
      min: 0,
      max: 2000,
      step: 10,
      unit: 'ms',
      labelKey: 'audioEffects.params.delayTime',
    }),
    numberParam('feedback', {
      defaultValue: 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      labelKey: 'audioEffects.params.feedback',
    }),
    numberParam('wetDry', {
      defaultValue: 0.3,
      min: 0,
      max: 1,
      step: 0.01,
      labelKey: 'audioEffects.params.wetDry',
    }),
    nonNumericParam('stereo', {
      valueKind: 'boolean',
      defaultValue: true,
      labelKey: 'audioEffects.params.stereo',
    }),
    nonNumericParam('pingPong', {
      valueKind: 'boolean',
      defaultValue: false,
      labelKey: 'audioEffects.params.pingPong',
    }),
  ],
  chorus: [
    numberParam('rate', {
      defaultValue: 1.5,
      min: 0.1,
      max: 10,
      step: 0.1,
      unit: 'Hz',
      labelKey: 'audioEffects.params.rate',
    }),
    numberParam('depth', {
      defaultValue: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      labelKey: 'audioEffects.params.depth',
    }),
    numberParam('delay', {
      defaultValue: 25,
      min: 0,
      max: 50,
      step: 1,
      unit: 'ms',
      labelKey: 'audioEffects.params.delay',
    }),
    numberParam('feedback', {
      defaultValue: 0.2,
      min: 0,
      max: 1,
      step: 0.01,
      labelKey: 'audioEffects.params.feedback',
    }),
    numberParam('wetDry', {
      defaultValue: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      labelKey: 'audioEffects.params.wetDry',
    }),
  ],
  distortion: [
    numberParam('drive', {
      defaultValue: 12,
      min: 0,
      max: 60,
      step: 0.1,
      unit: 'dB',
      labelKey: 'audioEffects.params.drive',
    }),
    numberParam('outputGain', {
      defaultValue: -6,
      min: -60,
      max: 20,
      step: 0.1,
      unit: 'dB',
      labelKey: 'audioEffects.params.outputGain',
    }),
    nonNumericParam('type', {
      valueKind: 'string',
      defaultValue: 'soft',
      labelKey: 'audioEffects.params.type',
      options: [
        { value: 'soft', labelKey: 'audioEffects.distortionType.soft' },
        { value: 'hard', labelKey: 'audioEffects.distortionType.hard' },
        { value: 'tube', labelKey: 'audioEffects.distortionType.tube' },
        { value: 'fuzz', labelKey: 'audioEffects.distortionType.fuzz' },
      ],
    }),
  ],
} as const satisfies Readonly<
  Record<RenderableAudioEffectType, readonly AudioEffectParameterMetadataInput[]>
>;

export const AUDIO_EFFECT_PARAMETER_METADATA: AudioEffectParameterRegistry =
  ENGINE_AUDIO_EFFECT_TYPES.reduce(
    (registry, effectType) => {
      registry[effectType] = AUDIO_EFFECT_PARAMETER_METADATA_INPUT[effectType].map((metadata) => ({
        effectType,
        ...metadata,
      }));
      return registry;
    },
    {} as Record<RenderableAudioEffectType, AudioEffectParameterMetadata[]>,
  );

export const AUTOMATABLE_AUDIO_TARGET_PARAMETERS = [
  { kind: 'track-volume', min: 0, max: 2, step: 0.01, defaultValue: 1 },
  { kind: 'track-pan', min: -1, max: 1, step: 0.01, defaultValue: 0 },
] as const;

export function getAudioEffectParameterMetadata(
  effectType: RenderableAudioEffectType,
  key: string,
): AudioEffectParameterMetadata | undefined {
  return AUDIO_EFFECT_PARAMETER_METADATA[effectType].find((metadata) => metadata.key === key);
}

export function getAutomatableAudioEffectParameters(
  effectType: RenderableAudioEffectType,
): readonly AudioEffectParameterMetadata[] {
  return AUDIO_EFFECT_PARAMETER_METADATA[effectType].filter((metadata) => metadata.automatable);
}

export function isAutomatableAudioEffectParameter(
  effectType: RenderableAudioEffectType,
  key: string,
): boolean {
  return getAudioEffectParameterMetadata(effectType, key)?.automatable === true;
}

export function isAudioEffectParameterValueInRange(
  metadata: AudioEffectParameterMetadata,
  value: number,
): boolean {
  if (metadata.valueKind !== 'number' || !metadata.automatable) {
    return false;
  }

  return (
    Number.isFinite(value) &&
    (metadata.min === undefined || value >= metadata.min) &&
    (metadata.max === undefined || value <= metadata.max)
  );
}

export function listAudioEffectParameterMetadata(): AudioEffectParameterMetadata[] {
  return ENGINE_AUDIO_EFFECT_TYPES.flatMap((effectType) => [
    ...AUDIO_EFFECT_PARAMETER_METADATA[effectType],
  ]);
}

function numberParam(key: string, input: NumberParamInput): AudioEffectParameterMetadataInput {
  return {
    ...input,
    key,
    valueKind: 'number',
    automatable: true,
  };
}

function nonNumericParam(
  key: string,
  input: NonNumericParamInput,
): AudioEffectParameterMetadataInput {
  return {
    ...input,
    key,
    automatable: false,
  };
}

function frequencyParam(defaultValue = 1000): AudioEffectParameterMetadataInput {
  return numberParam('frequency', {
    defaultValue,
    min: 20,
    max: 20000,
    step: 10,
    unit: 'Hz',
    labelKey: 'audioEffects.params.frequency',
  });
}

function resonanceParam(defaultValue = 1): AudioEffectParameterMetadataInput {
  return numberParam('resonance', {
    defaultValue,
    min: 0,
    max: 20,
    step: 0.1,
    labelKey: 'audioEffects.params.resonance',
  });
}

function qParam(defaultValue = 1): AudioEffectParameterMetadataInput {
  return numberParam('q', {
    defaultValue,
    min: 0.1,
    max: 20,
    step: 0.1,
    labelKey: 'audioEffects.params.q',
  });
}

function gainParam(defaultValue = 0): AudioEffectParameterMetadataInput {
  return numberParam('gain', {
    defaultValue,
    min: -20,
    max: 20,
    step: 0.1,
    unit: 'dB',
    labelKey: 'audioEffects.params.gain',
  });
}

function gainDbParam(defaultValue = 0): AudioEffectParameterMetadataInput {
  return numberParam('gainDb', {
    defaultValue,
    min: -20,
    max: 20,
    step: 0.1,
    unit: 'dB',
    labelKey: 'audioEffects.params.gain',
  });
}
