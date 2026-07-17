/**
 * RemediationPlanner unit tests
 *
 * Verifies deterministic mapping from QualityIssueCategory → RemediationAction
 */

import { describe, it, expect } from 'vitest';
import { createRemediationPlanner } from '../remediation-planner';
import {
  QUALITY_ISSUE_CATEGORIES,
  type QualityIssue,
  type QualityIssueCategory,
} from '@neko/shared';

// =============================================================================
// Helpers
// =============================================================================

function makeIssue(
  category: QualityIssueCategory,
  description = `Test issue for ${category}`,
): QualityIssue {
  return { category, severity: 'major', description };
}

// =============================================================================
// Tests
// =============================================================================

describe('RemediationPlanner', () => {
  const planner = createRemediationPlanner();

  describe('category mapping coverage', () => {
    it('should return a RemediationAction for every known category', () => {
      for (const category of QUALITY_ISSUE_CATEGORIES) {
        const action = planner.plan(makeIssue(category), 'image');
        expect(action).toBeDefined();
        expect(action.type).toBeTruthy();
        expect(action.description).toBeTruthy();
        expect(typeof action.confidence).toBe('number');
      }
    });
  });

  describe('technical issue mappings', () => {
    it('artifact → apply-effect (AddEffect denoise)', () => {
      const action = planner.plan(makeIssue('artifact'), 'image');
      expect(action.type).toBe('apply-effect');
      expect(action.toolName).toBe('AddEffect');
      expect(action.toolParams).toEqual({ effectType: 'denoise', strength: 0.7 });
      expect(action.confidence).toBe(0.8);
    });

    it('resolution → regenerate', () => {
      const action = planner.plan(makeIssue('resolution'), 'image');
      expect(action.type).toBe('regenerate');
      expect(action.confidence).toBe(0.7);
    });

    it('color-distortion → color-correct (SetColorCorrection)', () => {
      const action = planner.plan(makeIssue('color-distortion'), 'image');
      expect(action.type).toBe('color-correct');
      expect(action.toolName).toBe('SetColorCorrection');
      expect(action.toolParams).toEqual({ autoCorrect: true });
      expect(action.confidence).toBe(0.7);
    });

    it('audio-noise → adjust-audio (SetAudioProperties denoise)', () => {
      const action = planner.plan(makeIssue('audio-noise'), 'audio');
      expect(action.type).toBe('adjust-audio');
      expect(action.toolName).toBe('SetAudioProperties');
      expect(action.toolParams).toEqual({ denoise: true });
      expect(action.confidence).toBe(0.8);
    });

    it('audio-clipping → adjust-audio (normalize + limitPeak)', () => {
      const action = planner.plan(makeIssue('audio-clipping'), 'audio');
      expect(action.type).toBe('adjust-audio');
      expect(action.toolName).toBe('SetAudioProperties');
      expect(action.toolParams).toEqual({ normalize: true, limitPeak: -1 });
      expect(action.confidence).toBe(0.9);
    });

    it('loudness-off → adjust-audio (targetLufs -14)', () => {
      const action = planner.plan(makeIssue('loudness-off'), 'audio');
      expect(action.type).toBe('adjust-audio');
      expect(action.toolName).toBe('SetAudioProperties');
      expect(action.toolParams).toEqual({ normalize: true, targetLufs: -14 });
      expect(action.confidence).toBe(0.9);
    });
  });

  describe('semantic issue mappings', () => {
    it('prompt-mismatch → regenerate', () => {
      const action = planner.plan(makeIssue('prompt-mismatch'), 'image');
      expect(action.type).toBe('regenerate');
      expect(action.confidence).toBe(0.6);
      expect(action.description).toContain('Regenerate');
    });

    it('script-mismatch → regenerate', () => {
      const action = planner.plan(makeIssue('script-mismatch'), 'image');
      expect(action.type).toBe('regenerate');
      expect(action.confidence).toBe(0.6);
      expect(action.description).toContain('script');
    });

    it('style-drift → color-correct', () => {
      const action = planner.plan(makeIssue('style-drift'), 'image');
      expect(action.type).toBe('color-correct');
      expect(action.toolName).toBe('SetColorCorrection');
      expect(action.confidence).toBe(0.5);
    });

    it('character-inconsistency → regenerate-ref (IP-Adapter)', () => {
      const action = planner.plan(makeIssue('character-inconsistency'), 'image');
      expect(action.type).toBe('regenerate-ref');
      expect(action.confidence).toBe(0.5);
      expect(action.description).toContain('IP-Adapter');
    });

    it('composition-poor → regenerate', () => {
      const action = planner.plan(makeIssue('composition-poor'), 'image');
      expect(action.type).toBe('regenerate');
      expect(action.confidence).toBe(0.5);
    });

    it('motion-unnatural → regenerate', () => {
      const action = planner.plan(makeIssue('motion-unnatural'), 'video');
      expect(action.type).toBe('regenerate');
      expect(action.confidence).toBe(0.4);
    });
  });

  describe('fallback behavior', () => {
    it('should return manual-review for unknown category', () => {
      const issue = {
        category: 'unknown-category' as QualityIssueCategory,
        severity: 'major' as const,
        description: 'Something unexpected',
      };
      const action = planner.plan(issue, 'image');
      expect(action.type).toBe('manual-review');
      expect(action.confidence).toBe(0.3);
      expect(action.description).toContain('No auto-fix');
    });
  });

  describe('confidence ranges', () => {
    it('all actions should have confidence between 0 and 1', () => {
      for (const category of QUALITY_ISSUE_CATEGORIES) {
        const action = planner.plan(makeIssue(category), 'image');
        expect(action.confidence).toBeGreaterThanOrEqual(0);
        expect(action.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('technical issues should have higher confidence than semantic issues', () => {
      const technical = planner.plan(makeIssue('audio-clipping'), 'audio');
      const semantic = planner.plan(makeIssue('motion-unnatural'), 'video');
      expect(technical.confidence).toBeGreaterThan(semantic.confidence);
    });
  });

  describe('issue description passthrough', () => {
    it('should include issue description in regenerate actions', () => {
      const action = planner.plan(
        makeIssue('prompt-mismatch', 'Missing the requested sunset background'),
        'image',
      );
      expect(action.description).toContain('Missing the requested sunset background');
    });
  });
});
