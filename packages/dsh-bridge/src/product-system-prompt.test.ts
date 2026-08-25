import { describe, expect, it } from 'vitest';

import { OPENNEKO_PRODUCT_SYSTEM_PROMPT } from './product-system-prompt.js';

describe('OpenNeko DSH product system prompt', () => {
  it('owns the effective product protocol without recreating runtime mode or provider routing', () => {
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('OpenNeko is a local-first Desktop');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('immutable runtime tool list');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('A plan is not execution evidence');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(/\bPi\b|fallbackProvider|fallbackModel/u);
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toContain('perception capability');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('package-owned media Tool');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(/executionMode|PromptLocale/u);
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('<!-- neko:artifact -->');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('Keep terminal output as Markdown');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(/CompositeArtifact|composite artifact/u);
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(/fenced JSON/u);
  });

  it('defaults to progressive output without owning document templates or Skill selection', () => {
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('smallest useful result');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'Expand when the user explicitly asks for detail',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain(
      'does not by itself require a complete document outline',
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toContain('active artifact profile');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(
      /primary Skill|single Skill|fixed Skill|risk matrix is required|always include/u,
    );
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(
      /creative proposal fields|analysis report fields|project proposal fields/u,
    );
  });
});
