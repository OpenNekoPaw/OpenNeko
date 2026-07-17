import { describe, expect, it } from 'vitest';
import {
  DefaultReferenceResolverService,
  collectReferencesFromCanvasNode,
  collectReferencesFromCompositeArtifact,
  collectReferencesFromGenericTable,
  collectReferencesFromShotImagePrepPlan,
  collectReferencesWithContributors,
  createReferenceDiagnostic,
  getReferenceDescriptorKey,
  summarizeReferencesFromCanvasNode,
  validateReferenceDescriptor,
  type ReferenceCollectionInput,
  type ReferenceContributorManifest,
  type ReferenceDescriptor,
} from '../reference-resolution';

describe('reference resolution contracts', () => {
  it('validates a stable reference descriptor', () => {
    const descriptor = makeDescriptor();

    expect(validateReferenceDescriptor(descriptor)).toEqual({ ok: true, diagnostics: [] });
    expect(getReferenceDescriptorKey(descriptor)).toContain('canvas-node|shot-1');
  });

  it('rejects runtime handles inside descriptor payloads', () => {
    const result = validateReferenceDescriptor({
      ...makeDescriptor(),
      payload: {
        type: 'path',
        path: 'blob:https://localhost/asset',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'reference-unsafe-runtime-handle',
          path: ['payload', 'path'],
        }),
      ]),
    );
  });

  it('computes entity representation severity from purpose and capability', () => {
    expect(
      createReferenceDiagnostic({
        code: 'entity-representation-missing',
        targetCapability: 'CanvasPreview',
        purpose: 'preview',
        phase: 'preflight',
      }).severity,
    ).toBe('warning');

    expect(
      createReferenceDiagnostic({
        code: 'entity-representation-missing',
        targetCapability: 'GenerateImage',
        purpose: 'provider-input',
        phase: 'preflight',
      }).severity,
    ).toBe('error');
  });

  it('uses one ReferenceSourceKind type for manifests and collection inputs', () => {
    const manifest: ReferenceContributorManifest = {
      contributorId: 'neko-canvas:shot',
      packageName: 'neko-canvas',
      sourceKinds: ['canvas-node'],
      nodeTypes: ['shot'],
      producedRoles: ['source', 'keyframe'],
      supportedModalities: ['image'],
    };

    const input: ReferenceCollectionInput = {
      sourceKind: manifest.sourceKinds[0],
      sourceId: 'shot-1',
      source: {},
      context: { purpose: 'collection' },
    };

    expect(input.sourceKind).toBe('canvas-node');
  });

  it('projects Canvas node reference fields without materializing runtime inputs', () => {
    const result = collectReferencesFromCanvasNode({
      id: 'shot-1',
      type: 'shot',
      data: {
        referenceImageResourceRef: {
          kind: 'document-entry',
          source: { filePath: '${PROJECT}/comic.cbz', format: 'cbz' },
          entryPath: 'page-01.png',
        },
        referenceImagePath: 'assets/panel.png',
        runtimeReferenceImagePath: 'vscode-resource://runtime/panel.png',
        referenceRefs: ['gallery-1'],
        generatedAsset: { id: 'asset-generated-1' },
      },
    });

    expect(result.descriptors.map((descriptor) => descriptor.referenceId)).toEqual(
      expect.arrayContaining([
        'shot-1:referenceImageResourceRef',
        'shot-1:referenceImagePath',
        'shot-1:referenceRefs:0',
        'shot-1:generatedAsset',
      ]),
    );
    expect(result.descriptors.map((descriptor) => descriptor.referenceId)).not.toContain(
      'shot-1:runtimeReferenceImagePath',
    );
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'reference-unsafe-runtime-handle',
          path: ['data', 'runtimeReferenceImagePath'],
        }),
      ]),
    );
  });

  it('projects gallery container placements as Canvas node references', () => {
    const result = collectReferencesFromCanvasNode({
      id: 'gallery-1',
      type: 'gallery',
      container: {
        policy: 'gallery',
        childIds: ['front'],
        childPlacements: {
          front: {
            childId: 'front',
            metadata: { label: 'Front' },
          },
        },
      },
      data: {
        preset: 'custom',
        rows: 1,
        cols: 1,
      },
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.descriptors).toHaveLength(1);
    expect(result.descriptors[0]).toMatchObject({
      referenceId: 'gallery-1:childPlacements:front',
      role: 'reference',
      modality: 'image',
      payload: {
        type: 'canvas-node',
        nodeId: 'front',
      },
      metadata: {
        field: 'container.childPlacements',
        placementId: 'front',
        label: 'Front',
      },
    });
  });

  it('summarizes Canvas references by role and diagnostic severity', () => {
    const summary = summarizeReferencesFromCanvasNode({
      id: 'shot-1',
      type: 'shot',
      data: {
        referenceImageResourceRef: {
          kind: 'document-entry',
          source: { filePath: '${PROJECT}/comic.cbz', format: 'cbz' },
          entryPath: 'page-01.png',
        },
        runtimeReferenceImagePath: 'vscode-resource://runtime/panel.png',
        referenceRefs: ['gallery-1'],
        generatedAsset: { id: 'asset-generated-1' },
      },
    });

    expect(summary).toMatchObject({
      sourceKind: 'canvas-node',
      sourceId: 'shot-1',
      total: 3,
      blockedCount: 1,
      groups: expect.arrayContaining([
        expect.objectContaining({ role: 'reference', modality: 'image', count: 2 }),
        expect.objectContaining({ role: 'output', modality: 'image', count: 1 }),
      ]),
    });
    expect(summary.diagnostics).toEqual([
      expect.objectContaining({ code: 'reference-unsafe-runtime-handle' }),
    ]);
  });

  it('projects shot image prep refs into source, mask, subject, layout, style, and output roles', () => {
    const result = collectReferencesFromShotImagePrepPlan({
      schemaVersion: 1,
      kind: 'shot-image-prep-plan',
      planId: 'prep-1',
      sceneId: 'scene-1',
      shotId: 'shot-1',
      imageStrategy: 'transform-original',
      operationPlan: ['crop-panel'],
      sourceMediaRefs: [
        {
          refId: 'source-1',
          role: 'source',
          locator: { type: 'workspace-path', path: '${PROJECT}/page-01.png' },
        },
      ],
      maskRefs: [
        {
          refId: 'mask-1',
          role: 'mask',
          locator: { type: 'workspace-path', path: '${PROJECT}/mask-01.png' },
        },
      ],
      referenceBundle: {
        characterRefs: [{ entityRef: { entityId: 'char-1', entityKind: 'character' } }],
        sceneRefs: [{ entityRef: { entityId: 'scene-1', entityKind: 'scene' } }],
        styleRefs: [
          {
            refId: 'style-1',
            role: 'reference',
            locator: { type: 'asset', assetId: 'style-asset' },
          },
        ],
      },
      outputMediaRefs: [
        {
          refId: 'out-1',
          role: 'generated',
          locator: { type: 'asset', assetId: 'generated-1' },
        },
      ],
      status: 'succeeded',
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.descriptors.map((descriptor) => descriptor.role)).toEqual(
      expect.arrayContaining(['source', 'mask', 'subject', 'layout', 'style', 'output']),
    );
  });

  it('projects GenericTable and CompositeArtifact media references', () => {
    const table = {
      schemaVersion: 1,
      kind: 'generic-table',
      tableId: 'table-1',
      title: 'Refs',
      columns: [{ columnId: 'preview', cellType: 'media-preview' }],
      rows: [
        {
          rowId: 'row-1',
          cells: {
            preview: {
              type: 'media-preview',
              value: {
                itemId: 'item-1',
                mediaType: 'image',
                resourceRef: {
                  kind: 'generated-asset',
                  assetId: 'asset-1',
                },
              },
            },
          },
        },
      ],
    } as const;

    const tableResult = collectReferencesFromGenericTable(table);
    expect(tableResult.descriptors).toHaveLength(1);
    expect(tableResult.descriptors[0]).toMatchObject({
      referenceKind: 'generated-asset',
      role: 'reference',
      modality: 'image',
    });

    const artifactResult = collectReferencesFromCompositeArtifact({
      schemaVersion: 1,
      kind: 'composite-artifact',
      artifactId: 'artifact-1',
      title: 'Artifact',
      blocks: [{ blockId: 'media-1', kind: 'media', media: table.rows[0].cells.preview.value }],
    });

    expect(artifactResult.descriptors).toHaveLength(1);
    expect(artifactResult.descriptors[0]?.sourceKind).toBe('composite-artifact');
  });

  it('keeps contributors pure and returns fallback diagnostics for unregistered sources', () => {
    const source = {
      id: 'shot-1',
      type: 'shot',
      data: { referenceRefs: ['gallery-1'] },
    };
    const collected = collectReferencesWithContributors({
      sourceKind: 'canvas-node',
      sourceId: 'shot-1',
      source,
      context: { purpose: 'collection' },
    });

    expect(collected.diagnostics).toEqual([]);
    expect(collected.descriptors).toHaveLength(1);
    expect(collected.descriptors[0]?.payload).toEqual({
      type: 'canvas-node',
      nodeId: 'gallery-1',
    });

    const fallback = collectReferencesWithContributors({
      sourceKind: 'character-memory',
      sourceId: 'memory-1',
      source: {},
      context: { purpose: 'collection' },
    });

    expect(fallback.descriptors).toEqual([]);
    expect(fallback.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          code: 'reference-needs-review',
        }),
      ]),
    );
  });

  it('materializes preview and provider inputs through separate purpose paths', async () => {
    const descriptor = makeDescriptor();
    const resolver = new DefaultReferenceResolverService({
      materializePreview: (reference) => ({
        projectionId: `${reference.referenceId}:preview`,
        referenceId: reference.referenceId,
        uri: 'webview://preview/ref',
      }),
      materializeProviderInputs: (reference) => [
        {
          inputId: `${reference.referenceId}:image-uri`,
          referenceId: reference.referenceId,
          inputKind: 'image-uri',
          value: '${PROJECT}/resolved/ref.png',
        },
      ],
    });

    const preview = await resolver.materialize({
      requestId: 'preview-1',
      purpose: 'preview',
      references: [descriptor],
    });
    const provider = await resolver.materialize({
      requestId: 'provider-1',
      purpose: 'provider-input',
      references: [descriptor],
      targetCapability: 'GenerateImage',
      inputKinds: ['image-uri'],
    });

    expect(preview.previews?.[0]?.uri).toBe('webview://preview/ref');
    expect(provider.providerInputs?.[0]?.value).toBe('${PROJECT}/resolved/ref.png');
    expect(provider.providerInputs?.[0]?.value).not.toBe(preview.previews?.[0]?.uri);
  });

  it('deduplicates batch references and preserves partial failures', async () => {
    const ok = makeDescriptor({ referenceId: 'ok-ref' });
    const duplicate = makeDescriptor({ referenceId: 'duplicate-ref' });
    const bad = makeDescriptor({
      referenceId: 'bad-ref',
      payload: { type: 'path', path: 'file:///tmp/bad.png' },
    });
    const resolver = new DefaultReferenceResolverService();

    const result = await resolver.resolveBatch({
      batchId: 'batch-1',
      purpose: 'provider-input',
      references: [ok, duplicate, bad],
      targetCapability: 'GenerateImage',
      inputKinds: ['image-uri'],
      policy: { maxConcurrency: 2, allowPartial: true },
    });

    expect(result.status).toBe('partial');
    expect(result.summary).toMatchObject({
      total: 3,
      resolved: 1,
      unresolved: 1,
      deduplicated: 1,
    });
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ referenceId: 'ok-ref', status: 'resolved' }),
        expect.objectContaining({ referenceId: 'bad-ref', status: 'unresolved' }),
      ]),
    );
  });

  it('supports dry-run without materializing provider inputs', async () => {
    let materialized = false;
    const resolver = new DefaultReferenceResolverService({
      materializeProviderInputs: () => {
        materialized = true;
        return [];
      },
    });

    const result = await resolver.resolveBatch({
      batchId: 'dry-run-1',
      purpose: 'provider-input',
      references: [makeDescriptor()],
      targetCapability: 'GenerateImage',
      dryRun: true,
      policy: { dryRun: true },
    });

    expect(materialized).toBe(false);
    expect(result.status).toBe('skipped');
    expect(result.summary.skipped).toBe(1);
  });
});

function makeDescriptor(overrides: Partial<ReferenceDescriptor> = {}): ReferenceDescriptor {
  return {
    schemaVersion: 1,
    kind: 'reference-descriptor',
    referenceId: 'ref-shot-1-source',
    sourceKind: 'canvas-node',
    sourceId: 'shot-1',
    referenceKind: 'resource',
    role: 'source',
    modality: 'image',
    payload: {
      type: 'resource',
      resourceRef: {
        kind: 'document-archive-resource',
        documentId: 'comic-1',
        path: '${PROJECT}/comic/page-01.png',
      },
      mediaType: 'image',
    },
    ...overrides,
  };
}
