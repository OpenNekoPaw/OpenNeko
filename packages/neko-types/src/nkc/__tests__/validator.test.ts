import { describe, expect, it } from 'vitest';
import { createResourceFingerprint, createResourceRef } from '../../types/resource-cache';
import { validateNkc } from '../index';

function createValidCanvas(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: '3.0',
    name: 'Validator Fixture',
    nodes: [],
    connections: [],
    ...overrides,
  };
}

function createCompleteNode(type: string): Record<string, unknown> {
  return {
    id: `${type}-1`,
    type,
    position: { x: 10, y: 20 },
    size: { width: 200, height: 100 },
    zIndex: 1,
    data: {},
  };
}

describe('NKC validator v3.0', () => {
  it('accepts the optional projected flag', () => {
    const result = validateNkc(createValidCanvas({ projected: true }));

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects legacy root-level subsystem state in the canonical format', () => {
    const result = validateNkc(
      createValidCanvas({
        narrative: { entryNodeId: 'choice-1', variables: [] },
        behavior: { blackboard: [] },
        entityGraph: { entityScope: ['character'], bindingSource: 'entities.json' },
        memoryGraph: { queryContext: 'session' },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'narrative' }),
        expect.objectContaining({ field: 'behavior' }),
        expect.objectContaining({ field: 'entityGraph' }),
        expect.objectContaining({ field: 'memoryGraph' }),
      ]),
    );
  });

  it('rejects non-boolean projected flag', () => {
    const result = validateNkc(createValidCanvas({ projected: 'yes' }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'projected', message: 'must be a boolean' }),
    );
  });

  it('rejects runtime generated Group and candidate identities from durable NKC data', () => {
    const result = validateNkc(
      createValidCanvas({
        nodes: [
          {
            ...createCompleteNode('group'),
            id: 'runtime:canvas-generated-group:task-1',
          },
          {
            ...createCompleteNode('media'),
            id: 'runtime:canvas-generated-candidate:output-1',
          },
        ],
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'nodes[0].id',
          message: 'runtime generated Group identities cannot be persisted',
        }),
        expect.objectContaining({
          field: 'nodes[1].id',
          message: 'runtime generated Group identities cannot be persisted',
        }),
      ]),
    );
  });

  it('rejects runtime projections and cache paths in node data', () => {
    const generatedRef = createResourceRef({
      scope: 'project',
      provider: 'generated-output',
      kind: 'generated',
      source: { kind: 'generated-asset', generatedAssetId: 'generated-output:1' },
      locator: { kind: 'generated-asset', assetId: 'generated-output:1' },
      fingerprint: createResourceFingerprint({ strategy: 'hash', value: 'sha256:draft' }),
    });
    const result = validateNkc(
      createValidCanvas({
        nodes: [
          {
            ...createCompleteNode('media'),
            data: {
              projectionId: 'runtime:canvas-generated-group:task:1',
              cachePath: '.neko/.cache/resources/generated-output.png',
              resourceRef: generatedRef,
            },
          },
        ],
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('runtime handles') }),
        expect.objectContaining({ message: expect.stringContaining('runtime-only') }),
      ]),
    );
  });

  it('accepts stable generated-output, Asset, and existing generated-source file refs', () => {
    const generatedRef = createResourceRef({
      scope: 'project',
      provider: 'generated-output',
      kind: 'generated',
      source: { kind: 'generated-asset', generatedAssetId: 'generated-output:1' },
      locator: { kind: 'generated-asset', assetId: 'generated-output:1' },
      fingerprint: createResourceFingerprint({ strategy: 'hash', value: 'sha256:generated' }),
    });
    const assetRef = createResourceRef({
      scope: 'project',
      provider: 'media-library',
      kind: 'media',
      source: {
        kind: 'media-library',
        mediaLibraryId: 'asset:entity:1',
        projectRelativePath: 'neko/assets/concept.png',
      },
      locator: { kind: 'file', path: 'neko/assets/concept.png' },
      fingerprint: createResourceFingerprint({ strategy: 'hash', value: 'sha256:asset' }),
    });
    const legacyRef = createResourceRef({
      scope: 'project',
      provider: 'workspace',
      kind: 'media',
      source: {
        kind: 'file',
        projectRelativePath: 'neko/generated/image/legacy-concept.png',
      },
      locator: { kind: 'file', path: 'neko/generated/image/legacy-concept.png' },
      fingerprint: createResourceFingerprint({ strategy: 'hash', value: 'sha256:legacy' }),
    });
    const result = validateNkc(
      createValidCanvas({
        nodes: [
          { ...createCompleteNode('media'), data: { resourceRef: generatedRef } },
          { ...createCompleteNode('media'), id: 'media-asset', data: { resourceRef: assetRef } },
          { ...createCompleteNode('media'), id: 'media-legacy', data: { resourceRef: legacyRef } },
        ],
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects removed subsystem node and connection types', () => {
    const result = validateNkc(
      createValidCanvas({
        nodes: [createCompleteNode('choice'), createCompleteNode('memory')],
        connections: [
          {
            id: 'association-1',
            sourceId: 'memory-1',
            targetId: 'memory-1',
            sourceEndpoint: { nodeId: 'memory-1', scope: 'node' },
            targetEndpoint: { nodeId: 'memory-1', scope: 'node' },
            type: 'association',
            weight: 0.7,
          },
        ],
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'nodes[0].type' }),
        expect.objectContaining({ field: 'nodes[1].type' }),
        expect.objectContaining({ field: 'connections[0].type' }),
      ]),
    );
  });

  it('rejects structurally complete unknown nodes in normal mode', () => {
    const result = validateNkc(
      createValidCanvas({
        nodes: [createCompleteNode('future-node')],
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'nodes[0].type',
        message: 'unknown node type: "future-node"',
        severity: 'error',
      }),
    );
    expect(result.warnings).toEqual([]);
  });

  it('promotes unknown node warnings to errors in strict mode', () => {
    const result = validateNkc(
      createValidCanvas({
        nodes: [createCompleteNode('future-node')],
      }),
      { strict: true },
    );

    expect(result.valid).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'nodes[0].type',
        message: 'unknown node type: "future-node"',
        severity: 'error',
      }),
    );
  });

  it('keeps structurally incomplete unknown nodes as errors in normal mode', () => {
    const result = validateNkc(
      createValidCanvas({
        nodes: [
          {
            id: 'future-1',
            type: 'future-node',
            size: { width: 200, height: 100 },
            zIndex: 1,
            data: {},
          },
        ],
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'nodes[0].position', message: 'must be an object' }),
    );
    expect(result.warnings).toEqual([]);
  });

  it('rejects unknown connection types in normal and strict modes', () => {
    const canvas = createValidCanvas({
      connections: [
        {
          id: 'future-edge',
          sourceId: 'a',
          targetId: 'b',
          sourceEndpoint: { nodeId: 'a', scope: 'node' },
          targetEndpoint: { nodeId: 'b', scope: 'node' },
          type: 'future-edge',
        },
      ],
    });

    const normal = validateNkc(canvas);
    expect(normal.valid).toBe(false);
    expect(normal.errors).toContainEqual(
      expect.objectContaining({
        field: 'connections[0].type',
        message: 'unknown connection type: "future-edge"',
        severity: 'error',
      }),
    );
    expect(normal.warnings).toEqual([]);

    const strict = validateNkc(canvas, { strict: true });
    expect(strict.valid).toBe(false);
    expect(strict.errors).toContainEqual(
      expect.objectContaining({
        field: 'connections[0].type',
        message: 'unknown connection type: "future-edge"',
        severity: 'error',
      }),
    );
  });
});
