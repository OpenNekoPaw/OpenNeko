import { describe, expect, it } from 'vitest';
import {
  buildCompressionErrorMessage,
  buildCompressionResultMessage,
  buildContextTokenCountMessage,
} from '../../session/context-host-message';

describe('context webview presenter', () => {
  it('builds token count messages with explicit conversation id', () => {
    expect(buildContextTokenCountMessage({ conversationId: 'conv-1', tokenCount: 42 })).toEqual({
      type: 'contextTokenCount',
      conversationId: 'conv-1',
      tokenCount: 42,
    });

    expect(() => buildContextTokenCountMessage({ conversationId: '', tokenCount: 0 })).toThrow(
      'contextTokenCount requires non-empty conversationId',
    );
  });

  it('builds compression result and error messages', () => {
    expect(
      buildCompressionResultMessage({
        conversationId: 'conv-1',
        result: {
          originalTokens: 5000,
          compressedTokens: 2000,
          ratio: 0.4,
        },
      }),
    ).toEqual({
      type: 'compressionResult',
      conversationId: 'conv-1',
      originalTokens: 5000,
      compressedTokens: 2000,
      ratio: 0.4,
    });

    expect(
      buildCompressionErrorMessage({
        conversationId: 'conv-1',
        error: new Error('Compression failed'),
      }),
    ).toEqual({
      type: 'compressionError',
      conversationId: 'conv-1',
      error: 'Compression failed',
    });

    expect(() =>
      buildCompressionErrorMessage({ conversationId: ' ', error: 'Compression failed' }),
    ).toThrow('compressionError requires non-empty conversationId');
  });
});
