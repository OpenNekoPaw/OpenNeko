import { describe, expect, it } from 'vitest';
import {
  formatMediaGenerationErrorSummary,
  getMediaGenerationHttpStatus,
  summarizeMediaGenerationError,
} from '../media-generation-error';

describe('media generation error normalization', () => {
  it('extracts non-enumerable AI SDK error fields for logs', () => {
    const error = new Error('Provider rejected the request');
    Object.defineProperties(error, {
      statusCode: { value: 400, enumerable: false },
      responseBody: {
        value: { error: { message: 'invalid size', code: 'bad_request' } },
        enumerable: false,
      },
      url: { value: 'https://api.example.test/v1/images/generations', enumerable: false },
      isRetryable: { value: false, enumerable: false },
    });

    const summary = summarizeMediaGenerationError(error);

    expect(summary).toMatchObject({
      name: 'Error',
      message: 'Provider rejected the request',
      status: 400,
      url: 'https://api.example.test/v1/images/generations',
      isRetryable: false,
      responseBody: '{"error":{"message":"invalid size","code":"bad_request"}}',
    });
    expect(formatMediaGenerationErrorSummary(summary)).toContain('invalid size');
  });

  it('reads status from nested response objects', () => {
    const error = Object.assign(new Error('fetch failed'), {
      response: { status: 503, statusText: 'Service Unavailable' },
    });

    expect(getMediaGenerationHttpStatus(error)).toBe(503);
    expect(summarizeMediaGenerationError(error)).toMatchObject({
      message: 'fetch failed',
      status: 503,
      statusText: 'Service Unavailable',
    });
  });

  it('serializes circular object errors without throwing', () => {
    const error: Record<string, unknown> = { message: 'bad response' };
    error['self'] = error;

    expect(summarizeMediaGenerationError(error).message).toBe('bad response');
  });
});
