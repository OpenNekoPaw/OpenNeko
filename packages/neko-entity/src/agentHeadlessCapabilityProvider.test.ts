import { describe, expect, it, vi } from 'vitest';
import { TOOL_NAMES_ENTITY } from '@neko/shared';
import { createCreativeEntityHeadlessCapabilityProvider } from './agentHeadlessCapabilityProvider';

describe('CreativeEntityHeadlessCapabilityProvider', () => {
  it('exposes direct representation binding as an explicit confirmation-gated mutation', () => {
    const provider = createProvider();
    const tool = provider
      .getTools({ extensionContext: undefined })
      .find((candidate) => candidate.name === TOOL_NAMES_ENTITY.BIND_ENTITY_REPRESENTATION);

    expect(tool).toMatchObject({
      requiresConfirmation: true,
      safetyKind: 'confirmation-gated',
      requirements: { writableProject: true },
      targetRequirements: {
        required: ['entityId', 'entityKind', 'role', 'representation'],
        confirmationModes: ['bind-representation'],
      },
    });
    expect(tool?.description).not.toMatch(/AssetEntity|project:\/\/assets|cache path/i);
  });

  it('passes a canonical generated-output locator to the Entity owner', async () => {
    const bindRepresentation = vi.fn(async (input) => ({
      binding: {
        id: 'binding:character:char-rin:portrait:generated',
        ...input,
        status: 'confirmed' as const,
        availability: 'active' as const,
        source: 'agent' as const,
        updatedAt: '2026-07-22T00:00:00.000Z',
      },
    }));
    const provider = createProvider(bindRepresentation);
    const tool = provider
      .getTools({ extensionContext: undefined })
      .find((candidate) => candidate.name === TOOL_NAMES_ENTITY.BIND_ENTITY_REPRESENTATION);
    const representation = {
      kind: 'generated-output' as const,
      outputId: 'generated-rin-portrait',
      revision: 'revision-1',
      digest: 'sha256:generated-rin-portrait',
      path: 'neko/generated/image/rin-portrait.png',
    };

    const result = await tool?.execute({
      entityId: 'char-rin',
      entityKind: 'character',
      role: 'portrait',
      isDefault: true,
      representation,
    });

    expect(result).toMatchObject({
      success: true,
      data: { binding: { entityId: 'char-rin', representation } },
    });
    expect(bindRepresentation).toHaveBeenCalledWith({
      entityId: 'char-rin',
      entityKind: 'character',
      role: 'portrait',
      isDefault: true,
      representation,
    });
  });

  it('rejects physical paths before calling the Entity owner', async () => {
    const bindRepresentation = vi.fn();
    const provider = createProvider(bindRepresentation);
    const tool = provider
      .getTools({ extensionContext: undefined })
      .find((candidate) => candidate.name === TOOL_NAMES_ENTITY.BIND_ENTITY_REPRESENTATION);

    const result = await tool?.execute({
      entityId: 'char-rin',
      entityKind: 'character',
      role: 'portrait',
      representation: { kind: 'workspace-file', path: '/Users/example/private.png' },
    });

    expect(result).toMatchObject({ success: false });
    expect(bindRepresentation).not.toHaveBeenCalled();
  });
});

function createProvider(
  bindRepresentation = vi.fn(async () => {
    throw new Error('not used');
  }),
) {
  return createCreativeEntityHeadlessCapabilityProvider({
    list: async () => [],
    get: async () => undefined,
    bindRepresentation,
  });
}
