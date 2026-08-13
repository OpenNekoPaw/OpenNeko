import { describe, expect, it } from 'vitest';
import { projectEntityBindingAvailabilityText } from '../bindingAvailabilityProjection';

describe('binding availability projection', () => {
  it('preserves textual context while marking orphaned bindings unavailable', () => {
    expect(
      projectEntityBindingAvailabilityText({
        bindingId: 'binding-rin-portrait',
        entityId: 'character-rin',
        entityKind: 'character',
        role: 'portrait',
        representation: {
          kind: 'media-library',
          libraryName: 'Characters',
          relativePath: 'missing-portrait.png',
        },
        owner: 'media-library',
        availability: 'needs-attention',
        attention: { diagnostic: { code: 'content-missing' }, action: 'rebind' },
        isDefault: true,
        checkedAt: '2026-06-10T01:00:00.000Z',
      }),
    ).toBe('portrait: Characters/missing-portrait.png · media-library · needs attention · default');
  });
});
