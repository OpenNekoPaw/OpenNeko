import { describe, expect, it } from 'vitest';
import { projectEntityBindingAvailabilityText } from '../bindingAvailabilityProjection';

describe('binding availability projection', () => {
  it('preserves textual context while marking orphaned bindings unavailable', () => {
    expect(
      projectEntityBindingAvailabilityText({
        role: 'portrait',
        assetRef: 'project://assets/missing-portrait',
        status: 'confirmed',
        availability: 'orphaned',
        orphanedAt: '2026-06-10T01:00:00.000Z',
        isDefault: true,
      }),
    ).toBe(
      'portrait: project://assets/missing-portrait · confirmed · unavailable · default · orphaned at 2026-06-10T01:00:00.000Z',
    );
  });
});
