import { describe, expect, it } from 'vitest';
import { CORE_TOOLS } from '../tool-category';

describe('tool category contracts', () => {
  it('advertises native Skill creation as a resident core capability', () => {
    expect(CORE_TOOLS).toContain('CreateSkill');
  });

  it('does not advertise external research tools as unconditional core tools', () => {
    expect(CORE_TOOLS).not.toContain('WebSearch');
    expect(CORE_TOOLS).not.toContain('WebFetch');
  });
});
