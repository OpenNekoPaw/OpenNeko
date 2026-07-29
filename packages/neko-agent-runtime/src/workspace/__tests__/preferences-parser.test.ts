import { describe, it, expect } from 'vitest';
import { parsePreferences, emptyPreferences, mergePreferences } from '../preferences-parser';

function parse(md: string) {
  return parsePreferences(md, 'project', '/r/.neko/preferences.md');
}

describe('parsePreferences', () => {
  it('parses frontmatter version + scope', () => {
    const { preferences, warnings } = parse(
      `---\nkind: user-preferences\nscope: project\nversion: 2\n---\n`,
    );
    expect(preferences.version).toBe(2);
    expect(warnings).toEqual([]);
  });

  it('defaults version to 1 when missing', () => {
    const { preferences } = parse('');
    expect(preferences.version).toBe(1);
  });

  it('warns on invalid version', () => {
    const { warnings } = parse('---\nversion: huh\n---\n');
    expect(warnings.some((w) => w.includes('Invalid preferences version'))).toBe(true);
  });

  it('warns when declared scope conflicts with loader scope', () => {
    const { warnings } = parsePreferences(
      '---\nscope: global\n---\n',
      'project',
      '/r/.neko/preferences.md',
    );
    expect(warnings.some((w) => w.includes('scope mismatch'))).toBe(true);
  });

  it('parses alwaysApprove bullets with prefixed subjects', () => {
    const { preferences } = parse(
      `## Always approve\n- tool:GenerateImage\n- domain:cut\n- channel:creator-review\n`,
    );
    expect(preferences.alwaysApprove).toHaveLength(3);
    expect(preferences.alwaysApprove[0]).toMatchObject({
      kind: 'tool',
      value: 'GenerateImage',
    });
    expect(preferences.alwaysApprove[1]!.kind).toBe('domain');
    expect(preferences.alwaysApprove[2]!.kind).toBe('channel');
  });

  it('parses wildcard `- *` as any', () => {
    const { preferences } = parse(`## Always approve\n- *\n`);
    expect(preferences.alwaysApprove[0]!.kind).toBe('any');
  });

  it('label fallback when no prefix', () => {
    const { preferences } = parse(`## Always approve\n- 4K export\n`);
    expect(preferences.alwaysApprove[0]).toMatchObject({
      kind: 'label',
      value: '4K export',
    });
  });

  it('parses autoApprove identical bullet grammar', () => {
    const { preferences } = parse(`## Auto approve\n- tool:Read\n- tool:Glob\n`);
    expect(preferences.autoApprove).toHaveLength(2);
    expect(preferences.autoApprove.every((r) => r.kind === 'tool')).toBe(true);
  });

  it('parses cost thresholds with units', () => {
    const { preferences, warnings } = parse(
      `## Cost thresholds\n- maxTokens > 50000\n- maxUsd > 5\n- maxDurationMs > 30m\n`,
    );
    expect(warnings).toEqual([]);
    expect(preferences.costThresholds.maxTokens).toBe(50000);
    expect(preferences.costThresholds.maxUsd).toBe(5);
    expect(preferences.costThresholds.maxDurationMs).toBe(30 * 60_000);
  });

  it('parses s / h duration units', () => {
    const { preferences } = parse(`## Cost thresholds\n- maxDurationMs > 45s\n`);
    expect(preferences.costThresholds.maxDurationMs).toBe(45_000);
  });

  it('warns on malformed cost threshold', () => {
    const { warnings } = parse(`## Cost thresholds\n- maxTokens is big\n`);
    expect(warnings.some((w) => w.includes('cost-threshold bullet'))).toBe(true);
  });

  it('parses default mode paragraph', () => {
    const { preferences } = parse(`## Default mode\nplan\n`);
    expect(preferences.defaultMode).toBe('plan');
  });

  it('warns on invalid default mode', () => {
    const { preferences, warnings } = parse(`## Default mode\nyolo\n`);
    expect(preferences.defaultMode).toBeUndefined();
    expect(warnings.some((w) => w.includes('Invalid default mode'))).toBe(true);
  });

  it('parses default skills list', () => {
    const { preferences } = parse(`## Default skills\n- cut-editor\n- color-grading\n`);
    expect(preferences.defaultSkills).toEqual(['cut-editor', 'color-grading']);
  });

  it('preserves unknown sections as freeFormSections', () => {
    const { preferences } = parse(`## Notification preferences\n- Every 5 minutes\n- On failure\n`);
    expect(preferences.freeFormSections['Notification preferences']).toContain('- Every 5 minutes');
  });

  it('full example parses cleanly', () => {
    const md = `---
kind: user-preferences
scope: project
version: 1
---

# My creative prefs

## Always approve
- tool:DeleteTimelineElement
- domain:publish

## Auto approve
- tool:Read
- tool:Glob

## Cost thresholds
- maxTokens > 50000
- maxUsd > 5
- maxDurationMs > 30m

## Default mode
auto

## Default skills
- cut-editor

## Notification preferences
- 5 min progress updates
`;
    const { preferences, warnings } = parse(md);
    expect(warnings).toEqual([]);
    expect(preferences.alwaysApprove).toHaveLength(2);
    expect(preferences.autoApprove).toHaveLength(2);
    expect(preferences.costThresholds.maxTokens).toBe(50000);
    expect(preferences.defaultMode).toBe('auto');
    expect(preferences.defaultSkills).toEqual(['cut-editor']);
    expect(preferences.freeFormSections['Notification preferences']).toBeDefined();
  });
});

describe('mergePreferences', () => {
  it('both null → empty project preferences', () => {
    const merged = mergePreferences(null, null);
    expect(merged.scope).toBe('project');
    expect(merged.alwaysApprove).toEqual([]);
  });

  it('only project → project returned as-is', () => {
    const project = emptyPreferences('project', '/p');
    const merged = mergePreferences(project, null);
    expect(merged.sourcePath).toBe('/p');
  });

  it('only global → returned but scope upgraded to project view', () => {
    const global = emptyPreferences('global', '/g');
    const merged = mergePreferences(null, global);
    expect(merged.scope).toBe('project');
  });

  it('project alwaysApprove takes precedence on duplicate matcher', () => {
    const p = {
      ...emptyPreferences('project', '/p'),
      alwaysApprove: [{ kind: 'tool' as const, value: 'X', source: 'tool:X (project)' }],
    };
    const g = {
      ...emptyPreferences('global', '/g'),
      alwaysApprove: [
        { kind: 'tool' as const, value: 'X', source: 'tool:X (global)' },
        { kind: 'tool' as const, value: 'Y', source: 'tool:Y (global)' },
      ],
    };
    const merged = mergePreferences(p, g);
    expect(merged.alwaysApprove).toHaveLength(2);
    // Project's X wins; Y merged from global
    expect(merged.alwaysApprove[0]!.source).toContain('(project)');
    expect(merged.alwaysApprove[1]!.value).toBe('Y');
  });

  it('cost thresholds merge per-field', () => {
    const p = { ...emptyPreferences('project'), costThresholds: { maxTokens: 10 } };
    const g = {
      ...emptyPreferences('global'),
      costThresholds: { maxTokens: 999, maxUsd: 5 },
    };
    const merged = mergePreferences(p, g);
    expect(merged.costThresholds).toEqual({ maxTokens: 10, maxUsd: 5 });
  });

  it('defaultMode: project wins when both set', () => {
    const p = { ...emptyPreferences('project'), defaultMode: 'plan' as const };
    const g = { ...emptyPreferences('global'), defaultMode: 'auto' as const };
    expect(mergePreferences(p, g).defaultMode).toBe('plan');
  });

  it('defaultMode: falls back to global when project omits', () => {
    const p = emptyPreferences('project');
    const g = { ...emptyPreferences('global'), defaultMode: 'plan' as const };
    expect(mergePreferences(p, g).defaultMode).toBe('plan');
  });

  it('defaultSkills concatenate and dedupe', () => {
    const p = { ...emptyPreferences('project'), defaultSkills: ['a', 'b'] };
    const g = { ...emptyPreferences('global'), defaultSkills: ['b', 'c'] };
    expect(mergePreferences(p, g).defaultSkills).toEqual(['a', 'b', 'c']);
  });

  it('freeFormSections project overrides global heading', () => {
    const p = { ...emptyPreferences('project'), freeFormSections: { Notifications: 'p-body' } };
    const g = {
      ...emptyPreferences('global'),
      freeFormSections: { Notifications: 'g-body', Other: 'o-body' },
    };
    const merged = mergePreferences(p, g);
    expect(merged.freeFormSections['Notifications']).toBe('p-body');
    expect(merged.freeFormSections['Other']).toBe('o-body');
  });
});
