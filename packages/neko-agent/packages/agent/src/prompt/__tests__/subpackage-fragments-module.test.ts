/**
 * Tests for SubpackageFragmentsModule — the L3 environment-layer projection
 * of AgentCapabilityProvider-contributed PromptFragments introduced in PR3e.
 */
import { describe, it, expect } from 'vitest';
import { SubpackageFragmentsModule } from '../modules/environment/subpackage-fragments-module';
import type { PromptFragment } from '@neko/shared';

describe('SubpackageFragmentsModule', () => {
  it('returns null when no fragments have been set', async () => {
    const mod = new SubpackageFragmentsModule();
    expect(await mod.render()).toBeNull();
    expect(mod.renderSync()).toBeNull();
  });

  it('returns null when fragments array is empty', () => {
    const mod = new SubpackageFragmentsModule();
    mod.setFragments([]);
    expect(mod.renderSync()).toBeNull();
  });

  it('projects one section per fragment with default priority 70', () => {
    const mod = new SubpackageFragmentsModule();
    mod.setFragments([{ id: 'neko-cut:timeline', content: 'Timeline guide body.' }]);
    const sections = mod.renderSync();
    expect(sections).toHaveLength(1);
    const s = sections![0]!;
    expect(s.sectionId).toBe('fragment:neko-cut:timeline');
    expect(s.layer).toBe('environment');
    expect(s.content).toBe('Timeline guide body.');
    expect(s.priority).toBe(70);
  });

  it('preserves fragment order when rendering multiple fragments', () => {
    const fragments: PromptFragment[] = [
      { id: 'a', content: 'A' },
      { id: 'b', content: 'B' },
      { id: 'c', content: 'C' },
    ];
    const mod = new SubpackageFragmentsModule();
    mod.setFragments(fragments);
    const sections = mod.renderSync()!;
    expect(sections.map((s) => s.sectionId)).toEqual(['fragment:a', 'fragment:b', 'fragment:c']);
  });

  it('drops duplicate ids (first-writer-wins)', () => {
    const mod = new SubpackageFragmentsModule();
    mod.setFragments([
      { id: 'dup', content: 'FIRST' },
      { id: 'dup', content: 'SECOND' },
      { id: 'other', content: 'OTHER' },
    ]);
    const sections = mod.renderSync()!;
    expect(sections).toHaveLength(2);
    expect(sections[0]?.content).toBe('FIRST');
    expect(sections[1]?.sectionId).toBe('fragment:other');
  });

  it('honours per-fragment priority override', () => {
    const mod = new SubpackageFragmentsModule();
    mod.setFragments([
      { id: 'low', content: 'L', priority: 40 },
      { id: 'high', content: 'H', priority: 95 },
    ]);
    const sections = mod.renderSync()!;
    expect(sections[0]!.priority).toBe(40);
    expect(sections[1]!.priority).toBe(95);
  });

  it('setFragments(undefined) resets to empty', () => {
    const mod = new SubpackageFragmentsModule();
    mod.setFragments([{ id: 'x', content: 'X' }]);
    expect(mod.renderSync()).not.toBeNull();
    mod.setFragments(undefined);
    expect(mod.renderSync()).toBeNull();
    expect(mod.getFragments()).toEqual([]);
  });

  it('manifest declares environment layer + no requires', () => {
    const mod = new SubpackageFragmentsModule();
    expect(mod.manifest.id).toBe('subpackage.fragments');
    expect(mod.manifest.layers).toEqual(['environment']);
    expect(mod.manifest.requires).toEqual([]);
    expect(mod.manifest.priority).toBe(70);
    expect(mod.manifest.cost).toBe('free');
  });
});
