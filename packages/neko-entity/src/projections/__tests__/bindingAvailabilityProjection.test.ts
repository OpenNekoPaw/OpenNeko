import { describe, expect, it } from 'vitest';
import { projectEntityBindingAvailabilityText } from '../bindingAvailabilityProjection';

describe('binding availability projection', () => {
  it('preserves textual context while marking orphaned bindings unavailable', () => {
    expect(
      projectEntityBindingAvailabilityText({
        role: 'portrait',
        representation: { kind: 'workspace-file', path: 'neko/assets/missing-portrait.png' },
        status: 'confirmed',
        availability: 'orphaned',
        orphanedAt: '2026-06-10T01:00:00.000Z',
        isDefault: true,
      }),
    ).toBe(
      'portrait: neko/assets/missing-portrait.png · confirmed · unavailable · default · orphaned at 2026-06-10T01:00:00.000Z',
    );
  });
});
