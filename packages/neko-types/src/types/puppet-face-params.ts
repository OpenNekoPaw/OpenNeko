// =============================================================================
// 2D Puppet Standard Face Parameters — Template for Inochi2D models
//
// Defines ≥30 standard face parameters organized by category.
// Puppet models should pre-embed deform parameters matching these names
// in Inochi2D Creator for full face customization support.
//
// See: docs/guides/inochi2d-face-parameter-guide.md
// =============================================================================

// ── Categories ───────────────────────────────────────────────────────────────

/** Face parameter category for grouping sliders */
export type PuppetFaceCategory =
  | 'face_shape'
  | 'eyes'
  | 'eyebrows'
  | 'nose'
  | 'mouth'
  | 'ears'
  | 'expression';

/** Category display metadata */
export interface PuppetFaceCategoryMeta {
  readonly zh: string;
  readonly en: string;
  readonly icon: string;
}

/** Category metadata lookup */
export const PUPPET_FACE_CATEGORIES: Readonly<Record<PuppetFaceCategory, PuppetFaceCategoryMeta>> =
  {
    face_shape: { zh: '脸型', en: 'Face Shape', icon: '🎭' },
    eyes: { zh: '眼睛', en: 'Eyes', icon: '👁' },
    eyebrows: { zh: '眉毛', en: 'Eyebrows', icon: '🤨' },
    nose: { zh: '鼻子', en: 'Nose', icon: '👃' },
    mouth: { zh: '嘴巴', en: 'Mouth', icon: '👄' },
    ears: { zh: '耳朵', en: 'Ears', icon: '👂' },
    expression: { zh: '表情微调', en: 'Expression', icon: '😊' },
  } as const;

// ── Parameter Definition ─────────────────────────────────────────────────────

/** A single standard face parameter definition */
export interface PuppetFaceParameter {
  /** Stable machine-readable key (used as Record key) */
  readonly id: string;
  /** Inochi2D parameter name to bind (model must use this name) */
  readonly name: string;
  /** Chinese label */
  readonly label_zh: string;
  /** English label */
  readonly label_en: string;
  /** Category for UI grouping */
  readonly category: PuppetFaceCategory;
  /** Minimum value */
  readonly min: number;
  /** Maximum value */
  readonly max: number;
  /** Default (neutral) value */
  readonly default: number;
  /** Slider step increment */
  readonly step: number;
}

// ── Standard Parameter Inventory (32 total) ──────────────────────────────────

export const PUPPET_FACE_PARAMETERS: readonly PuppetFaceParameter[] = [
  // ── Face Shape (6) ──
  {
    id: 'faceWidth',
    name: 'face_width',
    label_zh: '脸宽',
    label_en: 'Face Width',
    category: 'face_shape',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'faceLength',
    name: 'face_length',
    label_zh: '脸长',
    label_en: 'Face Length',
    category: 'face_shape',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'cheekbones',
    name: 'cheekbones',
    label_zh: '颧骨',
    label_en: 'Cheekbones',
    category: 'face_shape',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'jawWidth',
    name: 'jaw_width',
    label_zh: '下颌宽度',
    label_en: 'Jaw Width',
    category: 'face_shape',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'chinSharpness',
    name: 'chin_sharpness',
    label_zh: '下巴尖度',
    label_en: 'Chin Sharpness',
    category: 'face_shape',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'chinLength',
    name: 'chin_length',
    label_zh: '下巴长度',
    label_en: 'Chin Length',
    category: 'face_shape',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },

  // ── Eyes (7) ──
  {
    id: 'eyeOpenL',
    name: 'eye_open_l',
    label_zh: '左眼开合',
    label_en: 'Left Eye Open',
    category: 'eyes',
    min: 0,
    max: 1,
    default: 1,
    step: 0.01,
  },
  {
    id: 'eyeOpenR',
    name: 'eye_open_r',
    label_zh: '右眼开合',
    label_en: 'Right Eye Open',
    category: 'eyes',
    min: 0,
    max: 1,
    default: 1,
    step: 0.01,
  },
  {
    id: 'eyeDistance',
    name: 'eye_distance',
    label_zh: '眼距',
    label_en: 'Eye Distance',
    category: 'eyes',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'eyeSize',
    name: 'eye_size',
    label_zh: '眼睛大小',
    label_en: 'Eye Size',
    category: 'eyes',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'eyeAngle',
    name: 'eye_angle',
    label_zh: '眼角上扬',
    label_en: 'Eye Angle',
    category: 'eyes',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'pupilSize',
    name: 'pupil_size',
    label_zh: '瞳孔大小',
    label_en: 'Pupil Size',
    category: 'eyes',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'irisColor',
    name: 'iris_color',
    label_zh: '虹膜色调',
    label_en: 'Iris Color',
    category: 'eyes',
    min: 0,
    max: 1,
    default: 0.5,
    step: 0.01,
  },

  // ── Eyebrows (6) ──
  {
    id: 'browHeight',
    name: 'brow_height',
    label_zh: '眉高',
    label_en: 'Brow Height',
    category: 'eyebrows',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'browDistance',
    name: 'brow_distance',
    label_zh: '眉距',
    label_en: 'Brow Distance',
    category: 'eyebrows',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'browThickness',
    name: 'brow_thickness',
    label_zh: '眉粗',
    label_en: 'Brow Thickness',
    category: 'eyebrows',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'browCurve',
    name: 'brow_curve',
    label_zh: '眉弯',
    label_en: 'Brow Curve',
    category: 'eyebrows',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'browAngleL',
    name: 'brow_angle_l',
    label_zh: '左眉角度',
    label_en: 'Left Brow Angle',
    category: 'eyebrows',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'browAngleR',
    name: 'brow_angle_r',
    label_zh: '右眉角度',
    label_en: 'Right Brow Angle',
    category: 'eyebrows',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },

  // ── Nose (4) ──
  {
    id: 'noseHeight',
    name: 'nose_height',
    label_zh: '鼻高',
    label_en: 'Nose Height',
    category: 'nose',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'noseWidth',
    name: 'nose_width',
    label_zh: '鼻宽',
    label_en: 'Nose Width',
    category: 'nose',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'noseTip',
    name: 'nose_tip',
    label_zh: '鼻尖',
    label_en: 'Nose Tip',
    category: 'nose',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'nostrilFlare',
    name: 'nostril_flare',
    label_zh: '鼻翼',
    label_en: 'Nostril Flare',
    category: 'nose',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },

  // ── Mouth (5) ──
  {
    id: 'mouthWidth',
    name: 'mouth_width',
    label_zh: '嘴宽',
    label_en: 'Mouth Width',
    category: 'mouth',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'lipThickness',
    name: 'lip_thickness',
    label_zh: '唇厚',
    label_en: 'Lip Thickness',
    category: 'mouth',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'mouthCorner',
    name: 'mouth_corner',
    label_zh: '嘴角',
    label_en: 'Mouth Corner',
    category: 'mouth',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'cupidsBow',
    name: 'cupids_bow',
    label_zh: '唇弓',
    label_en: "Cupid's Bow",
    category: 'mouth',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'mouthOpen',
    name: 'mouth_open',
    label_zh: '张嘴',
    label_en: 'Mouth Open',
    category: 'mouth',
    min: 0,
    max: 1,
    default: 0,
    step: 0.01,
  },

  // ── Ears (2) ──
  {
    id: 'earSize',
    name: 'ear_size',
    label_zh: '耳大小',
    label_en: 'Ear Size',
    category: 'ears',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'earAngle',
    name: 'ear_angle',
    label_zh: '耳角度',
    label_en: 'Ear Angle',
    category: 'ears',
    min: -1,
    max: 1,
    default: 0,
    step: 0.01,
  },

  // ── Expression (2) ──
  {
    id: 'blushIntensity',
    name: 'blush_intensity',
    label_zh: '腮红强度',
    label_en: 'Blush Intensity',
    category: 'expression',
    min: 0,
    max: 1,
    default: 0,
    step: 0.01,
  },
  {
    id: 'expressionWeight',
    name: 'expression_weight',
    label_zh: '表情权重',
    label_en: 'Expression Weight',
    category: 'expression',
    min: 0,
    max: 1,
    default: 0,
    step: 0.01,
  },
] as const;

// ── Utility Functions ────────────────────────────────────────────────────────

/** Get parameters filtered by category */
export function getPuppetParamsByCategory(
  category: PuppetFaceCategory,
): readonly PuppetFaceParameter[] {
  return PUPPET_FACE_PARAMETERS.filter((p) => p.category === category);
}

/** Get default values for all standard face parameters */
export function getDefaultPuppetFaceParams(): Record<string, number> {
  const defaults: Record<string, number> = {};
  for (const p of PUPPET_FACE_PARAMETERS) {
    defaults[p.id] = p.default;
  }
  return defaults;
}

/** Look up a parameter by its stable ID */
export function getPuppetFaceParameter(id: string): PuppetFaceParameter | undefined {
  return PUPPET_FACE_PARAMETERS.find((p) => p.id === id);
}

/** Look up a parameter by its Inochi2D name */
export function getPuppetFaceParameterByName(name: string): PuppetFaceParameter | undefined {
  return PUPPET_FACE_PARAMETERS.find((p) => p.name === name);
}

/** All categories in display order */
export const PUPPET_FACE_CATEGORY_ORDER: readonly PuppetFaceCategory[] = [
  'face_shape',
  'eyes',
  'eyebrows',
  'nose',
  'mouth',
  'ears',
  'expression',
] as const;
