import { describe, expect, it } from 'vitest';
import {
  createCharacterCreationHandoffIntent,
  parseCharacterCreationHandoffIntent,
} from '../character-creation-handoff';

describe('Character creation handoff', () => {
  it.each(['blank', 'character-kit'] as const)('round-trips the %s entry', (entry) => {
    const intent = createCharacterCreationHandoffIntent({ intentId: `intent:${entry}`, entry });

    expect(parseCharacterCreationHandoffIntent(intent)).toEqual(intent);
  });

  it('rejects unknown entries and extra fields', () => {
    expect(() =>
      parseCharacterCreationHandoffIntent({
        kind: 'character-creation',
        intentId: 'intent:one',
        entry: 'unknown',
      }),
    ).toThrow(/unsupported/u);
    expect(() =>
      parseCharacterCreationHandoffIntent({
        kind: 'character-creation',
        intentId: 'intent:one',
        entry: 'blank',
        templateId: 'hidden-template',
      }),
    ).toThrow(/unsupported or missing/u);
  });
});
