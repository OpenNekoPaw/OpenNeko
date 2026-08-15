import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { encodeProjectEntityDocument } from '@neko/entity-domain';
import { createGlobalMediaLibraryConnection } from './global-media-library-files';
import { ProjectMediaLibraryBindingRepository } from './project-media-library-binding-repository';
import { initializeProjectMediaLibraryBindings } from './project-media-library-initialization';
import { createWorkspaceLinkedMediaLibrary } from './workspace-linked-media-libraries';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('initializeProjectMediaLibraryBindings', () => {
  it('rebuilds an absent binding only from one exact registered link required by project facts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'neko-media-init-'));
    roots.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    const target = path.join(root, 'Footage');
    const globalMediaLibraryRoot = path.join(root, 'global-media-libraries');
    await Promise.all([
      mkdir(path.join(workspaceRoot, 'neko'), { recursive: true }),
      mkdir(target),
    ]);
    await writeFile(
      path.join(workspaceRoot, 'neko', 'entities.json'),
      encodeProjectEntityDocument({
        projectId: 'project-1',
        entities: [
          {
            entityId: 'entity-1',
            kind: 'character',
            names: { canonical: 'Hero', aliases: [] },
            representations: [
              {
                bindingId: 'binding-1',
                target: {
                  kind: 'media-library',
                  libraryName: 'Footage',
                  relativePath: 'hero.png',
                },
                role: 'portrait',
                source: 'user',
                acceptedAt: '2026-08-14T00:00:00.000Z',
              },
            ],
            lifecycle: { state: 'active' },
            createdAt: '2026-08-14T00:00:00.000Z',
            updatedAt: '2026-08-14T00:00:00.000Z',
          },
        ],
      }),
    );
    await writeFile(path.join(target, 'hero.png'), 'hero');
    const connection = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: globalMediaLibraryRoot,
      sourceDirectory: target,
      locationKind: 'local',
    });
    await createWorkspaceLinkedMediaLibrary({
      workspaceRoot,
      name: 'Footage',
      targetDirectory: target,
    });

    await expect(
      initializeProjectMediaLibraryBindings({
        projectId: 'project-1',
        workspaceRoot,
        globalMediaLibraryRoot,
      }),
    ).resolves.toEqual({ adoptedLibraryNames: ['Footage'], diagnostics: [] });
    await expect(
      new ProjectMediaLibraryBindingRepository(workspaceRoot, 'project-1').read('Footage'),
    ).resolves.toMatchObject({
      status: 'available',
      binding: { connectionId: connection.libraryId },
    });
  });
});
