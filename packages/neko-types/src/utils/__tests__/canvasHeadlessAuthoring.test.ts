import { describe, expect, it } from 'vitest';
import type { CanvasData } from '../../types/canvas';
import { createResourceFingerprint, createResourceRef } from '../../types/resource-cache';
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
  it('creates all canonical node projections from valid data', () => {
    let canvas = emptyCanvas();
    const generateId = ids();
    for (const request of [
      { type: 'markdown' as const, data: { content: '# Brief' } },
      { type: 'media' as const, data: { assetPath: 'media/key.png', mediaType: 'image' } },
      { type: 'group' as const, data: { label: 'References' } },
      {
        type: 'job' as const,
        data: {
          jobId: 'job-owned-1',
          revision: 2,
          title: 'Generate key art',
          status: 'running',
        },
      },
      { type: 'file' as const, data: { path: 'docs/brief.pdf', title: 'Brief' } },
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
    expect(canvas.nodes.find((node) => node.type === 'group')?.container).toMatchObject({
      policy: 'group',
      childIds: [],
      layout: { mode: 'manual' },
      deleteBehavior: 'release-children',
    });
    expect(canvas.nodes.find((node) => node.type === 'job')?.data).toMatchObject({
      jobId: 'job-owned-1',
      revision: 2,
      status: 'running',
      inputRefs: [],
      outputRefs: [],
    });
  });

  it('rejects removed domain node types', () => {
    expect(() =>
      planCanvasNodeCreation(
        { canvasData: emptyCanvas(), generateId: ids() },
        { type: 'shot', data: {} },
      ),
    ).toThrow('Unsupported Canvas node type "shot"');
  });

  it('rejects incomplete Job projections and missing source bindings', () => {
    expect(() =>
      planCanvasNodeCreation(
        { canvasData: emptyCanvas(), generateId: ids() },
        { type: 'job', data: {} },
      ),
    ).toThrow('Canvas Job jobId must be a non-empty string');
    expect(() =>
      planCanvasNodeCreation(
        { canvasData: emptyCanvas(), generateId: ids() },
        { type: 'media', data: { mediaType: 'image' } },
      ),
    ).toThrow('Canvas Media creation requires a durable source');
    expect(() =>
      planCanvasNodeCreation(
        { canvasData: emptyCanvas(), generateId: ids() },
        { type: 'file', data: {} },
      ),
    ).toThrow('Canvas File creation requires a durable source');
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
          { type: 'media', data: { assetPath: 'media/result.png', mediaType: 'image' } },
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
      { type: 'file', data: { path: 'docs/target.pdf', title: 'Target' } },
    );
    const plan = planCanvasConnectionCreation(
      { canvasData: withTarget.canvasData, generateId },
      {
        sourceId: withSource.result.nodeId,
        targetId: withTarget.result.nodeId,
      },
    );

    expect(plan.result.connection.type).toBe('reference');
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
    expect(appended.canvasData.nodes[0]?.data.content).toBe('first note\nsecond note');
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

  it('preserves stable resource refs in Media and File nodes', () => {
    const resourceRef = createResourceRef({
      scope: 'project',
      provider: 'workspace',
      kind: 'document',
      source: { kind: 'file', projectRelativePath: 'docs/reference.pdf' },
      locator: { kind: 'file', path: 'docs/reference.pdf' },
      fingerprint: createResourceFingerprint({ strategy: 'none', value: 'docs/reference.pdf' }),
    });
    const file = planCanvasNodeCreation(
      { canvasData: emptyCanvas(), generateId: ids() },
      {
        type: 'file',
        data: { path: '', title: 'Reference', resourceRef },
      },
    );

    expect(file.result.node).toMatchObject({
      type: 'file',
      data: { resourceRef },
    });
  });

  it('rejects runtime-only resource identities', () => {
    expect(
      validateCanvasDurableResourceIdentity({
        cachePath: '/tmp/cache.png',
        previewUrl: 'blob:vscode-webview://preview',
      }).map((diagnostic) => diagnostic.code),
    ).toEqual(['runtime-only-resource-identity', 'runtime-only-resource-identity']);
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
});
