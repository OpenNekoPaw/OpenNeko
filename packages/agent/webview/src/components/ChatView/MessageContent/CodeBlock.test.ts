import { describe, expect, it } from 'vitest';
import { shouldWrapCodeBlockLanguage } from './CodeBlock';

describe('CodeBlock wrapping policy', () => {
  it('wraps prompt-like text blocks inside the message container', () => {
    expect(shouldWrapCodeBlockLanguage()).toBe(true);
    expect(shouldWrapCodeBlockLanguage('text')).toBe(true);
    expect(shouldWrapCodeBlockLanguage('prompt')).toBe(true);
    expect(shouldWrapCodeBlockLanguage('plaintext')).toBe(true);
  });

  it('keeps source code blocks horizontally scrollable', () => {
    expect(shouldWrapCodeBlockLanguage('typescript')).toBe(false);
    expect(shouldWrapCodeBlockLanguage('tsx')).toBe(false);
    expect(shouldWrapCodeBlockLanguage('json')).toBe(false);
  });
});
