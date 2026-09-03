import { describe, expect, it } from 'vitest';
import {
  createWorldCreationHandoffIntent,
  parseWorldCreationHandoffIntent,
} from '../world-creation-handoff';

describe('World creation handoff contract', () => {
  it.each(['blank', 'world-bible'] as const)('round-trips the %s entry', (entry) => {
    const intent = createWorldCreationHandoffIntent({ intentId: `intent:${entry}`, entry });

    expect(parseWorldCreationHandoffIntent(intent)).toEqual(intent);
  });

  it('rejects unknown entries and fields', () => {
    expect(() =>
      parseWorldCreationHandoffIntent({
        kind: 'world-creation',
        intentId: 'intent-1',
        entry: 'starter-pack',
      }),
    ).toThrow("World creation entry 'starter-pack' is unsupported.");
    expect(() =>
      parseWorldCreationHandoffIntent({
        kind: 'world-creation',
        intentId: 'intent-1',
        entry: 'blank',
        fallback: true,
      }),
    ).toThrow('World creation handoff contains unsupported or missing fields.');
  });
});
