import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ProjectEntityBindingAvailabilityService,
  encodeProjectEntityDocument,
} from '@neko/entity-domain';
import type {
  EntityAssetProjectionReplaceSourceRequest,
  EntityBindingAvailabilityProjectionValue,
  ProjectEntityDocument,
} from '@neko/entity-domain';
import { refreshProjectEntityBindingAvailability } from './node-project-entity-binding-availability';
import { NodeProjectEntityRepository } from './node-project-entity-repository';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('refreshProjectEntityBindingAvailability', () => {
  it('atomically replaces only the Project binding projection source', async () => {
    const replaceSource = vi.fn(async (_request: EntityAssetProjectionReplaceSourceRequest) => {});
    const value: EntityBindingAvailabilityProjectionValue = {
      bindingId: 'binding-rin',
      entityId: 'character-rin',
      entityKind: 'character',
      representation: { kind: 'workspace-file', path: 'rin.png' },
      role: 'portrait',
      owner: 'workspace-file',
      availability: 'available',
      checkedAt: UPDATED_AT,
    };

    await refreshProjectEntityBindingAvailability(
      {
        documentRepository: {
          load: async () => DOCUMENT,
          commit: async () => {
            throw new Error('Availability projection must not commit canonical Entity facts.');
          },
        },
        availability: { project: async () => [value] },
        projections: {
          list: vi.fn(),
          replaceSource,
          insertMissing: vi.fn(),
        },
        partition: {
          scope: 'workspace',
          workspaceId: 'project-neko',
          domain: 'entity-asset-projection',
        },
      },
      UPDATED_AT,
    );

    expect(replaceSource).toHaveBeenCalledOnce();
    expect(replaceSource).toHaveBeenCalledWith({
      partition: {
        scope: 'workspace',
        workspaceId: 'project-neko',
        domain: 'entity-asset-projection',
      },
      sourceId: 'project-entity-bindings:project-neko',
      records: [
        {
          projectionId: 'binding:binding-rin',
          kind: 'binding-availability',
          sourceId: 'project-entity-bindings:project-neko',
          entityId: 'character-rin',
          freshness: 'fresh',
          value,
          updatedAt: UPDATED_AT,
        },
      ],
      updatedAt: UPDATED_AT,
    });
  });

  it('replaces the source with an empty batch when bindings disappear', async () => {
    const replaceSource = vi.fn(async (_request: EntityAssetProjectionReplaceSourceRequest) => {});
    await refreshProjectEntityBindingAvailability(
      {
        documentRepository: {
          load: async () => DOCUMENT,
          commit: vi.fn(),
        },
        availability: { project: async () => [] },
        projections: { list: vi.fn(), replaceSource, insertMissing: vi.fn() },
        partition: {
          scope: 'workspace',
          workspaceId: 'project-neko',
          domain: 'entity-asset-projection',
        },
      },
      UPDATED_AT,
    );

    expect(replaceSource).toHaveBeenCalledWith(expect.objectContaining({ records: [] }));
  });

  it('keeps canonical facts byte-identical when every binding owner becomes unavailable', async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), 'neko-binding-isolation-'));
    temporaryDirectories.push(workspacePath);
    const document = documentWithBindings();
    const source = encodeProjectEntityDocument(document);
    const entityPath = join(workspacePath, 'neko', 'entities.json');
    await mkdir(join(workspacePath, 'neko'), { recursive: true });
    await writeFile(entityPath, source, 'utf8');
    const replaceSource = vi.fn(async (_request: EntityAssetProjectionReplaceSourceRequest) => {});
    const unavailable = (code: 'content-missing' | 'content-unauthorized') => ({
      stat: vi.fn(
        async (
          locator: ProjectEntityDocument['entities'][number]['representations'][number]['target'],
        ) => ({
          status: 'unavailable' as const,
          locator,
          diagnostic: { code },
        }),
      ),
    });

    await refreshProjectEntityBindingAvailability(
      {
        documentRepository: new NodeProjectEntityRepository({
          workspacePath,
          projectId: document.projectId,
        }),
        availability: new ProjectEntityBindingAvailabilityService({
          workspaceFile: unavailable('content-missing'),
          documentEntry: unavailable('content-missing'),
          generatedOutput: unavailable('content-unauthorized'),
          packageResource: unavailable('content-missing'),
        }),
        projections: { list: vi.fn(), replaceSource, insertMissing: vi.fn() },
        partition: {
          scope: 'workspace',
          workspaceId: document.projectId,
          domain: 'entity-asset-projection',
        },
      },
      UPDATED_AT,
    );

    const request = replaceSource.mock.calls[0]?.[0];
    expect(request?.records.map((record) => record.value)).toEqual([
      expect.objectContaining({
        bindingId: 'binding-file',
        availability: 'needs-attention',
        attention: { diagnostic: { code: 'content-missing' }, action: 'rebind' },
      }),
      expect.objectContaining({
        bindingId: 'binding-document',
        availability: 'needs-attention',
        attention: { diagnostic: { code: 'content-missing' }, action: 'rebind' },
      }),
      expect.objectContaining({
        bindingId: 'binding-generated',
        availability: 'needs-attention',
        attention: { diagnostic: { code: 'content-unauthorized' }, action: 'reconnect' },
      }),
      expect.objectContaining({
        bindingId: 'binding-asset',
        availability: 'needs-attention',
        attention: { diagnostic: { code: 'content-missing' }, action: 'reinstall' },
      }),
    ]);
    await expect(readFile(entityPath, 'utf8')).resolves.toBe(source);
  });
});

const DOCUMENT: ProjectEntityDocument = {
  schemaVersion: 1,
  projectId: 'project-neko',
  revision: 1,
  entities: [],
};
const UPDATED_AT = '2026-08-05T03:00:00.000Z';

function documentWithBindings(): ProjectEntityDocument {
  return {
    schemaVersion: 1,
    projectId: 'project-neko',
    revision: 7,
    entities: [
      {
        entityId: 'character-rin',
        kind: 'character',
        names: { canonical: 'Rin', aliases: [] },
        facts: { role: 'lead' },
        representations: [
          binding('binding-file', { kind: 'workspace-file', path: 'missing.png' }),
          binding('binding-document', {
            kind: 'document-entry',
            source: { kind: 'workspace-file', path: 'removed-link.epub' },
            entryPath: 'images/rin.png',
          }),
          binding('binding-generated', {
            kind: 'generated-output',
            outputId: 'output-rin',
            revision: '1',
            digest: 'a'.repeat(64),
            path: 'neko/generated/rin.png',
          }),
          binding('binding-asset', {
            kind: 'package-resource',
            packageId: 'asset-rin',
            revision: '4',
            digest: 'b'.repeat(64),
            resourcePath: 'model/model.json',
          }),
        ],
        lifecycle: { state: 'active' },
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      },
    ],
  };
}

function binding(
  bindingId: string,
  target: ProjectEntityDocument['entities'][number]['representations'][number]['target'],
): ProjectEntityDocument['entities'][number]['representations'][number] {
  return {
    bindingId,
    role: 'reference',
    target,
    source: 'user',
    acceptedAt: '2026-08-05T00:00:00.000Z',
  };
}
