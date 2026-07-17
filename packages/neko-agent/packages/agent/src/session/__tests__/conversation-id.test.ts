import { describe, expect, it } from 'vitest';
import {
  createConversationId,
  getConversationWorkDirHash,
  isCanonicalConversationId,
  parseConversationId,
} from '../conversation-id';

describe('ConversationId helpers', () => {
  it('creates canonical conversation IDs with workDir hash prefix', () => {
    const workDir = '/workspace/demo';
    const conversationId = createConversationId(workDir, {
      now: 1_714_040_000_123,
      random: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    });

    expect(conversationId).toMatch(/^[0-9a-z]{8}-[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(conversationId.startsWith(`${getConversationWorkDirHash(workDir)}-`)).toBe(true);
    expect(isCanonicalConversationId(conversationId)).toBe(true);
  });

  it('derives a stable 8-char lowercase base36 workDir hash', () => {
    const left = getConversationWorkDirHash('/workspace/demo');
    const right = getConversationWorkDirHash('/workspace/demo');

    expect(left).toBe(right);
    expect(left).toMatch(/^[0-9a-z]{8}$/);
  });

  it('parses canonical IDs and rejects invalid IDs', () => {
    const canonicalId = createConversationId('/workspace/demo', {
      now: 1_714_040_000_123,
      random: new Uint8Array([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]),
    });

    expect(parseConversationId(canonicalId)).toEqual({
      workDirHash: canonicalId.slice(0, 8),
      ulid: canonicalId.slice(9),
    });
    expect(parseConversationId('invalid-conversation-id')).toBeNull();
  });
});
