import { describe, expect, it } from 'vitest';
import type { EntityRepresentationBinding } from '@neko/shared';
import { EntityRepresentationResolver } from './representationResolver';

const portrait: EntityRepresentationBinding = {
  id: 'binding-portrait',
  entityId: 'char_xiaoju',
  entityKind: 'character',
  representation: { kind: 'workspace-file', path: 'neko/assets/xiaoju.png' },
  role: 'portrait',
  isDefault: true,
  status: 'confirmed',
  availability: 'active',
  source: 'user',
  updatedAt: '2026-07-22T00:00:00.000Z',
};

describe('EntityRepresentationResolver', () => {
  it('selects a direct binding using the consumer role order', async () => {
    const resolver = createResolver([portrait]);

    await expect(
      resolver.resolve({
        entityId: 'char_xiaoju',
        consumer: 'canvas',
        preferredRole: 'live2d',
      }),
    ).resolves.toEqual({
      status: 'resolved',
      entityId: 'char_xiaoju',
      binding: portrait,
      representation: portrait.representation,
      resolvedRole: 'portrait',
      usedAlternativeRole: true,
    });
  });

  it('does not resolve orphaned bindings or bypass allowAlternativeRoles=false', async () => {
    const orphaned: EntityRepresentationBinding = {
      ...portrait,
      id: 'binding-reference',
      role: 'reference',
      isDefault: undefined,
      availability: 'orphaned',
      orphanedAt: '2026-07-22T01:00:00.000Z',
    };
    const resolver = createResolver([portrait, orphaned]);

    await expect(
      resolver.resolve({
        entityId: 'char_xiaoju',
        consumer: 'agent',
        preferredRole: 'reference',
        allowAlternativeRoles: false,
      }),
    ).resolves.toEqual({
      status: 'missing-representation',
      entityId: 'char_xiaoju',
      missingRoles: ['reference'],
      suggestedActions: ['generate', 'bind-existing', 'dismiss'],
    });
  });
});

function createResolver(bindings: readonly EntityRepresentationBinding[]) {
  return new EntityRepresentationResolver({
    entities: {
      get: async () => ({
        id: 'char_xiaoju',
        kind: 'character',
        canonicalName: '小橘',
        aliases: [],
        status: 'confirmed',
      }),
      list: async () => [],
      resolveByName: async () => undefined,
    },
    bindings: { list: async () => bindings },
  });
}
