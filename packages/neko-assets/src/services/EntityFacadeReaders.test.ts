import { describe, expect, it, vi } from 'vitest';
import { ENTITY_FACADE_COMMANDS } from '@neko/shared';
import { createEntityFacadeReaders } from './EntityFacadeReaders';

vi.mock('vscode', () => ({
  commands: { executeCommand: vi.fn() },
}));

describe('createEntityFacadeReaders', () => {
  it('loads Creative Entities without projecting Asset metadata', async () => {
    const executeCommand = vi.fn(async () => [
      {
        id: 'char-rin',
        kind: 'character',
        canonicalName: 'Rin',
        displayName: 'Rin Aoki',
        aliases: ['青木凛'],
        status: 'confirmed',
        metadata: { biography: 'Fixture' },
      },
      {
        id: 'loc-school',
        kind: 'location',
        canonicalName: 'School',
        aliases: [],
        status: 'confirmed',
      },
    ]);
    const readers = createEntityFacadeReaders({
      projectRoot: '/workspace',
      executeCommand,
    });

    await expect(readers.entities.list()).resolves.toEqual([
      expect.objectContaining({
        id: 'char-rin',
        canonicalName: 'Rin',
        displayName: 'Rin Aoki',
        metadata: { biography: 'Fixture' },
      }),
    ]);
    await expect(readers.entities.resolveByName('青木凛')).resolves.toEqual(
      expect.objectContaining({ id: 'char-rin' }),
    );
    expect(executeCommand).toHaveBeenCalledWith(ENTITY_FACADE_COMMANDS.listEntities, {
      projectRoot: '/workspace',
      query: { kind: 'character' },
    });
  });

  it('loads direct representation bindings through entity facade commands', async () => {
    const binding = {
      id: 'binding-rin-portrait',
      entityId: 'char-rin',
      entityKind: 'character',
      representation: {
        kind: 'workspace-file',
        path: 'neko/assets/Characters/rin.png',
      },
      role: 'portrait',
      status: 'confirmed',
      availability: 'active',
      source: 'user',
      updatedAt: '2026-06-10T00:00:00.000Z',
    };
    const executeCommand = vi.fn(async () => [binding]);
    const readers = createEntityFacadeReaders({
      projectRoot: '/workspace',
      executeCommand,
    });

    await expect(readers.bindings.list()).resolves.toEqual([binding]);
    expect(executeCommand).toHaveBeenCalledWith(ENTITY_FACADE_COMMANDS.listBindings, {
      projectRoot: '/workspace',
    });
  });
});
