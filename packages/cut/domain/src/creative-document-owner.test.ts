import { describe, expect, it } from 'vitest';
import { parseOtio } from './codec';
import { createEmptyCutDocumentBytes, isValidCutDocumentBytes } from './creative-document-owner';

describe('Cut document owner', () => {
  it('creates canonical valid 1080p30 OTIO bytes', () => {
    const bytes = createEmptyCutDocumentBytes('Story');
    const parsed = parseOtio(bytes);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('Expected valid OTIO fixture.');
    expect(parsed.document).toMatchObject({
      name: 'Story',
      metadata: {
        openneko: {
          cut: {
            profile: '1080p30',
            editRateNumerator: 30,
            editRateDenominator: 1,
            width: 1920,
            height: 1080,
          },
        },
      },
    });
    expect(isValidCutDocumentBytes(bytes)).toBe(true);
    expect(isValidCutDocumentBytes(new TextEncoder().encode('{}'))).toBe(false);
  });
});
