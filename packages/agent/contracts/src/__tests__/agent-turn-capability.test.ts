import { describe, expect, it } from 'vitest';

import { parseAgentTurnCapabilityConstraint } from '../agent-turn-capability';

describe('Agent turn capability constraint', () => {
  it('parses an owner-qualified empty Narrative capability constraint', () => {
    expect(
      parseAgentTurnCapabilityConstraint({
        owner: { kind: 'character', id: 'character-run:1' },
        skills: 'none',
        tools: 'none',
        references: 'none',
      }),
    ).toEqual({
      owner: { kind: 'character', id: 'character-run:1' },
      skills: 'none',
      tools: 'none',
      references: 'none',
    });
  });

  it('rejects unqualified or partial constraints', () => {
    expect(() =>
      parseAgentTurnCapabilityConstraint({ skills: 'none', tools: 'none', references: 'none' }),
    ).toThrow('canonical fields');
    expect(() =>
      parseAgentTurnCapabilityConstraint({
        owner: { kind: 'character', id: 'character-run:1' },
        skills: 'configured',
        references: 'configured',
      }),
    ).toThrow('canonical fields');
  });
});
