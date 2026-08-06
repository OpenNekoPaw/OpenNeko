import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProjectEntityAssetPublicationService,
  type ProjectEntityAssetPortableSnapshot,
  type ProjectEntityAssetPreparedResource,
  type ProjectEntityAssetPublicationAdapter,
  type ProjectEntityAssetRevisionRef,
  type ProjectEntityDocument,
} from '../index';

describe('ProjectEntityAssetPublicationService', () => {
  let harness: PublicationHarness;

  beforeEach(() => {
    harness = new PublicationHarness();
  });

  it('embeds selected content, preserves exact dependencies, and omits rejected representations', async () => {
    const before = structuredClone(harness.document);

    await expect(harness.service.publish(REQUEST)).resolves.toEqual(PUBLISHED_REF);

    expect(harness.prepared.map((item) => item.source.kind)).toEqual([
      'workspace-file',
      'generated-output',
    ]);
    expect(harness.published?.snapshot.dependencies).toEqual([
      {
        assetId: 'asset-live2d',
        revision: '3',
        digest: 'd'.repeat(64),
      },
    ]);
    expect(
      harness.published?.snapshot.semantic.representations.map((binding) => binding.target),
    ).toEqual([
      expect.objectContaining({
        kind: 'package-resource',
        packageId: 'entity-asset-rin',
        revision: '5',
        resourcePath: 'representations/portrait.png',
      }),
      expect.objectContaining({
        kind: 'package-resource',
        packageId: 'entity-asset-rin',
        revision: '5',
        resourcePath: 'representations/generated.png',
      }),
      expect.objectContaining({
        kind: 'package-resource',
        packageId: 'asset-live2d',
        revision: '3',
        resourcePath: 'model/model.json',
      }),
    ]);
    expect(JSON.stringify(harness.published?.snapshot)).not.toContain('story.epub');
    expect(JSON.stringify(harness.published?.snapshot)).not.toContain('neko/generated/rin.png');
    expect(harness.document).toEqual(before);
    expect(harness.repositoryMutation).not.toHaveBeenCalled();
  });

  it('rejects partial plans and external dependency substitution before staging', async () => {
    await expect(
      harness.service.publish({ ...REQUEST, representations: REQUEST.representations.slice(1) }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'invalid-project-entity-asset-snapshot' }] });
    await expect(
      harness.service.publish({
        ...REQUEST,
        representations: REQUEST.representations.map((plan) =>
          plan.bindingId === 'binding-workspace'
            ? { bindingId: plan.bindingId, mode: 'dependency' as const }
            : plan,
        ),
      }),
    ).rejects.toMatchObject({ diagnostics: [{ code: 'invalid-project-entity-asset-snapshot' }] });
    expect(harness.prepared).toHaveLength(0);
    expect(harness.publish).not.toHaveBeenCalled();
  });

  it('aborts staging when a prepared resource or published revision mismatches', async () => {
    harness.prepareResult = {
      resourceId: 'prepared-wrong',
      resourcePath: 'representations/wrong.png',
      digest: 'b'.repeat(64),
    };
    await expect(harness.service.publish(REQUEST)).rejects.toMatchObject({
      diagnostics: [{ code: 'invalid-project-entity-asset-snapshot' }],
    });
    expect(harness.aborted).toEqual(['publish-rin']);

    harness = new PublicationHarness();
    harness.publishResult = { ...PUBLISHED_REF, revision: '6' };
    await expect(harness.service.publish(REQUEST)).rejects.toMatchObject({
      diagnostics: [{ code: 'invalid-project-entity-asset-snapshot' }],
    });
    expect(harness.aborted).toEqual(['publish-rin']);
  });

  it('rejects a missing Project Entity without reading or publishing Asset state', async () => {
    await expect(
      harness.service.publish({ ...REQUEST, entityId: 'character-missing' }),
    ).rejects.toMatchObject({
      diagnostics: [{ code: 'project-entity-not-found' }],
    });
    expect(harness.prepared).toHaveLength(0);
    expect(harness.publish).not.toHaveBeenCalled();
  });
});

class PublicationHarness {
  document: ProjectEntityDocument = DOCUMENT;
  prepareResult: ProjectEntityAssetPreparedResource | undefined;
  publishResult: ProjectEntityAssetRevisionRef = PUBLISHED_REF;
  readonly prepared: Array<{
    operationId: string;
    source: ProjectEntityDocument['entities'][number]['representations'][number]['target'];
    resourcePath: string;
  }> = [];
  readonly aborted: string[] = [];
  published:
    | {
        operationId: string;
        snapshot: ProjectEntityAssetPortableSnapshot;
        preparedResources: readonly ProjectEntityAssetPreparedResource[];
      }
    | undefined;
  readonly repositoryMutation = vi.fn();
  readonly publish = vi.fn(
    async (request: Parameters<ProjectEntityAssetPublicationAdapter['publish']>[0]) => {
      this.published = request;
      return this.publishResult;
    },
  );

  readonly service = new ProjectEntityAssetPublicationService({
    repository: {
      load: async () => this.document,
      mutate: this.repositoryMutation,
    },
    assets: {
      prepareResource: async (request) => {
        this.prepared.push(request);
        return (
          this.prepareResult ?? {
            resourceId: `prepared-${String(this.prepared.length)}`,
            resourcePath: request.resourcePath,
            digest: request.resourcePath.includes('portrait') ? 'b'.repeat(64) : 'c'.repeat(64),
          }
        );
      },
      publish: this.publish,
      abort: async (operationId) => {
        this.aborted.push(operationId);
      },
    },
  });
}

const REQUEST = {
  operationId: 'publish-rin',
  entityId: 'character-rin',
  target: { assetId: 'entity-asset-rin', revision: '5' },
  representations: [
    {
      bindingId: 'binding-workspace',
      mode: 'embed',
      resourcePath: 'representations/portrait.png',
    },
    { bindingId: 'binding-document', mode: 'omit' },
    {
      bindingId: 'binding-generated',
      mode: 'embed',
      resourcePath: 'representations/generated.png',
    },
    { bindingId: 'binding-package', mode: 'dependency' },
  ],
} as const;

const PUBLISHED_REF = {
  assetId: 'entity-asset-rin',
  revision: '5',
  digest: 'e'.repeat(64),
};

const DOCUMENT: ProjectEntityDocument = {
  projectId: 'project-neko',
  entities: [
    {
      entityId: 'character-rin',
      kind: 'character',
      names: { canonical: 'Rin', aliases: [] },
      facts: { role: 'lead' },
      representations: [
        binding('binding-workspace', { kind: 'workspace-file', path: 'portrait.png' }),
        binding('binding-document', {
          kind: 'document-entry',
          source: { kind: 'workspace-file', path: 'story.epub' },
          entryPath: 'images/rin.png',
        }),
        binding('binding-generated', {
          kind: 'generated-output',
          outputId: 'output-rin',
          digest: 'a'.repeat(64),
          path: 'neko/generated/rin.png',
        }),
        binding('binding-package', {
          kind: 'package-resource',
          packageId: 'asset-live2d',
          revision: '3',
          digest: 'd'.repeat(64),
          resourcePath: 'model/model.json',
        }),
      ],
      lifecycle: { state: 'active' },
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    },
  ],
};

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
