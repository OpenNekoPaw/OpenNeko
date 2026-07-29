import { describe, expect, it } from 'vitest';
import { preserveDesktopBootstrapEventSequence } from './desktop-runtime-event-cursor';

describe('Desktop runtime preload event cursor', () => {
  it('preserves Canvas/Cut progress across an idempotent StrictMode bootstrap', () => {
    expect(preserveDesktopBootstrapEventSequence(12)).toBe(12);
  });

  it('starts a newly attached owner at sequence zero', () => {
    expect(preserveDesktopBootstrapEventSequence(undefined)).toBe(0);
  });
});
