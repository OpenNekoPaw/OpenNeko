import { describe, expect, it } from 'vitest';
import {
  assertCanonicalTuiConversationId,
  createTuiConversationId,
  isCanonicalTuiConversationId,
  isPathSafeCliConversationId,
  TuiConversationIdError,
} from '../tui-conversation-id';

describe('tui conversation id', () => {
  it('creates workspace-scoped canonical conversation ids for new TUI sessions', () => {
    const id = createTuiConversationId('/workspace/demo', {
      now: 1_714_040_000_123,
      random: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    });

    expect(id).toMatch(/^[0-9a-z]{8}-[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(id.startsWith('cli-')).toBe(false);
    expect(id).not.toContain(':');
    expect(id).not.toContain('/');
    expect(isCanonicalTuiConversationId(id)).toBe(true);
    expect(isPathSafeCliConversationId(id)).toBe(true);
    expect(assertCanonicalTuiConversationId(id)).toBe(id);
  });

  it('rejects old cli conversation ids instead of keeping resume compatibility', () => {
    expect(isCanonicalTuiConversationId('cli-kf12oi-4fzzzxjyl')).toBe(false);
    expect(() => assertCanonicalTuiConversationId('cli-kf12oi-4fzzzxjyl')).toThrow(
      TuiConversationIdError,
    );
    try {
      assertCanonicalTuiConversationId('cli-kf12oi-4fzzzxjyl');
    } catch (error) {
      expect(error).toBeInstanceOf(TuiConversationIdError);
      if (!(error instanceof TuiConversationIdError)) throw error;
      expect(error.diagnostic).toEqual({
        code: 'non-canonical',
        value: 'cli-kf12oi-4fzzzxjyl',
      });
    }
  });
});
