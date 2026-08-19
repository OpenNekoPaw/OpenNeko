import { describe, expect, it } from 'vitest';
import {
  projectCompressionError,
  projectCompressionResult,
  projectContextTokenCount,
} from '../context-state-presenter';

describe('context state presenter', () => {
  it('projects token counts without mutating the previous map', () => {
    const previous = new Map<string, number>([['conv-0', 10]]);

    const projected = projectContextTokenCount({
      tokenCounts: previous,
      activeConversationId: 'conv-1',
      conversationId: 'conv-1',
      tokenCount: 42,
    });

    expect(projected.tokenCounts).toEqual(
      new Map<string, number>([
        ['conv-0', 10],
        ['conv-1', 42],
      ]),
    );
    expect(projected.shouldForceUpdate).toBe(true);
    expect(previous.has('conv-1')).toBe(false);
  });

  it('projects compression results into token and compression maps', () => {
    const projected = projectCompressionResult({
      tokenCounts: new Map<string, number>([['conv-1', 100]]),
      compressing: new Map<string, boolean>([['conv-1', true]]),
      activeConversationId: 'conv-2',
      conversationId: 'conv-1',
      compressedTokens: 12,
    });

    expect(projected.tokenCounts).toEqual(new Map<string, number>([['conv-1', 12]]));
    expect(projected.compressing).toEqual(new Map<string, boolean>([['conv-1', false]]));
    expect(projected.shouldForceUpdate).toBe(false);
  });

  it('projects compression errors without touching token counts', () => {
    const projected = projectCompressionError({
      compressing: new Map<string, boolean>([['conv-1', true]]),
      activeConversationId: 'conv-1',
      conversationId: 'conv-1',
    });

    expect(projected).toEqual({
      compressing: new Map<string, boolean>([['conv-1', false]]),
      shouldForceUpdate: true,
    });
  });
});
