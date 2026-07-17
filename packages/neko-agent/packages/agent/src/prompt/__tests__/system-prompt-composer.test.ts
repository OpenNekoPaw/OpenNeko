/**
 * SystemPromptComposer Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SystemPromptComposer } from '../system-prompt-composer';
import { DEFAULT_PROMPT_LAYER_BUDGET } from '../system-prompt-composer-types';

describe('SystemPromptComposer', () => {
  let composer: SystemPromptComposer;

  beforeEach(() => {
    composer = new SystemPromptComposer();
  });

  // -------------------------------------------------------------------------
  // setBase / compose
  // -------------------------------------------------------------------------

  describe('setBase', () => {
    it('returns base content when only base is set', () => {
      composer.setBase('You are a helpful assistant.');
      expect(composer.compose()).toBe('You are a helpful assistant.');
    });

    it('replaces previous base content', () => {
      composer.setBase('First base.');
      composer.setBase('Second base.');
      expect(composer.compose()).toBe('Second base.');
    });

    it('returns empty string when nothing is set', () => {
      expect(composer.compose()).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // setSection
  // -------------------------------------------------------------------------

  describe('setSection', () => {
    it('adds a skill section after the base', () => {
      composer.setBase('Base prompt.');
      composer.setSection({ id: 'skill:helper', layer: 'skill', content: 'Skill content.' });
      expect(composer.compose()).toBe('Base prompt.\n\n---\n\nSkill content.');
    });

    it('replaces a section with the same ID', () => {
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:helper', layer: 'skill', content: 'Old skill.' });
      composer.setSection({ id: 'skill:helper', layer: 'skill', content: 'New skill.' });
      expect(composer.compose()).toBe('Base.\n\n---\n\nNew skill.');
    });

    it('orders sections by layer: base → skill → environment → ephemeral', () => {
      composer.setSection({ id: 'ephemeral:note', layer: 'ephemeral', content: 'Ephemeral.' });
      composer.setSection({ id: 'env:cwd', layer: 'environment', content: 'Env context.' });
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'Skill.' });

      const result = composer.compose();
      const parts = result.split('\n\n---\n\n');
      expect(parts).toEqual(['Base.', 'Skill.', 'Env context.', 'Ephemeral.']);
    });

    it('orders sections within same layer by priority descending', () => {
      composer.setBase('Base.');
      composer.setSection({
        id: 'skill:low',
        layer: 'skill',
        content: 'Low priority.',
        priority: 10,
      });
      composer.setSection({
        id: 'skill:high',
        layer: 'skill',
        content: 'High priority.',
        priority: 90,
      });

      const result = composer.compose();
      const idx_high = result.indexOf('High priority.');
      const idx_low = result.indexOf('Low priority.');
      expect(idx_high).toBeLessThan(idx_low);
    });

    it('uses default priority of 50 when not specified', () => {
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:a', layer: 'skill', content: 'A.' });
      const section = composer.getSection('skill:a');
      expect(section?.priority).toBe(50);
    });
  });

  // -------------------------------------------------------------------------
  // removeSection
  // -------------------------------------------------------------------------

  describe('removeSection', () => {
    it('removes an existing section and returns true', () => {
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'Skill.' });
      expect(composer.removeSection('skill:x')).toBe(true);
      expect(composer.compose()).toBe('Base.');
    });

    it('returns false for a non-existent section', () => {
      expect(composer.removeSection('nonexistent')).toBe(false);
    });

    it('compose reverts to base only after skill removed', () => {
      composer.setBase('Base prompt.');
      composer.setSection({ id: 'skill:commit', layer: 'skill', content: 'Commit helper.' });
      expect(composer.compose()).toContain('Commit helper.');
      composer.removeSection('skill:commit');
      expect(composer.compose()).toBe('Base prompt.');
    });
  });

  // -------------------------------------------------------------------------
  // removeSectionsByPrefix
  // -------------------------------------------------------------------------

  describe('removeSectionsByPrefix', () => {
    it('removes every section whose id starts with the prefix and returns count', () => {
      composer.setSection({ id: 'skill:a', layer: 'skill', content: 'A' });
      composer.setSection({ id: 'skill:b', layer: 'skill', content: 'B' });
      composer.setSection({ id: 'memory:project', layer: 'environment', content: 'M' });
      expect(composer.removeSectionsByPrefix('skill:')).toBe(2);
      expect(composer.hasSection('skill:a')).toBe(false);
      expect(composer.hasSection('skill:b')).toBe(false);
      expect(composer.hasSection('memory:project')).toBe(true);
    });

    it('returns 0 when nothing matches', () => {
      composer.setSection({ id: 'memory:project', layer: 'environment', content: 'M' });
      expect(composer.removeSectionsByPrefix('skill:')).toBe(0);
      expect(composer.hasSection('memory:project')).toBe(true);
    });

    it('empty prefix is a no-op (returns 0, does not wipe everything)', () => {
      composer.setBase('Base');
      composer.setSection({ id: 'skill:a', layer: 'skill', content: 'A' });
      expect(composer.removeSectionsByPrefix('')).toBe(0);
      expect(composer.hasSection('skill:a')).toBe(true);
      expect(composer.hasSection('base')).toBe(true);
    });

    it('sections removed no longer appear in compose output', () => {
      composer.setBase('Base');
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'SKILL_X' });
      composer.setSection({ id: 'skill:y', layer: 'skill', content: 'SKILL_Y' });
      expect(composer.compose()).toContain('SKILL_X');
      composer.removeSectionsByPrefix('skill:');
      const result = composer.compose();
      expect(result).not.toContain('SKILL_X');
      expect(result).not.toContain('SKILL_Y');
      expect(result).toContain('Base');
    });

    it('prefix longer than any id matches nothing', () => {
      composer.setSection({ id: 'short', layer: 'skill', content: 'S' });
      expect(composer.removeSectionsByPrefix('veryLongPrefixThatCannotMatch')).toBe(0);
      expect(composer.hasSection('short')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // hasSection / getSection
  // -------------------------------------------------------------------------

  describe('hasSection / getSection', () => {
    it('hasSection returns true after setSection', () => {
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'X.' });
      expect(composer.hasSection('skill:x')).toBe(true);
    });

    it('hasSection returns false for missing section', () => {
      expect(composer.hasSection('nonexistent')).toBe(false);
    });

    it('hasSection returns false after removeSection', () => {
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'X.' });
      composer.removeSection('skill:x');
      expect(composer.hasSection('skill:x')).toBe(false);
    });

    it('getSection returns the section with correct fields', () => {
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'X content.', priority: 70 });
      const section = composer.getSection('skill:x');
      expect(section).toBeDefined();
      expect(section?.id).toBe('skill:x');
      expect(section?.layer).toBe('skill');
      expect(section?.content).toBe('X content.');
      expect(section?.priority).toBe(70);
      expect(section?.tokenEstimate).toBeGreaterThan(0);
      expect(section?.addedAt).toBeGreaterThan(0);
    });

    it('getSection returns undefined for missing section', () => {
      expect(composer.getSection('nonexistent')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------

  describe('reset', () => {
    it('clears all non-base sections', () => {
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'Skill.' });
      composer.setSection({ id: 'env:cwd', layer: 'environment', content: 'Env.' });
      composer.reset();
      expect(composer.compose()).toBe('Base.');
      expect(composer.hasSection('skill:x')).toBe(false);
      expect(composer.hasSection('env:cwd')).toBe(false);
    });

    it('preserves base section after reset', () => {
      composer.setBase('Preserved base.');
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'Skill.' });
      composer.reset();
      expect(composer.compose()).toBe('Preserved base.');
    });

    it('compose returns empty string after reset with no base', () => {
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'Skill.' });
      composer.reset();
      expect(composer.compose()).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // getTotalTokens
  // -------------------------------------------------------------------------

  describe('getTotalTokens', () => {
    it('returns 0 when empty', () => {
      expect(composer.getTotalTokens()).toBe(0);
    });

    it('estimates tokens from content length', () => {
      const content = 'A'.repeat(400); // 400 chars ≈ 100 tokens
      composer.setBase(content);
      expect(composer.getTotalTokens()).toBe(100);
    });

    it('sums tokens across all sections', () => {
      composer.setBase('A'.repeat(400)); // 100 tokens
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'B'.repeat(200) }); // 50 tokens
      // Total: 150 tokens + separator tokens
      expect(composer.getTotalTokens()).toBeGreaterThanOrEqual(150);
    });
  });

  // -------------------------------------------------------------------------
  // getLayerUsage
  // -------------------------------------------------------------------------

  describe('getLayerUsage', () => {
    it('returns zero used for all layers when empty', () => {
      const usage = composer.getLayerUsage();
      expect(usage.base.used).toBe(0);
      expect(usage.skill.used).toBe(0);
      expect(usage.environment.used).toBe(0);
      expect(usage.ephemeral.used).toBe(0);
    });

    it('reports correct budget for each layer', () => {
      const usage = composer.getLayerUsage();
      expect(usage.base.budget).toBe(DEFAULT_PROMPT_LAYER_BUDGET.base);
      expect(usage.skill.budget).toBe(DEFAULT_PROMPT_LAYER_BUDGET.skill);
      expect(usage.environment.budget).toBe(DEFAULT_PROMPT_LAYER_BUDGET.environment);
      expect(usage.ephemeral.budget).toBe(DEFAULT_PROMPT_LAYER_BUDGET.ephemeral);
    });

    it('reflects skill section usage', () => {
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'B'.repeat(200) }); // 50 tokens
      const usage = composer.getLayerUsage();
      expect(usage.skill.used).toBe(50);
      expect(usage.base.used).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Token budget enforcement
  // -------------------------------------------------------------------------

  describe('token budget enforcement', () => {
    it('truncates section content that exceeds layer budget', () => {
      // skill budget is 4000 tokens = 16000 chars by default
      // Create content that exceeds budget
      const hugeContent = 'X'.repeat(20000); // 5000 tokens > 4000 budget
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:big', layer: 'skill', content: hugeContent });
      const result = composer.compose();
      expect(result).toContain('[truncated]');
      // Should not contain the full content
      expect(result.length).toBeLessThan('Base.'.length + hugeContent.length + 50);
    });

    it('does not truncate content within budget', () => {
      const smallContent = 'X'.repeat(100); // 25 tokens, well within budget
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:small', layer: 'skill', content: smallContent });
      const result = composer.compose();
      expect(result).not.toContain('[truncated]');
      expect(result).toContain(smallContent);
    });
  });

  // -------------------------------------------------------------------------
  // Custom separator
  // -------------------------------------------------------------------------

  describe('custom separator', () => {
    it('uses custom separator between sections', () => {
      const customComposer = new SystemPromptComposer({ separator: '\n===\n' });
      customComposer.setBase('Base.');
      customComposer.setSection({ id: 'skill:x', layer: 'skill', content: 'Skill.' });
      expect(customComposer.compose()).toBe('Base.\n===\nSkill.');
    });
  });

  // -------------------------------------------------------------------------
  // Custom budget
  // -------------------------------------------------------------------------

  describe('custom budget', () => {
    it('uses custom per-layer budget', () => {
      const customComposer = new SystemPromptComposer({ budget: { skill: 5 } });
      const usage = customComposer.getLayerUsage();
      expect(usage.skill.budget).toBe(5);
      // Base budget should still use default
      expect(usage.base.budget).toBe(DEFAULT_PROMPT_LAYER_BUDGET.base);
    });
  });

  // -------------------------------------------------------------------------
  // createSystemPromptComposer factory
  // -------------------------------------------------------------------------

  describe('createSystemPromptComposer', () => {
    it('creates a new instance', async () => {
      const { createSystemPromptComposer } = await import('../system-prompt-composer');
      const c = createSystemPromptComposer();
      expect(c).toBeInstanceOf(SystemPromptComposer);
    });

    it('accepts options', async () => {
      const { createSystemPromptComposer } = await import('../system-prompt-composer');
      const c = createSystemPromptComposer({ budget: { skill: 999 } });
      expect(c.getLayerUsage().skill.budget).toBe(999);
    });
  });

  // -------------------------------------------------------------------------
  // composeStructured — cache boundaries
  // -------------------------------------------------------------------------

  describe('composeStructured', () => {
    it('returns empty sections when no content', () => {
      const result = composer.composeStructured();
      expect(result.text).toBe('');
      expect(result.sections).toHaveLength(0);
    });

    it('groups base layer as cacheable section', () => {
      composer.setBase('System instructions');
      const result = composer.composeStructured();

      expect(result.sections).toHaveLength(1);
      expect(result.sections[0]!.content).toBe('System instructions');
      expect(result.sections[0]!.cacheControl).toBe('ephemeral');
    });

    it('merges skill + environment into one cacheable section', () => {
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'Skill content.' });
      composer.setSection({ id: 'env:mem', layer: 'environment', content: 'Memory context.' });

      const result = composer.composeStructured();

      expect(result.sections).toHaveLength(2);
      // Section 0: base (cacheable)
      expect(result.sections[0]!.cacheControl).toBe('ephemeral');
      // Section 1: skill + environment merged (cacheable)
      expect(result.sections[1]!.content).toContain('Skill content.');
      expect(result.sections[1]!.content).toContain('Memory context.');
      expect(result.sections[1]!.cacheControl).toBe('ephemeral');
    });

    it('ephemeral layer has no cache control', () => {
      composer.setBase('Base.');
      composer.setSection({ id: 'eph:1', layer: 'ephemeral', content: 'Turn-specific context.' });

      const result = composer.composeStructured();

      expect(result.sections).toHaveLength(2);
      // Section 0: base (cacheable)
      expect(result.sections[0]!.cacheControl).toBe('ephemeral');
      // Section 1: ephemeral (not cached)
      expect(result.sections[1]!.content).toBe('Turn-specific context.');
      expect(result.sections[1]!.cacheControl).toBeUndefined();
    });

    it('text matches compose() output', () => {
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'Skill.' });
      composer.setSection({ id: 'eph:x', layer: 'ephemeral', content: 'Eph.' });

      const structured = composer.composeStructured();
      const flat = composer.compose();
      expect(structured.text).toBe(flat);
    });

    it('handles all four layers', () => {
      composer.setBase('Base.');
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'Skill.' });
      composer.setSection({ id: 'env:x', layer: 'environment', content: 'Env.' });
      composer.setSection({ id: 'eph:x', layer: 'ephemeral', content: 'Eph.' });

      const result = composer.composeStructured();

      // base (1) + skill+env merged (1) + ephemeral (1) = 3 sections
      expect(result.sections).toHaveLength(3);
      expect(result.sections[0]!.cacheControl).toBe('ephemeral');
      expect(result.sections[1]!.cacheControl).toBe('ephemeral');
      expect(result.sections[2]!.cacheControl).toBeUndefined();
    });

    // PR3c: schema layer slots between base and skill
    it('places schema layer between base and skill in compose() output', () => {
      composer.setBase('BASE');
      composer.setSection({ id: 'schema:artifact', layer: 'schema', content: 'SCHEMA' });
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'SKILL' });

      const flat = composer.compose();
      const baseIdx = flat.indexOf('BASE');
      const schemaIdx = flat.indexOf('SCHEMA');
      const skillIdx = flat.indexOf('SKILL');
      expect(baseIdx).toBeLessThan(schemaIdx);
      expect(schemaIdx).toBeLessThan(skillIdx);
    });

    it('merges schema + skill + environment into one cacheable section', () => {
      composer.setBase('BASE');
      composer.setSection({ id: 'schema:a', layer: 'schema', content: 'SCHEMA_BODY' });
      composer.setSection({ id: 'skill:x', layer: 'skill', content: 'SKILL_BODY' });
      composer.setSection({ id: 'env:x', layer: 'environment', content: 'ENV_BODY' });

      const result = composer.composeStructured();

      // base (1) + schema+skill+env merged (1) = 2 sections
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0]!.cacheControl).toBe('ephemeral');
      const mid = result.sections[1]!;
      expect(mid.cacheControl).toBe('ephemeral');
      expect(mid.content).toContain('SCHEMA_BODY');
      expect(mid.content).toContain('SKILL_BODY');
      expect(mid.content).toContain('ENV_BODY');
      // Order within the merged section: schema before skill before env
      expect(mid.content.indexOf('SCHEMA_BODY')).toBeLessThan(mid.content.indexOf('SKILL_BODY'));
      expect(mid.content.indexOf('SKILL_BODY')).toBeLessThan(mid.content.indexOf('ENV_BODY'));
    });
  });

  // -------------------------------------------------------------------------
  // dumpSections — observability
  // -------------------------------------------------------------------------

  describe('dumpSections', () => {
    it('returns empty array when no sections', () => {
      expect(composer.dumpSections()).toEqual([]);
    });

    it('returns section metadata', () => {
      composer.setBase('Base content.');
      composer.setSection({
        id: 'skill:x',
        layer: 'skill',
        content: 'Skill.',
        priority: 80,
        cacheControl: 'ephemeral',
      });

      const dump = composer.dumpSections();
      expect(dump).toHaveLength(2);

      const baseDump = dump.find((d) => d.id === 'base');
      expect(baseDump).toBeDefined();
      expect(baseDump!.layer).toBe('base');
      expect(baseDump!.tokenEstimate).toBeGreaterThan(0);

      const skillDump = dump.find((d) => d.id === 'skill:x');
      expect(skillDump).toBeDefined();
      expect(skillDump!.layer).toBe('skill');
      expect(skillDump!.priority).toBe(80);
      expect(skillDump!.cacheControl).toBe('ephemeral');
    });

    it('section without cacheControl omits the field', () => {
      composer.setBase('Base.');
      const dump = composer.dumpSections();
      const baseDump = dump.find((d) => d.id === 'base');
      expect(baseDump!.cacheControl).toBeUndefined();
    });
  });

  describe('projectComposition', () => {
    it('projects only stable metadata and hashes in actual composition order', () => {
      const hiddenBase = 'SYSTEM_SECRET sk-live-hidden /Users/private/workspace';
      const hiddenSkill = 'SKILL_SECRET private methodology';
      composer.setBase(hiddenBase);
      composer.setSection({
        id: 'skill:storyboard',
        layer: 'skill',
        content: hiddenSkill,
        source: 'skill-lifecycle',
        version: `sha256:${'a'.repeat(64)}`,
      });

      const projection = composer.projectComposition();
      expect(projection).toEqual([
        {
          id: 'base',
          source: 'base',
          order: 0,
          hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        },
        {
          id: 'skill:storyboard',
          source: 'skill-lifecycle',
          order: 1,
          version: `sha256:${'a'.repeat(64)}`,
          hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        },
      ]);
      const serialized = JSON.stringify(projection);
      expect(serialized).not.toContain(hiddenBase);
      expect(serialized).not.toContain(hiddenSkill);
      expect(serialized).not.toContain('sk-live-hidden');
      expect(serialized).not.toContain('/Users/private');
      expect(Object.keys(projection[0]!)).toEqual(['id', 'source', 'order', 'hash']);
    });

    it('hashes the exact truncated fragment and excludes sections outside the budget', () => {
      const constrained = new SystemPromptComposer({ budget: { skill: 1 } });
      constrained.setSection({ id: 'skill:first', layer: 'skill', content: '12345678' });
      constrained.setSection({ id: 'skill:second', layer: 'skill', content: 'later' });

      const projection = constrained.projectComposition();
      expect(projection).toHaveLength(1);
      expect(projection[0]).toMatchObject({ id: 'skill:first', order: 0 });

      const alternate = new SystemPromptComposer({ budget: { skill: 1 } });
      alternate.setSection({ id: 'skill:first', layer: 'skill', content: 'abcd5678' });
      expect(alternate.projectComposition()[0]?.hash).not.toBe(projection[0]?.hash);
    });

    it('rejects unsafe source and version metadata before it can reach facts', () => {
      expect(() =>
        composer.setSection({
          id: 'unsafe-source',
          layer: 'environment',
          content: 'hidden',
          source: '/Users/private/source',
        }),
      ).toThrow('stable non-secret identifier');
      expect(() =>
        composer.setSection({
          id: 'unsafe-version',
          layer: 'environment',
          content: 'hidden',
          version: 'api key value',
        }),
      ).toThrow('stable non-secret identifier');
    });
  });
});
