import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NodeProjectEntityAuthoringService } from './node-project-entity-authoring-service';

describe('NodeProjectEntityAuthoringService', () => {
  it('creates and requires one exact active character Entity', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'neko-project-entity-authoring-'));
    const service = createService(root);
    await service.createCharacterEntity(characterRequest('entity-1'));
    await expect(service.requireCharacterEntity('entity-1')).resolves.toBeUndefined();
    await expect(service.requireCharacterEntity('same-name')).rejects.toMatchObject({
      diagnostics: [{ code: 'project-entity-not-found', entityId: 'same-name' }],
    });
    await expect(readFile(path.join(root, 'neko/entities.json'), 'utf8')).resolves.toContain(
      '"entityId": "entity-1"',
    );
  });

  it('rejects non-character creation before committing any Entity bytes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'neko-project-entity-authoring-'));
    const service = createService(root);
    await expect(
      service.createCharacterEntity({
        ...characterRequest('entity-location'),
        semantic: { ...characterRequest('entity-location').semantic, kind: 'location' },
      }),
    ).rejects.toMatchObject({
      diagnostics: [{ code: 'project-entity-operation-invalid' }],
    });
    await expect(readFile(path.join(root, 'neko/entities.json'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

function createService(workspacePath: string): NodeProjectEntityAuthoringService {
  return new NodeProjectEntityAuthoringService({
    workspace: { workspaceId: 'workspace-1', workspacePath },
  });
}

function characterRequest(entityId: string) {
  return {
    entityId,
    semantic: {
      kind: 'character' as const,
      names: { canonical: 'Lin', display: 'Lin', aliases: [] },
      representations: [],
    },
    createdAt: '2026-08-12T00:00:00.000Z',
  };
}
