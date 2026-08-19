import { describe, expect, it } from 'vitest';
import { validateNkc } from '../index';

function createValidCanvas(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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

describe('NKC validator', () => {
  it('accepts the optional projected flag', () => {
    const result = validateNkc(createValidCanvas({ projected: true }));

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects non-boolean projected flag', () => {
    const result = validateNkc(createValidCanvas({ projected: 'yes' }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: 'projected', message: 'must be a boolean' }),
    );
  });

  it('accepts canonical referenced, generated, and Entity-representation material nodes', () => {
    const result = validateNkc(
      createValidCanvas({
        nodes: [
          {
            ...createCompleteNode('media'),
            data: {
              assetPath: 'neko/generated/image/concept.png',
              contentLocator: {
                file: { authority: 'workspace', path: 'neko/generated/image/concept.png' },
              },
              generation: {
                jobRef: { kind: 'generation', jobId: 'generation-job-1' },
                summary: {
                  prompt: 'A generated concept image',
                  model: 'fixture-image-model',
                },
              },
            },
          },
          {
            ...createCompleteNode('media'),
            id: 'media-asset',
            data: {
              assetPath: 'Characters/concept.png',
              contentLocator: {
                file: { authority: 'workspace', path: 'neko/assets/Characters/concept.png' },
              },
              entityRepresentation: {
                entityId: 'character-1',
                bindingId: 'binding-1',
                role: 'portrait',
              },
            },
          },
          {
            ...createCompleteNode('job'),
            id: 'generation-job-node',
            data: {
              jobRef: { kind: 'generation', jobId: 'generation-job-1' },
              title: 'Generate concept image',
              status: 'completed',
              inputRefs: [{ kind: 'canvas-node', nodeId: 'media-asset' }],
              outputRefs: [{ kind: 'canvas-node', nodeId: 'media-1' }],
            },
          },
        ],
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('requires a canonical locator without inferring Generation from its path', () => {
    const result = validateNkc(
      createValidCanvas({
        nodes: [
          {
            ...createCompleteNode('media'),
            data: {
              assetPath: 'neko/generated/image/concept.png',
            },
          },
          {
            ...createCompleteNode('file'),
            id: 'generated-without-job',
            data: {
              path: 'neko/generated/document/result.md',
              title: 'Generated document',
              contentLocator: {
                file: { authority: 'workspace', path: 'neko/generated/document/result.md' },
              },
            },
          },
        ],
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        field: 'nodes[0].data.contentLocator',
        message: expect.stringContaining('canvas-material-content-locator-required'),
      }),
    );
  });

  it('accepts valid Generation evidence beside any canonical locator and rejects non-portable locators', () => {
    const result = validateNkc(
      createValidCanvas({
        nodes: [
          {
            ...createCompleteNode('media'),
            data: {
              assetPath: 'media/reference.png',
              contentLocator: { file: { authority: 'workspace', path: 'media/reference.png' } },
              generation: {
                jobRef: { kind: 'generation', jobId: 'generation-job-1' },
                summary: { prompt: 'Must not classify a referenced file' },
              },
            },
          },
          {
            ...createCompleteNode('file'),
            id: 'absolute-file',
            data: {
              path: '/Users/example/private.md',
              title: 'Invalid absolute file',
              contentLocator: {
                file: { authority: 'workspace', path: '/Users/example/private.md' },
              },
            },
          },
        ],
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'nodes[1].data.contentLocator',
          message: expect.stringContaining('canvas-material-content-locator-invalid'),
        }),
      ]),
    );
  });

  it('rejects incomplete Job projections and absolute file artifact refs', () => {
    const result = validateNkc(
      createValidCanvas({
        nodes: [
          {
            ...createCompleteNode('job'),
            data: {
              jobRef: { kind: 'generation', jobId: 'generation-job-1' },
              title: 'Generate concept image',
              status: 'running',
              inputRefs: [{ kind: 'file', path: '/Users/example/private.png' }],
              outputRefs: [],
            },
          },
          {
            ...createCompleteNode('job'),
            id: 'incomplete-job',
            data: {},
          },
        ],
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'nodes[0].data.inputRefs[0].path',
          message: expect.stringContaining('workspace-relative'),
        }),
        expect.objectContaining({ field: 'nodes[1].data.jobRef' }),
        expect.objectContaining({ field: 'nodes[1].data.inputRefs' }),
      ]),
    );
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
