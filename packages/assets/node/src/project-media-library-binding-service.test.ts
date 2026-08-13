import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { confirmProjectMediaLibraryRecovery } from '@neko/assets-domain/contracts';
import { ProjectMediaLibraryBindingRepository } from './project-media-library-binding-repository';
import { ProjectMediaLibraryBindingService } from './project-media-library-binding-service';

const PROJECT_ID = 'project-neko';
const CONNECTION_ID = 'media-library:local:Footage';
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ProjectMediaLibraryBindingService', () => {
  it('plans without mutation and applies only an explicit current confirmation', async () => {
    const fixture = await createFixture();
    const plan = await fixture.service.plan({
      libraryName: 'Footage',
      connectionId: CONNECTION_ID,
    });

    await expect(fixture.bindings.read('Footage')).resolves.toMatchObject({ status: 'absent' });
    expect(plan).toMatchObject({
      projectId: PROJECT_ID,
      libraryName: 'Footage',
      connectionId: CONNECTION_ID,
      requirementFingerprint: fixture.requirement.requirementFingerprint,
      validatedRelativePaths: ['shots/hero.mov'],
      expectedBindingFingerprint: null,
    });

    await fixture.service.apply(confirmProjectMediaLibraryRecovery(plan));
    await expect(fixture.bindings.read('Footage')).resolves.toMatchObject({
      status: 'available',
      binding: { connectionId: CONNECTION_ID },
    });
  });

  it('rejects cancellation and stale references without changing the binding', async () => {
    const fixture = await createFixture();
    const plan = await fixture.service.plan({
      libraryName: 'Footage',
      connectionId: CONNECTION_ID,
    });

    await expect(fixture.service.apply({ confirmed: false, plan })).rejects.toThrow(
      'explicitly confirmed',
    );
    fixture.requirement.requirementFingerprint = 'sha256:changed-requirement-1234';
    await expect(fixture.service.apply(confirmProjectMediaLibraryRecovery(plan))).rejects.toThrow(
      'references changed',
    );
    await expect(fixture.bindings.read('Footage')).resolves.toMatchObject({ status: 'absent' });
  });

  it('removes only the local binding record', async () => {
    const fixture = await createFixture();
    const binding = await fixture.service.apply(
      confirmProjectMediaLibraryRecovery(
        await fixture.service.plan({
          libraryName: 'Footage',
          connectionId: CONNECTION_ID,
        }),
      ),
    );

    await fixture.service.remove({
      libraryName: 'Footage',
      expectedBindingFingerprint: binding.bindingFingerprint,
    });

    await expect(fixture.bindings.read('Footage')).resolves.toMatchObject({ status: 'absent' });
    await expect(
      import('node:fs/promises').then(({ readFile }) =>
        readFile(path.join(fixture.libraryRoot, 'shots', 'hero.mov'), 'utf8'),
      ),
    ).resolves.toBe('hero');
  });
});

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'neko-binding-service-'));
  roots.push(root);
  const workspace = path.join(root, 'workspace');
  const libraryRoot = path.join(root, 'library');
  await Promise.all([
    mkdir(workspace, { recursive: true }),
    mkdir(path.join(libraryRoot, 'shots'), { recursive: true }),
  ]);
  await writeFile(path.join(libraryRoot, 'shots', 'hero.mov'), 'hero');
  const bindings = new ProjectMediaLibraryBindingRepository(workspace, PROJECT_ID);
  const requirement = {
    projectId: PROJECT_ID,
    libraryName: 'Footage',
    requirementFingerprint: 'sha256:requirement-footage-1234',
    referenceCount: 1,
    relativePaths: ['shots/hero.mov'],
  };
  const service = new ProjectMediaLibraryBindingService({
    projectId: PROJECT_ID,
    bindings,
    connections: {
      resolveAuthorizedTarget: async (connectionId) => {
        if (connectionId !== CONNECTION_ID) throw new Error('unavailable');
        return libraryRoot;
      },
    },
    requirements: { read: async () => requirement },
  });
  return { service, bindings, requirement, libraryRoot };
}
