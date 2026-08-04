import { describe, expect, it, vi } from 'vitest';
import type {
  EntityAssetProjectionReplaceSourceRequest,
  EntityBindingAvailabilityProjectionValue,
  ProjectEntityDocument,
} from '@neko/entity-domain';
import { refreshProjectEntityBindingAvailability } from './node-project-entity-binding-availability';

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
});

const DOCUMENT: ProjectEntityDocument = {
  schemaVersion: 1,
  projectId: 'project-neko',
  revision: 1,
  entities: [],
};
const UPDATED_AT = '2026-08-05T03:00:00.000Z';
