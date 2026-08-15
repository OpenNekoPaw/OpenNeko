import { describe, expect, it } from 'vitest';
import {
  formatMediaGenerationErrorSummary,
  getMediaGenerationHttpStatus,
  isMediaGenerationOutcomeUnknown,
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
      url: { value: 'https://api.example.test/media/images/generations', enumerable: false },
      isRetryable: { value: false, enumerable: false },
      outcomeUnknown: { value: true, enumerable: false },
    });

    const summary = summarizeMediaGenerationError(error);

    expect(summary).toMatchObject({
      name: 'Error',
      message: 'Provider rejected the request',
      status: 400,
      url: 'https://api.example.test/media/images/generations',
      isRetryable: false,
      outcomeUnknown: true,
      responseBody: '{"error":{"message":"invalid size","code":"bad_request"}}',
    });
    expect(formatMediaGenerationErrorSummary(summary)).toContain('invalid size');
    expect(isMediaGenerationOutcomeUnknown(summary)).toBe(true);
  });

  it('preserves an outcome-unknown marker through a provider wrapper cause', () => {
    const providerError = Object.assign(new Error('connection closed after submission'), {
      outcomeUnknown: true,
    });
    const summary = summarizeMediaGenerationError(
      Object.assign(new Error('AI SDK provider call failed'), { cause: providerError }),
    );

    expect(summary.outcomeUnknown).toBeUndefined();
    expect(summary.cause?.outcomeUnknown).toBe(true);
    expect(isMediaGenerationOutcomeUnknown(summary)).toBe(true);
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
