/**
 * RemediationPlanner — Deterministic mapping from QualityIssue to executable RemediationAction
 *
 * Maps structured issue categories to ToolSet tool calls (AddEffect, SetColorCorrection, etc.).
 * No LLM needed — pure lookup table for reliable, repeatable remediation suggestions.
 *
 * Used by QualityCheck tool to attach actionable fix suggestions to each detected issue,
 * enabling the Agent to auto-execute repairs via existing ToolSets.
 */

import type {
  QualityIssue,
  QualityIssueCategory,
  EvalMediaType,
  RemediationAction,
} from '@neko/shared';

// =============================================================================
// Interface
// =============================================================================

export interface IRemediationPlanner {
  /** Map a quality issue to an executable remediation action */
  plan(issue: QualityIssue, mediaType: EvalMediaType): RemediationAction;
}

// =============================================================================
// Implementation
// =============================================================================

type RemediationHandler = (issue: QualityIssue, mediaType: EvalMediaType) => RemediationAction;

/**
 * Deterministic remediation mapping table.
 *
 * Each entry maps a QualityIssueCategory to a handler that produces a RemediationAction.
 * Actions reference existing ToolSet tools by name (e.g., 'AddEffect', 'SetColorCorrection',
 * 'SetAudioProperties') so the Agent can directly invoke them.
 */
const REMEDIATION_MAP: Partial<Record<QualityIssueCategory, RemediationHandler>> = {
  // -- Technical issues (high confidence, deterministic fixes) --

  artifact: () => ({
    type: 'apply-effect',
    toolName: 'AddEffect',
    toolParams: { effectType: 'denoise', strength: 0.7 },
    description: 'Apply denoise filter to reduce artifacts',
    confidence: 0.8,
  }),

  resolution: (issue) => ({
    type: 'regenerate',
    description: `Regenerate at higher resolution: ${issue.description}`,
    confidence: 0.7,
  }),

  'color-distortion': () => ({
    type: 'color-correct',
    toolName: 'SetColorCorrection',
    toolParams: { autoCorrect: true },
    description: 'Auto color correction',
    confidence: 0.7,
  }),

  'audio-noise': () => ({
    type: 'adjust-audio',
    toolName: 'SetAudioProperties',
    toolParams: { denoise: true },
    description: 'Apply audio denoising',
    confidence: 0.8,
  }),

  'audio-clipping': () => ({
    type: 'adjust-audio',
    toolName: 'SetAudioProperties',
    toolParams: { normalize: true, limitPeak: -1 },
    description: 'Normalize audio to prevent clipping',
    confidence: 0.9,
  }),

  'loudness-off': () => ({
    type: 'adjust-audio',
    toolName: 'SetAudioProperties',
    toolParams: { normalize: true, targetLufs: -14 },
    description: 'Normalize loudness to -14 LUFS (broadcast standard)',
    confidence: 0.9,
  }),

  // -- Semantic issues (lower confidence, may need LLM prompt optimization) --

  'prompt-mismatch': (issue) => ({
    type: 'regenerate',
    description: `Regenerate: ${issue.description}`,
    confidence: 0.6,
  }),

  'script-mismatch': (issue) => ({
    type: 'regenerate',
    description: `Regenerate to match script: ${issue.description}`,
    confidence: 0.6,
  }),

  'style-drift': () => ({
    type: 'color-correct',
    toolName: 'SetColorCorrection',
    toolParams: { autoCorrect: true },
    description: 'Apply color correction to align style',
    confidence: 0.5,
  }),

  'character-inconsistency': () => ({
    type: 'regenerate-ref',
    description: 'Regenerate with IP-Adapter reference for character consistency',
    confidence: 0.5,
  }),

  'composition-poor': (issue) => ({
    type: 'regenerate',
    description: `Regenerate with better composition: ${issue.description}`,
    confidence: 0.5,
  }),

  'motion-unnatural': (issue) => ({
    type: 'regenerate',
    description: `Regenerate: ${issue.description}`,
    confidence: 0.4,
  }),

  // -- Video-specific issues --

  jitter: () => ({
    type: 'apply-effect',
    toolName: 'AddEffect',
    toolParams: { effectType: 'stabilize', strength: 0.6 },
    description: 'Apply video stabilization to reduce jitter/flickering',
    confidence: 0.7,
  }),

  tearing: (issue) => ({
    type: 'regenerate',
    description: `Regenerate video: ${issue.description}`,
    confidence: 0.5,
  }),

  stuttering: () => ({
    type: 'apply-effect',
    toolName: 'AddEffect',
    toolParams: { effectType: 'frame-interpolation', targetFps: 30 },
    description: 'Apply frame interpolation to reduce stuttering',
    confidence: 0.6,
  }),
};

export class RemediationPlanner implements IRemediationPlanner {
  plan(issue: QualityIssue, mediaType: EvalMediaType): RemediationAction {
    const handler = REMEDIATION_MAP[issue.category];
    if (handler) {
      return handler(issue, mediaType);
    }
    return {
      type: 'manual-review',
      description: `No auto-fix available: ${issue.description}`,
      confidence: 0.3,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createRemediationPlanner(): IRemediationPlanner {
  return new RemediationPlanner();
}
