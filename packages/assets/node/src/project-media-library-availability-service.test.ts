import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  aggregateWorkspaceMediaLibraryRequirements,
  serializeProjectMediaLibraryBinding,
  type ProjectContentReferenceOwnerSnapshot,
} from '@neko/assets-domain/contracts';
import { createProjectMediaLibraryBindingFingerprint } from './project-media-library-binding-repository';
import { ProjectMediaLibraryAvailabilityService } from './project-media-library-availability-service';

const PROJECT_ID = 'project-neko';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ProjectMediaLibraryAvailabilityService', () => {
  it('isolates each required, invalid, unavailable, incomplete, and unreferenced binding state', async () => {
    const fixture = await createFixture([
      mediaOwner('boards/main.nkc', [
        ['Footage', 'shots/hero.mov'],
        ['Unlinked', 'missing.mov'],
        ['Gone', 'gone.mov'],
        ['Offline', 'offline.mov'],
        ['Incomplete', 'missing.mov'],
        ['Escaped', 'outside.mov'],
      ]),
    ]);
    const availableRoot = await fixture.library('Footage');
    await mkdir(path.join(availableRoot, 'shots'), { recursive: true });
    await writeFile(path.join(availableRoot, 'shots', 'hero.mov'), 'hero');
    await fixture.library('Incomplete');
    const escapedRoot = await fixture.library('Escaped');
    const outsideRoot = path.join(fixture.root, 'outside');
    await mkdir(outsideRoot);
    await writeFile(path.join(outsideRoot, 'outside.mov'), 'outside');
    await symlink(path.join(outsideRoot, 'outside.mov'), path.join(escapedRoot, 'outside.mov'));
    await Promise.all([
      fixture.bind('Footage'),
      fixture.bind('Gone'),
      fixture.bind('Offline'),
      fixture.bind('Incomplete'),
      fixture.bind('Escaped'),
      fixture.bind('Unused'),
    ]);
    await fixture.invalid('Broken');
    const connections = [
      fixture.connection('Footage', 'available'),
      fixture.connection('Offline', 'unavailable'),
      fixture.connection('Incomplete', 'available'),
      fixture.connection('Escaped', 'available'),
      fixture.connection('Unused', 'available'),
    ] as const;
    const service = fixture.service(connections);

    const projection = await service.inspect();

    expect(
      Object.fromEntries(projection.libraries.map((entry) => [entry.libraryName, entry.state])),
    ).toEqual({
      Broken: 'binding-invalid',
      Escaped: 'content-incomplete',
      Footage: 'available',
      Gone: 'connection-missing',
      Incomplete: 'content-incomplete',
      Offline: 'target-unavailable',
      Unlinked: 'required-unlinked',
      Unused: 'unreferenced-local-binding',
    });
    expect(projection.libraries.find((entry) => entry.libraryName === 'Footage')).toMatchObject({
      requiredRelativePaths: ['shots/hero.mov'],
    });
    expect(projection.libraries.find((entry) => entry.libraryName === 'Broken')).toMatchObject({
      diagnostic: { code: 'binding-invalid', projectId: PROJECT_ID },
    });
    await expect(service.readRequirement('Footage')).resolves.toMatchObject({
      projectId: PROJECT_ID,
      libraryName: 'Footage',
      relativePaths: ['shots/hero.mov'],
      requirementFingerprint: expect.stringMatching(/^sha256:/),
    });
  });

  it('treats deleted project-local state as an empty binding set without recreating it', async () => {
    const fixture = await createFixture([
      mediaOwner('boards/main.nkc', [['Footage', 'shots/hero.mov']]),
    ]);
    const service = fixture.service([]);

    await expect(service.inspect()).resolves.toMatchObject({
      libraries: [expect.objectContaining({ libraryName: 'Footage', state: 'required-unlinked' })],
    });
    await expect(
      import('node:fs/promises').then(({ stat }) => stat(path.join(fixture.workspace, '.neko'))),
    ).rejects.toThrow();
  });
});

function mediaOwner(
  ownerId: string,
  references: readonly (readonly [libraryName: string, relativePath: string])[],
): ProjectContentReferenceOwnerSnapshot {
  return {
    ownerKind: 'canvas',
    ownerId,
    sourceFingerprint: `sha256:${ownerId.replaceAll('/', '-')}`,
    references: references.map(([libraryName, relativePath]) => ({
      kind: 'media-library' as const,
      libraryName,
      relativePath,
    })),
  };
}

async function createFixture(owners: readonly ProjectContentReferenceOwnerSnapshot[]) {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-media-availability-'));
  roots.push(root);
  const workspace = path.join(root, 'workspace');
  const mediaRoot = path.join(root, 'media');
  await Promise.all([mkdir(workspace), mkdir(mediaRoot)]);
  const requirements = aggregateWorkspaceMediaLibraryRequirements({
    owners,
    coverage: { expectedOwnerKinds: ['canvas'], coveredOwnerKinds: ['canvas'] },
  });
  const targets = new Map<string, string>();
  return {
    root,
    workspace,
    async library(libraryName: string) {
      const target = path.join(root, 'libraries', libraryName);
      await mkdir(target, { recursive: true });
      targets.set(connectionId(libraryName), target);
      return target;
    },
    async bind(libraryName: string) {
      const binding = {
        projectId: PROJECT_ID,
        libraryName,
        connectionId: connectionId(libraryName),
        bindingFingerprint: createProjectMediaLibraryBindingFingerprint({
          projectId: PROJECT_ID,
          libraryName,
          connectionId: connectionId(libraryName),
        }),
      };
      const directory = path.join(workspace, '.neko', 'media-libraries');
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, `${libraryName}.json`),
        serializeProjectMediaLibraryBinding(binding),
      );
    },
    async invalid(libraryName: string) {
      const directory = path.join(workspace, '.neko', 'media-libraries');
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, `${libraryName}.json`), '{invalid');
    },
    connection(libraryName: string, availability: 'available' | 'unavailable') {
      return {
        libraryId: connectionId(libraryName),
        name: libraryName,
        locationKind: 'local' as const,
        linkPath: path.join(mediaRoot, libraryName),
        availability,
      };
    },
    service(connections: readonly ReturnType<typeof this.connection>[]) {
      return new ProjectMediaLibraryAvailabilityService({
        projectId: PROJECT_ID,
        workspaceRoot: workspace,
        globalMediaLibraryRoot: mediaRoot,
        readReferences: async () => ({ owners, diagnostics: [], requirements }),
        listConnections: async () => connections,
        resolveConnectionTarget: async (id) => {
          const target = targets.get(id);
          if (!target) throw new Error('unavailable');
          return target;
        },
      });
    },
  };
}

function connectionId(libraryName: string): string {
  return `media-library:local:${libraryName}`;
}
