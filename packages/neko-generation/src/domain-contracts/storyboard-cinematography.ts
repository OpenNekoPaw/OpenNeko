import type { CreativeEntityRef } from '@neko-entity/domain';

export type ShotScale = 'ECU' | 'CU' | 'MCU' | 'MS' | 'MLS' | 'LS' | 'VLS' | 'ELS' | 'OTS' | 'POV';

export type CameraMovement =
  | 'static'
  | 'pan'
  | 'tilt'
  | 'zoom-in'
  | 'zoom-out'
  | 'dolly'
  | 'dolly-in'
  | 'dolly-out'
  | 'handheld'
  | 'crane';

export type CameraAngle = 'eye-level' | 'high-angle' | 'low-angle' | 'bird-eye' | 'dutch';

export interface ShotCharacter {
  characterId?: string;
  characterName: string;
  entityRef?: CreativeEntityRef;
  candidateId?: string;
  role?: string;
  action?: string;
  referenceNodeId?: string;
  referenceChain?: string[];
  emotion?: string;
  continuityNotes?: string;
  appearanceNotes?: string;
}
