import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings';

describe('Agent settings defaults', () => {
  it('defaults new conversation settings to approval mode', () => {
    expect(DEFAULT_SETTINGS.executionMode).toBe('ask');
  });
});
