import { describe, expect, it } from 'vitest';
import type { CanvasData } from '../../types/canvas';
import {
  createEmptyCanvasData,
  planCanvasAgentContentApplication,
  planCanvasBlockUpdate,
  planCanvasCompositeCreation,
  planCanvasConnectionCreation,
  planCanvasNodeCreation,
  validateCanvasDurableResourceIdentity,
} from '../canvasHeadlessAuthoring';

function ids(): () => string {
  let next = 0;
  return () => `generated-${++next}`;
}

function emptyCanvas(): CanvasData {
  return createEmptyCanvasData('Headless Test Canvas');
}

describe('canvasHeadlessAuthoring canonical planner', () => {
  it('preserves a portable ContentLocator when creating durable media nodes', () => {
    const created = planCanvasNodeCreation(
      { canvasData: emptyCanvas(), generateId: () => 'media-locator-node' },
      {
        type: 'media',
        data: {
          assetPath: 'media/cat.png',
          mediaType: 'image',
          contentLocator: { file: { authority: 'workspace', path: 'media/cat.png' } },
        },
      },
    );

    expect(created.result.node).toMatchObject({
      type: 'media',
      data: {
        assetPath: 'media/cat.png',
        contentLocator: { file: { authority: 'workspace', path: 'media/cat.png' } },
      },
    });
  });

  it('accepts a validated planner-owned size without exposing it through Agent input', () => {
    const created = planCanvasNodeCreation(
      { canvasData: emptyCanvas(), generateId: () => 'intrinsic-image-node' },
      {
        type: 'media',
        size: { width: 80, height: 120 },
        data: {
          assetPath: 'media/portrait.png',
          mediaType: 'image',
          contentLocator: { file: { authority: 'workspace', path: 'media/portrait.png' } },
        },
      },
    );

    expect(created.result.node.size).toEqual({ width: 80, height: 120 });
    expect(() =>
      planCanvasNodeCreation(
        { canvasData: emptyCanvas(), generateId: () => 'invalid-size-node' },
        {
          type: 'media',
          size: { width: Number.NaN, height: 120 },
          data: {
            assetPath: 'media/portrait.png',
            mediaType: 'image',
            contentLocator: { file: { authority: 'workspace', path: 'media/portrait.png' } },
          },
        },
      ),
    ).toThrow('finite positive width and height');
  });

  it('creates all canonical node projections from valid data', () => {
    let canvas = emptyCanvas();
    const generateId = ids();
    for (const request of [
      { type: 'markdown' as const, data: { content: '# Brief' } },
      {
        type: 'media' as const,
        data: {
          assetPath: 'media/key.png',
          mediaType: 'image',
          contentLocator: { file: { authority: 'workspace', path: 'media/key.png' } },
        },
      },
      { type: 'group' as const, data: { label: 'References' } },
      {
        type: 'job' as const,
        data: {
          jobRef: { kind: 'generation', jobId: 'job-owned-1' },
          title: 'Generate key art',
          status: 'running',
        },
      },
      {
        type: 'file' as const,
        data: {
          path: 'docs/brief.pdf',
          title: 'Brief',
          contentLocator: { file: { authority: 'workspace', path: 'docs/brief.pdf' } },
        },
      },
      {
        type: 'canvas-embed' as const,
        data: { canvasPath: 'boards/detail.nkc', canvasTitle: 'Detail' },
      },
    ]) {
      canvas = planCanvasNodeCreation({ canvasData: canvas, generateId }, request).canvasData;
    }

    expect(canvas.nodes.map((node) => node.type)).toEqual([
      'markdown',
      'media',
      'group',
      'job',
      'file',
      'canvas-embed',
    ]);
    expect(canvas.nodes.map((node) => node.size)).toEqual([
      { width: 240, height: 160 },
      { width: 120, height: 90 },
      { width: 160, height: 110 },
      { width: 120, height: 75 },
      { width: 110, height: 75 },
      { width: 120, height: 80 },
    ]);
    expect(canvas.nodes.find((node) => node.type === 'group')?.container).toMatchObject({
      policy: 'group',
      childIds: [],
      layout: { mode: 'manual' },
      deleteBehavior: 'release-children',
    });
    expect(canvas.nodes.find((node) => node.type === 'job')?.data).toMatchObject({
      jobRef: { kind: 'generation', jobId: 'job-owned-1' },
      status: 'running',
      inputRefs: [],
      outputRefs: [],
    });
  });

  it('uses the text-reference default unless the creator supplies a size', () => {
    const textFile = planCanvasNodeCreation(
      { canvasData: emptyCanvas(), generateId: () => 'text-file' },
      {
        type: 'file',
        data: {
          path: 'docs/brief.md',
          mediaType: 'text/markdown',
          contentLocator: { file: { authority: 'workspace', path: 'docs/brief.md' } },
        },
      },
    );
    const explicitlySized = planCanvasNodeCreation(
      { canvasData: textFile.canvasData, generateId: () => 'sized-text-file' },
      {
        type: 'file',
        size: { width: 320, height: 180 },
        data: {
          path: 'docs/notes.txt',
          contentLocator: { file: { authority: 'workspace', path: 'docs/notes.txt' } },
        },
      },
    );

    expect(textFile.result.node.size).toEqual({ width: 240, height: 160 });
    expect(explicitlySized.result.node.size).toEqual({ width: 320, height: 180 });
  });

  it('rejects unsupported domain node types', () => {
    expect(() =>
      planCanvasNodeCreation(
        { canvasData: emptyCanvas(), generateId: ids() },
        // @ts-expect-error Runtime validation must reject unsupported node types.
        { type: 'unsupported', data: {} },
      ),
    ).toThrow('Unsupported Canvas node type "unsupported"');
  });

  it('rejects incomplete Job projections and missing source bindings', () => {
    expect(() =>
      planCanvasNodeCreation(
        { canvasData: emptyCanvas(), generateId: ids() },
        { type: 'job', data: {} },
      ),
    ).toThrow('Canvas Job jobRef must contain');
    expect(() =>
      planCanvasNodeCreation(
        { canvasData: emptyCanvas(), generateId: ids() },
        { type: 'media', data: { mediaType: 'image' } },
      ),
    ).toThrow('Canvas Media creation requires a canonical ContentLocator');
    expect(() =>
      planCanvasNodeCreation(
        { canvasData: emptyCanvas(), generateId: ids() },
        { type: 'file', data: {} },
      ),
    ).toThrow('Canvas File creation requires a canonical ContentLocator');
    expect(() =>
      planCanvasNodeCreation(
        { canvasData: emptyCanvas(), generateId: ids() },
        {
          type: 'media',
          data: { assetPath: 'media/path-only.png', mediaType: 'image' },
        },
      ),
    ).toThrow('Canvas Media creation requires a canonical ContentLocator');
    expect(() =>
      planCanvasNodeCreation(
        { canvasData: emptyCanvas(), generateId: ids() },
        { type: 'canvas-embed', data: {} },
      ),
    ).toThrow('CanvasEmbed canvasPath must be a non-empty string');
  });

  it('creates a Group composite without relationship edges for membership', () => {
    const plan = planCanvasCompositeCreation(
      { canvasData: emptyCanvas(), generateId: ids() },
      {
        containerType: 'group',
        data: { label: 'Draft' },
        children: [
          { type: 'markdown', data: { content: 'Prompt' } },
          {
            type: 'media',
            data: {
              assetPath: 'media/result.png',
              mediaType: 'image',
              contentLocator: { file: { authority: 'workspace', path: 'media/result.png' } },
            },
          },
        ],
      },
    );

    const group = plan.canvasData.nodes.find((node) => node.id === plan.result.containerId);
    expect(group?.container?.childIds).toEqual(plan.result.childIds);
    expect(plan.canvasData.connections).toEqual([]);
    expect(
      plan.result.childIds.map(
        (id) => plan.canvasData.nodes.find((node) => node.id === id)?.parentId,
      ),
    ).toEqual([group?.id, group?.id]);
  });

  it('defaults new connections to reference', () => {
    const generateId = ids();
    const withSource = planCanvasNodeCreation(
      { canvasData: emptyCanvas(), generateId },
      { type: 'markdown', data: { content: 'Source' } },
    );
    const withTarget = planCanvasNodeCreation(
      { canvasData: withSource.canvasData, generateId },
      {
        type: 'file',
        data: {
          path: 'docs/target.pdf',
          title: 'Target',
          contentLocator: { file: { authority: 'workspace', path: 'docs/target.pdf' } },
        },
      },
    );
    const plan = planCanvasConnectionCreation(
      { canvasData: withTarget.canvasData, generateId },
      {
        sourceId: withSource.result.nodeId,
        targetId: withTarget.result.nodeId,
      },
    );

    expect(plan.result.connection?.type).toBe('reference');
  });

  it('applies Agent text as Markdown and supports append', () => {
    const inserted = planCanvasAgentContentApplication(
      { canvasData: emptyCanvas(), generateId: ids() },
      {
        kind: 'text',
        text: 'first note',
        format: 'plain',
        target: { insertionPoint: { x: 10, y: 20 }, mode: 'insert' },
      },
    );
    const nodeId = inserted.result.nodeId;
    expect(inserted.canvasData.nodes[0]).toMatchObject({
      id: nodeId,
      type: 'markdown',
      position: { x: 10, y: 20 },
      data: { content: 'first note' },
    });

    const appended = planCanvasAgentContentApplication(
      { canvasData: inserted.canvasData },
      {
        kind: 'text',
        text: 'second note',
        target: { nodeId, mode: 'append', fieldPath: '/content' },
      },
    );
    const appendedNode = appended.canvasData.nodes[0];
    expect(appendedNode?.type).toBe('markdown');
    expect(appendedNode?.type === 'markdown' ? appendedNode.data.content : undefined).toBe(
      'first note\nsecond note',
    );
  });

  it('keeps replayed Agent Markdown idempotent by provenance identity', () => {
    const payload = {
      kind: 'text' as const,
      text: '# Notes',
      title: 'Notes',
      format: 'markdown' as const,
      provenance: {
        source: 'agent' as const,
        conversationId: 'conversation:1',
        messageId: 'artifact:1',
        label: 'delivery:1',
      },
    };
    const inserted = planCanvasAgentContentApplication(
      { canvasData: emptyCanvas(), generateId: ids() },
      payload,
    );
    const replayed = planCanvasAgentContentApplication(
      { canvasData: inserted.canvasData, generateId: ids() },
      payload,
    );

    expect(replayed.result.changed).toBe(false);
    expect(replayed.result.nodeId).toBe(inserted.result.nodeId);
    expect(replayed.canvasData.nodes).toHaveLength(1);
  });

  it('preserves stable ContentLocator identity in File nodes', () => {
    const contentLocator = {
      file: { authority: 'workspace' as const, path: 'docs/reference.pdf' },
    };
    const file = planCanvasNodeCreation(
      { canvasData: emptyCanvas(), generateId: ids() },
      {
        type: 'file',
        data: { path: '', title: 'Reference', contentLocator },
      },
    );

    expect(file.result.node).toMatchObject({
      type: 'file',
      data: { contentLocator },
    });
  });

  it('rejects runtime-only resource identities', () => {
    expect(
      validateCanvasDurableResourceIdentity({
        cachePath: '/tmp/cache.png',
        previewUrl: 'blob:neko-media://preview',
        contentLocator: {
          file: {
            authority: 'workspace',
            path: 'openneko://resource/0123456789abcdefghijklmnopqrstuv',
          },
        },
      }).map((diagnostic) => diagnostic.code),
    ).toEqual([
      'runtime-only-resource-identity',
      'runtime-only-resource-identity',
      'runtime-only-resource-identity',
    ]);
  });

  it('fails visibly for editor-only slots and unbound blocks', () => {
    expect(() =>
      planCanvasAgentContentApplication(
        { canvasData: emptyCanvas(), generateId: ids() },
        {
          kind: 'text',
          text: 'slot content',
          target: { slotId: 'inspector-selection', mode: 'create-child' },
        },
      ),
    ).toThrow(/Unsupported Canvas slot target/);

    const created = planCanvasNodeCreation(
      { canvasData: emptyCanvas(), generateId: ids() },
      { type: 'markdown', data: { content: 'draft' } },
    );
    expect(() =>
      planCanvasBlockUpdate(
        { canvasData: created.canvasData },
        {
          nodeId: created.result.nodeId,
          blockId: 'markdown-content',
          value: 'updated',
        },
      ),
    ).toThrow(/no writable binding in headless mode/);
  });

  it('updates a generation selection only to an existing output identity', () => {
    const canvas: CanvasData = {
      ...emptyCanvas(),
      nodes: [
        {
          id: 'generation-1',
          type: 'generation',
          position: { x: 0, y: 0 },
          size: { width: 320, height: 180 },
          zIndex: 1,
          data: {
            recipe: {
              kind: 'prompt',
              prompt: 'Draft a scene',
              model: {
                purpose: 'canvas.prompt',
                providerId: 'provider-1',
                modelId: 'model-1',
              },
            },
            outputs: [
              {
                outputId: 'output-1',
                jobRef: { kind: 'generation', jobId: 'job-1' },
                locator: {
                  file: { authority: 'workspace', path: 'neko/generated/prompt/output-1.md' },
                },
                kind: 'prompt',
                recipeInputFingerprint: 'sha256:recipe-1',
              },
            ],
          },
        },
      ],
    };

    expect(
      planCanvasBlockUpdate(
        { canvasData: canvas },
        { nodeId: 'generation-1', path: '/selectedOutputId', value: 'output-1' },
      ).result,
    ).toMatchObject({ changed: true, data: { selectedOutputId: 'output-1' } });
    expect(() =>
      planCanvasBlockUpdate(
        { canvasData: canvas },
        { nodeId: 'generation-1', path: '/selectedOutputId', value: 'missing-output' },
      ),
    ).toThrow(/requires canonical node data/u);
  });
});
