import { describe, it, expect } from 'vitest';
import type { ToolGroup } from '@neko/shared';
import { resolveToolGroupTier } from '../tier-resolver';

function createToolGroup(overrides: Partial<ToolGroup> = {}): ToolGroup {
  return {
    name: 'test-group',
    description: 'Test group',
    tools: ['ToolA', 'ToolB'],
    source: 'builtin',
    enabled: true,
    ...overrides,
  };
}

describe('resolveToolGroupTier', () => {
  describe('explicit loadingTier takes precedence', () => {
    it('returns resident when explicitly set', () => {
      const group = createToolGroup({ loadingTier: 'resident', alwaysActive: false });
      expect(resolveToolGroupTier(group)).toBe('resident');
    });

    it('returns lazy even when alwaysActive and high priority', () => {
      const group = createToolGroup({
        loadingTier: 'lazy',
        alwaysActive: true,
        priority: 100,
      });
      expect(resolveToolGroupTier(group)).toBe('lazy');
    });

    it('returns eager when explicitly set', () => {
      const group = createToolGroup({ loadingTier: 'eager' });
      expect(resolveToolGroupTier(group)).toBe('eager');
    });
  });

  describe('fallback from alwaysActive + priority', () => {
    it('returns lazy when not alwaysActive', () => {
      const group = createToolGroup({ alwaysActive: false, priority: 100 });
      expect(resolveToolGroupTier(group)).toBe('lazy');
    });

    it('returns lazy when alwaysActive is undefined', () => {
      const group = createToolGroup({ alwaysActive: undefined });
      expect(resolveToolGroupTier(group)).toBe('lazy');
    });

    it('returns resident when alwaysActive and priority >= 100', () => {
      const group = createToolGroup({ alwaysActive: true, priority: 100 });
      expect(resolveToolGroupTier(group)).toBe('resident');
    });

    it('returns resident when alwaysActive and priority > 100', () => {
      const group = createToolGroup({ alwaysActive: true, priority: 150 });
      expect(resolveToolGroupTier(group)).toBe('resident');
    });

    it('returns eager when alwaysActive and priority < 100', () => {
      const group = createToolGroup({ alwaysActive: true, priority: 90 });
      expect(resolveToolGroupTier(group)).toBe('eager');
    });

    it('returns eager when alwaysActive and priority is 0', () => {
      const group = createToolGroup({ alwaysActive: true, priority: 0 });
      expect(resolveToolGroupTier(group)).toBe('eager');
    });

    it('returns eager when alwaysActive and priority is undefined', () => {
      const group = createToolGroup({ alwaysActive: true, priority: undefined });
      expect(resolveToolGroupTier(group)).toBe('eager');
    });
  });
});
