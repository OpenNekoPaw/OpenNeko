import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { encodeProjectEntityDocument } from '@neko/entity-domain';
import { resolveGlobalStorageLayout } from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import { ensureNodeWorkspaceIdentityDescriptor } from '@neko/local-metadata/node-workspace-identity';
import { createNodeWorkspaceSemanticEntityMetadataBinding } from '@neko/search-local-metadata';
import { NodeProjectEntityProjectionRuntime } from './node-project-entity-projection-runtime';

describe('NodeProjectEntityProjectionRuntime', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('projects semantic candidates and binding attention through the shared metadata Store', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-entity-projection-runtime-'));
    roots.push(root);
    const homedir = path.join(root, 'home');
    const workspacePath = path.join(root, 'workspace');
    await Promise.all([
      mkdir(homedir, { recursive: true }),
      mkdir(path.join(workspacePath, 'neko'), { recursive: true }),
    ]);
    await writeFile(path.join(workspacePath, 'episode.fountain'), 'MIO\nHello.\n', 'utf8');
    await ensureNodeWorkspaceIdentityDescriptor(workspacePath, () => WORKSPACE_ID);
    await writeFile(
      path.join(workspacePath, 'neko', 'entities.json'),
      encodeProjectEntityDocument({
        projectId: WORKSPACE_ID,
        entities: [
          {
            entityId: 'character-rin',
            kind: 'character',
            names: { canonical: 'Rin', aliases: [] },
            representations: [
              {
                bindingId: 'binding-rin',
                target: { file: { authority: 'workspace', path: 'characters/rin.png' } },
                role: 'portrait',
                source: 'user',
                acceptedAt: NOW,
              },
            ],
            lifecycle: { state: 'active' },
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      }),
      'utf8',
    );
    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 2_000,
    });
    const runtime = new NodeProjectEntityProjectionRuntime({
      homedir,
      metadataStore,
      projections: metadataStore.repositories.projectEntityProjections,
      now: () => NOW,
    });

    await runtime.refresh({ workspaceId: WORKSPACE_ID, workspacePath });

    await expect(
      metadataStore.repositories.projectEntityProjections.list({
        partition: {
          scope: 'workspace',
          workspaceId: WORKSPACE_ID,
          domain: 'project-entity-projection',
        },
        kinds: ['entity-candidate', 'binding-availability'],
      }),
    ).resolves.toEqual({
      records: expect.arrayContaining([
        expect.objectContaining({
          kind: 'entity-candidate',
          value: expect.objectContaining({ proposedNames: { canonical: 'MIO', aliases: [] } }),
        }),
        expect.objectContaining({
          kind: 'binding-availability',
          value: expect.objectContaining({
            bindingId: 'binding-rin',
            availability: 'needs-attention',
            attention: { diagnostic: { code: 'content-missing' }, action: 'rebind' },
          }),
        }),
      ]),
      diagnostics: [],
    });

    await runtime.dispose();
    expect(metadataStore.state).toBe('open');
    await metadataStore.dispose();
  });

  it('releases a metadata binding created concurrently with disposal', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-entity-projection-dispose-'));
    roots.push(root);
    const homedir = path.join(root, 'home');
    const workspacePath = path.join(root, 'workspace');
    await Promise.all([
      mkdir(homedir, { recursive: true }),
      mkdir(workspacePath, { recursive: true }),
    ]);
    await ensureNodeWorkspaceIdentityDescriptor(workspacePath, () => WORKSPACE_ID);
    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 2_000,
    });
    let signalBindingReady = () => {};
    const bindingReady = new Promise<void>((resolve) => {
      signalBindingReady = resolve;
    });
    let releaseBinding = () => {};
    const bindingGate = new Promise<void>((resolve) => {
      releaseBinding = resolve;
    });
    let bindingDisposeCount = 0;
    const runtime = new NodeProjectEntityProjectionRuntime({
      homedir,
      metadataStore,
      projections: metadataStore.repositories.projectEntityProjections,
      createMetadataBinding: async (options) => {
        const binding = await createNodeWorkspaceSemanticEntityMetadataBinding(options);
        signalBindingReady();
        await bindingGate;
        return {
          ...binding,
          dispose: async () => {
            bindingDisposeCount += 1;
            await binding.dispose();
          },
        };
      },
    });

    const refreshing = runtime.refresh({ workspaceId: WORKSPACE_ID, workspacePath });
    await bindingReady;
    const disposing = runtime.dispose();
    releaseBinding();

    await expect(refreshing).rejects.toThrow('projection runtime is disposed');
    await disposing;
    expect(bindingDisposeCount).toBe(1);
    expect(metadataStore.state).toBe('open');
    await metadataStore.dispose();
  });
});

const NOW = '2026-08-05T04:00:00.000Z';
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
