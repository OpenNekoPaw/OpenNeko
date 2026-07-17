/**
 * Audio Effects Types
 * 音频特效类型定义
 */

// =============================================================================
// Audio Effect Types
// =============================================================================

/**
 * Audio effect types
 */
export type AudioEffectType =
  | 'noise-reduction' // 降噪
  | 'compressor' // 压缩器
  | 'limiter' // 限制器
  | 'reverb' // 混响
  | 'delay' // 延迟/回声
  | 'chorus' // 合唱
  | 'distortion' // 失真
  | 'pitch-shift' // 音高调整
  | 'time-stretch' // 时间拉伸
  | 'high-pass' // 高通滤波器
  | 'low-pass' // 低通滤波器
  | 'band-pass'; // 带通滤波器

/**
 * Audio effect category
 */
export type AudioEffectCategory =
  | 'dynamics' // 动态处理
  | 'filter' // 滤波器
  | 'spatial' // 空间效果
  | 'modulation' // 调制
  | 'utility'; // 实用工具

// =============================================================================
// Audio Effect Parameters
// =============================================================================

/**
 * Noise Reduction parameters
 */
export interface NoiseReductionParams {
  /** Noise reduction amount (0-1) */
  amount: number;
  /** Frequency threshold (20-20000 Hz) */
  threshold: number;
  /** Smoothing (0-1) */
  smoothing: number;
}

/**
 * Compressor parameters
 */
export interface CompressorParams {
  /** Threshold in dB (-60 to 0) */
  threshold: number;
  /** Ratio (1 to 20) */
  ratio: number;
  /** Attack time in ms (0-1000) */
  attack: number;
  /** Release time in ms (0-3000) */
  release: number;
  /** Knee (0-40 dB) */
  knee: number;
  /** Makeup gain in dB (0-40) */
  makeupGain: number;
}

/**
 * Limiter parameters
 */
export interface LimiterParams {
  /** Threshold in dB (-20 to 0) */
  threshold: number;
  /** Release time in ms (0-1000) */
  release: number;
  /** Output ceiling in dB (-1 to 0) */
  ceiling: number;
}

/**
 * Reverb parameters
 */
export interface ReverbParams {
  /** Room size (0-1) */
  roomSize: number;
  /** Damping (0-1) */
  damping: number;
  /** Wet/dry mix (0-1) */
  wetDry: number;
  /** Stereo width (0-1) */
  width: number;
  /** Pre-delay in ms (0-500) */
  preDelay: number;
  /** Type */
  type: 'room' | 'hall' | 'plate' | 'spring' | 'chamber';
}

/**
 * Delay parameters
 */
export interface DelayParams {
  /** Delay time in ms (0-2000) */
  delayTime: number;
  /** Feedback (0-1) */
  feedback: number;
  /** Wet/dry mix (0-1) */
  wetDry: number;
  /** Stereo */
  stereo: boolean;
  /** Ping-pong mode */
  pingPong: boolean;
}

/**
 * Chorus parameters
 */
export interface ChorusParams {
  /** Rate in Hz (0.1-10) */
  rate: number;
  /** Depth (0-1) */
  depth: number;
  /** Delay in ms (0-50) */
  delay: number;
  /** Feedback (0-1) */
  feedback: number;
  /** Wet/dry mix (0-1) */
  wetDry: number;
}

/**
 * Distortion parameters
 */
export interface DistortionParams {
  /** Drive amount (0-1) */
  drive: number;
  /** Output gain (0-1) */
  outputGain: number;
  /** Type */
  type: 'soft' | 'hard' | 'tube' | 'fuzz';
}

/**
 * Pitch Shift parameters
 */
export interface PitchShiftParams {
  /** Pitch shift in semitones (-12 to +12) */
  semitones: number;
  /** Preserve formants */
  preserveFormants: boolean;
}

/**
 * Time Stretch parameters
 */
export interface TimeStretchParams {
  /** Time stretch ratio (0.5-2) */
  ratio: number;
  /** Preserve pitch */
  preservePitch: boolean;
}

/**
 * High-Pass Filter parameters
 */
export interface HighPassParams {
  /** Cutoff frequency in Hz (20-20000) */
  frequency: number;
  /** Resonance (0-20) */
  resonance: number;
}

/**
 * Low-Pass Filter parameters
 */
export interface LowPassParams {
  /** Cutoff frequency in Hz (20-20000) */
  frequency: number;
  /** Resonance (0-20) */
  resonance: number;
}

/**
 * Band-Pass Filter parameters
 */
export interface BandPassParams {
  /** Center frequency in Hz (20-20000) */
  frequency: number;
  /** Bandwidth in octaves (0.1-5) */
  bandwidth: number;
  /** Gain in dB (-20 to +20) */
  gain: number;
}

/**
 * Union type of all audio effect parameters
 */
export type AudioEffectParams =
  | NoiseReductionParams
  | CompressorParams
  | LimiterParams
  | ReverbParams
  | DelayParams
  | ChorusParams
  | DistortionParams
  | PitchShiftParams
  | TimeStretchParams
  | HighPassParams
  | LowPassParams
  | BandPassParams;

// =============================================================================
// Audio Effect Instance
// =============================================================================

/**
 * Audio effect instance
 */
export interface AudioEffectInstance {
  /** Unique ID */
  id: string;
  /** Effect type */
  type: AudioEffectType;
  /** Effect name */
  name: string;
  /** Whether enabled */
  enabled: boolean;
  /** Effect parameters */
  params: AudioEffectParams;
}

/**
 * Audio effect definition
 */
export interface AudioEffectDefinition {
  /** Effect type */
  type: AudioEffectType;
  /** Display name key (for i18n) */
  nameKey: string;
  /** Description key (for i18n) */
  descriptionKey: string;
  /** Category */
  category: AudioEffectCategory;
  /** Default parameters */
  defaultParams: AudioEffectParams;
  /** Parameter definitions */
  parameterDefinitions: AudioEffectParameterDefinition[];
}

/**
 * Audio effect parameter definition
 */
export interface AudioEffectParameterDefinition {
  /** Parameter key */
  key: string;
  /** Label key (for i18n) */
  labelKey: string;
  /** Parameter type */
  type: 'slider' | 'select' | 'boolean';
  /** Min value (for slider) */
  min?: number;
  /** Max value (for slider) */
  max?: number;
  /** Step (for slider) */
  step?: number;
  /** Unit (for display) */
  unit?: string;
  /** Options (for select) */
  options?: Array<{ value: string; labelKey: string }>;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create audio effect instance
 */
export function createAudioEffectInstance(
  type: AudioEffectType,
  name?: string,
): AudioEffectInstance {
  const definition = AUDIO_EFFECT_DEFINITIONS[type];
  if (!definition) {
    throw new Error(`Unknown audio effect type: ${type}`);
  }

  return {
    id: `audio-effect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    name: name || type,
    enabled: true,
    params: { ...definition.defaultParams },
  };
}

/**
 * Get audio effect definition
 */
export function getAudioEffectDefinition(type: AudioEffectType): AudioEffectDefinition | undefined {
  return AUDIO_EFFECT_DEFINITIONS[type];
}

// =============================================================================
// Built-in Audio Effects
// =============================================================================

export const AUDIO_EFFECT_DEFINITIONS: Record<AudioEffectType, AudioEffectDefinition> = {
  'noise-reduction': {
    type: 'noise-reduction',
    nameKey: 'audioEffects.noiseReduction',
    descriptionKey: 'audioEffects.noiseReduction.description',
    category: 'utility',
    defaultParams: {
      amount: 0.5,
      threshold: 1000,
      smoothing: 0.5,
    },
    parameterDefinitions: [
      {
        key: 'amount',
        labelKey: 'audioEffects.params.amount',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: 'threshold',
        labelKey: 'audioEffects.params.threshold',
        type: 'slider',
        min: 20,
        max: 20000,
        step: 10,
        unit: 'Hz',
      },
      {
        key: 'smoothing',
        labelKey: 'audioEffects.params.smoothing',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
  },

  compressor: {
    type: 'compressor',
    nameKey: 'audioEffects.compressor',
    descriptionKey: 'audioEffects.compressor.description',
    category: 'dynamics',
    defaultParams: {
      threshold: -24,
      ratio: 4,
      attack: 10,
      release: 100,
      knee: 10,
      makeupGain: 0,
    },
    parameterDefinitions: [
      {
        key: 'threshold',
        labelKey: 'audioEffects.params.threshold',
        type: 'slider',
        min: -60,
        max: 0,
        step: 1,
        unit: 'dB',
      },
      {
        key: 'ratio',
        labelKey: 'audioEffects.params.ratio',
        type: 'slider',
        min: 1,
        max: 20,
        step: 0.5,
      },
      {
        key: 'attack',
        labelKey: 'audioEffects.params.attack',
        type: 'slider',
        min: 0,
        max: 1000,
        step: 1,
        unit: 'ms',
      },
      {
        key: 'release',
        labelKey: 'audioEffects.params.release',
        type: 'slider',
        min: 0,
        max: 3000,
        step: 10,
        unit: 'ms',
      },
      {
        key: 'knee',
        labelKey: 'audioEffects.params.knee',
        type: 'slider',
        min: 0,
        max: 40,
        step: 1,
        unit: 'dB',
      },
      {
        key: 'makeupGain',
        labelKey: 'audioEffects.params.makeupGain',
        type: 'slider',
        min: 0,
        max: 40,
        step: 1,
        unit: 'dB',
      },
    ],
  },

  limiter: {
    type: 'limiter',
    nameKey: 'audioEffects.limiter',
    descriptionKey: 'audioEffects.limiter.description',
    category: 'dynamics',
    defaultParams: {
      threshold: -6,
      release: 50,
      ceiling: -0.3,
    },
    parameterDefinitions: [
      {
        key: 'threshold',
        labelKey: 'audioEffects.params.threshold',
        type: 'slider',
        min: -20,
        max: 0,
        step: 0.1,
        unit: 'dB',
      },
      {
        key: 'release',
        labelKey: 'audioEffects.params.release',
        type: 'slider',
        min: 0,
        max: 1000,
        step: 5,
        unit: 'ms',
      },
      {
        key: 'ceiling',
        labelKey: 'audioEffects.params.ceiling',
        type: 'slider',
        min: -1,
        max: 0,
        step: 0.1,
        unit: 'dB',
      },
    ],
  },

  reverb: {
    type: 'reverb',
    nameKey: 'audioEffects.reverb',
    descriptionKey: 'audioEffects.reverb.description',
    category: 'spatial',
    defaultParams: {
      roomSize: 0.5,
      damping: 0.5,
      wetDry: 0.3,
      width: 1,
      preDelay: 0,
      type: 'room',
    },
    parameterDefinitions: [
      {
        key: 'type',
        labelKey: 'audioEffects.params.type',
        type: 'select',
        options: [
          { value: 'room', labelKey: 'audioEffects.reverbType.room' },
          { value: 'hall', labelKey: 'audioEffects.reverbType.hall' },
          { value: 'plate', labelKey: 'audioEffects.reverbType.plate' },
          { value: 'spring', labelKey: 'audioEffects.reverbType.spring' },
          { value: 'chamber', labelKey: 'audioEffects.reverbType.chamber' },
        ],
      },
      {
        key: 'roomSize',
        labelKey: 'audioEffects.params.roomSize',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: 'damping',
        labelKey: 'audioEffects.params.damping',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: 'wetDry',
        labelKey: 'audioEffects.params.wetDry',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: 'width',
        labelKey: 'audioEffects.params.width',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: 'preDelay',
        labelKey: 'audioEffects.params.preDelay',
        type: 'slider',
        min: 0,
        max: 500,
        step: 5,
        unit: 'ms',
      },
    ],
  },

  delay: {
    type: 'delay',
    nameKey: 'audioEffects.delay',
    descriptionKey: 'audioEffects.delay.description',
    category: 'spatial',
    defaultParams: {
      delayTime: 500,
      feedback: 0.3,
      wetDry: 0.3,
      stereo: true,
      pingPong: false,
    },
    parameterDefinitions: [
      {
        key: 'delayTime',
        labelKey: 'audioEffects.params.delayTime',
        type: 'slider',
        min: 0,
        max: 2000,
        step: 10,
        unit: 'ms',
      },
      {
        key: 'feedback',
        labelKey: 'audioEffects.params.feedback',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: 'wetDry',
        labelKey: 'audioEffects.params.wetDry',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
      },
      { key: 'stereo', labelKey: 'audioEffects.params.stereo', type: 'boolean' },
      { key: 'pingPong', labelKey: 'audioEffects.params.pingPong', type: 'boolean' },
    ],
  },

  chorus: {
    type: 'chorus',
    nameKey: 'audioEffects.chorus',
    descriptionKey: 'audioEffects.chorus.description',
    category: 'modulation',
    defaultParams: {
      rate: 1.5,
      depth: 0.5,
      delay: 25,
      feedback: 0.2,
      wetDry: 0.5,
    },
    parameterDefinitions: [
      {
        key: 'rate',
        labelKey: 'audioEffects.params.rate',
        type: 'slider',
        min: 0.1,
        max: 10,
        step: 0.1,
        unit: 'Hz',
      },
      {
        key: 'depth',
        labelKey: 'audioEffects.params.depth',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: 'delay',
        labelKey: 'audioEffects.params.delay',
        type: 'slider',
        min: 0,
        max: 50,
        step: 1,
        unit: 'ms',
      },
      {
        key: 'feedback',
        labelKey: 'audioEffects.params.feedback',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: 'wetDry',
        labelKey: 'audioEffects.params.wetDry',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
  },

  distortion: {
    type: 'distortion',
    nameKey: 'audioEffects.distortion',
    descriptionKey: 'audioEffects.distortion.description',
    category: 'modulation',
    defaultParams: {
      drive: 0.5,
      outputGain: 0.5,
      type: 'soft',
    },
    parameterDefinitions: [
      {
        key: 'type',
        labelKey: 'audioEffects.params.type',
        type: 'select',
        options: [
          { value: 'soft', labelKey: 'audioEffects.distortionType.soft' },
          { value: 'hard', labelKey: 'audioEffects.distortionType.hard' },
          { value: 'tube', labelKey: 'audioEffects.distortionType.tube' },
          { value: 'fuzz', labelKey: 'audioEffects.distortionType.fuzz' },
        ],
      },
      {
        key: 'drive',
        labelKey: 'audioEffects.params.drive',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: 'outputGain',
        labelKey: 'audioEffects.params.outputGain',
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
  },

  'pitch-shift': {
    type: 'pitch-shift',
    nameKey: 'audioEffects.pitchShift',
    descriptionKey: 'audioEffects.pitchShift.description',
    category: 'utility',
    defaultParams: {
      semitones: 0,
      preserveFormants: true,
    },
    parameterDefinitions: [
      {
        key: 'semitones',
        labelKey: 'audioEffects.params.semitones',
        type: 'slider',
        min: -12,
        max: 12,
        step: 0.1,
      },
      {
        key: 'preserveFormants',
        labelKey: 'audioEffects.params.preserveFormants',
        type: 'boolean',
      },
    ],
  },

  'time-stretch': {
    type: 'time-stretch',
    nameKey: 'audioEffects.timeStretch',
    descriptionKey: 'audioEffects.timeStretch.description',
    category: 'utility',
    defaultParams: {
      ratio: 1,
      preservePitch: true,
    },
    parameterDefinitions: [
      {
        key: 'ratio',
        labelKey: 'audioEffects.params.ratio',
        type: 'slider',
        min: 0.5,
        max: 2,
        step: 0.01,
      },
      { key: 'preservePitch', labelKey: 'audioEffects.params.preservePitch', type: 'boolean' },
    ],
  },

  'high-pass': {
    type: 'high-pass',
    nameKey: 'audioEffects.highPass',
    descriptionKey: 'audioEffects.highPass.description',
    category: 'filter',
    defaultParams: {
      frequency: 80,
      resonance: 1,
    },
    parameterDefinitions: [
      {
        key: 'frequency',
        labelKey: 'audioEffects.params.frequency',
        type: 'slider',
        min: 20,
        max: 20000,
        step: 10,
        unit: 'Hz',
      },
      {
        key: 'resonance',
        labelKey: 'audioEffects.params.resonance',
        type: 'slider',
        min: 0,
        max: 20,
        step: 0.1,
      },
    ],
  },

  'low-pass': {
    type: 'low-pass',
    nameKey: 'audioEffects.lowPass',
    descriptionKey: 'audioEffects.lowPass.description',
    category: 'filter',
    defaultParams: {
      frequency: 5000,
      resonance: 1,
    },
    parameterDefinitions: [
      {
        key: 'frequency',
        labelKey: 'audioEffects.params.frequency',
        type: 'slider',
        min: 20,
        max: 20000,
        step: 10,
        unit: 'Hz',
      },
      {
        key: 'resonance',
        labelKey: 'audioEffects.params.resonance',
        type: 'slider',
        min: 0,
        max: 20,
        step: 0.1,
      },
    ],
  },

  'band-pass': {
    type: 'band-pass',
    nameKey: 'audioEffects.bandPass',
    descriptionKey: 'audioEffects.bandPass.description',
    category: 'filter',
    defaultParams: {
      frequency: 1000,
      bandwidth: 1,
      gain: 0,
    },
    parameterDefinitions: [
      {
        key: 'frequency',
        labelKey: 'audioEffects.params.frequency',
        type: 'slider',
        min: 20,
        max: 20000,
        step: 10,
        unit: 'Hz',
      },
      {
        key: 'bandwidth',
        labelKey: 'audioEffects.params.bandwidth',
        type: 'slider',
        min: 0.1,
        max: 5,
        step: 0.1,
        unit: 'oct',
      },
      {
        key: 'gain',
        labelKey: 'audioEffects.params.gain',
        type: 'slider',
        min: -20,
        max: 20,
        step: 0.5,
        unit: 'dB',
      },
    ],
  },
};
