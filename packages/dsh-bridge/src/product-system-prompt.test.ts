import { describe, expect, it } from 'vitest';

import { OPENNEKO_PRODUCT_SYSTEM_PROMPT } from './product-system-prompt.js';

describe('OpenNeko DSH product system prompt', () => {
  it('owns the effective product protocol without recreating runtime mode or provider routing', () => {
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('OpenNeko is a local-first Desktop');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('immutable runtime tool list');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).toContain('A plan is not execution evidence');
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(/\bPi\b|fallbackProvider|fallbackModel/u);
    expect(OPENNEKO_PRODUCT_SYSTEM_PROMPT).not.toMatch(/executionMode|PromptLocale/u);
  });
});
