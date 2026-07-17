/**
 * Neko Puppet Motion Preset (.nkpm) — reusable animation/expression preset format.
 *
 * Uses Live2D standard parameter names for cross-model compatibility.
 * Can be shared via neko-market as 'puppet-motion' asset type.
 *
 * File extension: .nkpm (JSON)
 */

/** A single parameter binding in the preset */
export interface PuppetMotionParameter {
  /** Parameter ID as used in the puppet model (e.g., "ParamMouthForm") */
  id: string;
  /** Standardized name for cross-model matching (e.g., "MouthForm") */
  standardName: string;
}

/** Neko Puppet Motion Preset file format */
export interface NekoPuppetMotionPreset {
  /** Format version (always 1) */
  version: 1;
  /** Preset type: motion (animation clip) or expression (parameter overrides) */
  type: 'motion-preset' | 'expression-preset';
  /** Display name */
  name: string;
  /** Optional description */
  description?: string;
  /** Parameter bindings used by this preset */
  parameters: PuppetMotionParameter[];
  /** motion3.json content (for motion presets) */
  motion3?: Record<string, unknown>;
  /** exp3.json content (for expression presets) */
  expression3?: Record<string, unknown>;
}

/** Validate a parsed object as NekoPuppetMotionPreset */
export function isValidPuppetMotionPreset(obj: unknown): obj is NekoPuppetMotionPreset {
  if (typeof obj !== 'object' || obj === null) return false;
  const p = obj as Record<string, unknown>;
  return (
    p.version === 1 &&
    (p.type === 'motion-preset' || p.type === 'expression-preset') &&
    typeof p.name === 'string' &&
    Array.isArray(p.parameters)
  );
}
