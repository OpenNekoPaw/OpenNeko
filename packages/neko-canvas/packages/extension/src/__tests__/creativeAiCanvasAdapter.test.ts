import { describe, expect, it, vi } from 'vitest';
import {
  CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
  CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
  CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
  type CanvasNode,
  type CreativeAiApplyRequest,
  type CreativeAiDocumentRef,
  type CreativeAiOutputRef,
  type CreativeAiTargetRef,
} from '@neko/shared';
import {
  buildCanvasCreativeActionExternalInvocation,
  buildCanvasGeneratedImageTargetRef,
  CanvasCreativeAiApplyAdapter,
  CANVAS_GENERATED_ASSET_FIELD_PATH,
  CANVAS_GENERATED_IMAGE_FIELD_PATH,
  CANVAS_GENERATED_VIDEO_ASSET_FIELD_PATH,
  createCanvasDocumentRevision,
  createCanvasTargetRevision,
} from '../creativeAiCanvasAdapter';

const documentRef: CreativeAiDocumentRef = {
  kind: 'nk-document',
  packageId: 'neko-canvas',
  documentId: 'canvas-document:doc-1',
  projectRelativePath: 'boards/intro.nkc',
  format: 'nkc',
  label: 'Intro',
};

function shotNode(
  id: string,
  overrides: Partial<CanvasNode> & { data?: Record<string, unknown> } = {},
): CanvasNode {
  return {
    id,
    type: 'shot',
    position: { x: 0, y: 0 },
    size: { width: 320, height: 180 },
    zIndex: 1,
    data: {
      shotNumber: 1,
      visualDescription: 'A quiet opening frame.',
      generatedImage: '',
      generationHistory: [],
      ...(overrides.data ?? {}),
    },
    ...overrides,
  } as unknown as CanvasNode;
}

function outputRef(overrides: Partial<CreativeAiOutputRef> = {}): CreativeAiOutputRef {
  return {
    kind: 'generated-asset',
    id: 'output-1',
    generatedAssetId: 'image/shot-1.png',
    mimeType: 'image/png',
    ...overrides,
  };
}

function applyRequest(
  targetRef: CreativeAiTargetRef,
  targetRevision: string,
  overrides: Partial<CreativeAiApplyRequest> = {},
): CreativeAiApplyRequest {
  return {
    schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
    requestId: 'apply-1',
    conversationId: 'conversation-1',
    runId: 'run-1',
    workItemId: 'work-1',
    sourcePackage: 'neko-canvas',
    targetRef,
    outputRefs: [outputRef()],
    writeback: {
      kind: 'mutating',
      atomicity: 'per-target',
      requiresRevisionMatch: true,
    },
    targetRevision,
    idempotencyKey: 'apply-key-1',
    ...overrides,
  };
}

describe('Canvas creative AI adapter', () => {
  it('builds candidate-first Canvas creative action invocations with explicit target refs', () => {
    const node = shotNode('shot-1', {
      data: {
        storyboardPrompt: {
          version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
          promptBlocks: {
            imagePromptDocument: {
              version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
              documentId: 'shot-1:image',
              blockKind: 'image',
              text: 'A quiet opening frame.',
            },
          },
          generationParams: {
            aspectRatio: '16:9',
            advancedParameters: { seed: 7 },
          },
        },
      },
    });

    const result = buildCanvasCreativeActionExternalInvocation({
      document: {
        documentId: documentRef.documentId,
        projectRelativePath: documentRef.projectRelativePath,
        revision: createCanvasDocumentRevision({ nodes: [node] }),
      },
      node,
      actionId: 'generate-image',
      requestedAt: '2026-07-07T00:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.actionId).toBe('generate-image');
    expect(result.request.targetRef).toEqual(
      expect.objectContaining({
        fieldPath: CANVAS_GENERATED_ASSET_FIELD_PATH,
        entityId: 'shot-1',
      }),
    );
    expect(result.request.candidateTargetRef).toEqual(
      expect.objectContaining({
        kind: 'candidate-target',
        candidateOnly: true,
      }),
    );
    expect(result.invocation.writeback.kind).toBe('candidate');
    expect(result.invocation.targetRef?.fieldPath).toBe(CANVAS_GENERATED_ASSET_FIELD_PATH);
    expect(result.invocation.candidateTargetRef?.candidateOnly).toBe(true);
    expect(result.invocation.metadata?.['canvasCreativeAiAction']).toEqual(result.request);
  });

  it('uses videoPromptDocument as the only video prompt authority for new actions', () => {
    const node = shotNode('shot-1', {
      data: {
        storyboardPrompt: {
          version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
          promptBlocks: {
            videoPromptDocument: {
              version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
              documentId: 'shot-1:video',
              blockKind: 'video',
              text: 'Camera drifts forward while dialogue stays timed to the action.',
            },
            voicePromptDocument: {
              version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
              documentId: 'shot-1:voice',
              blockKind: 'voice',
              text: 'Legacy voice-only prompt should not be a new-path authority.',
            },
          },
        },
      },
    });

    const result = buildCanvasCreativeActionExternalInvocation({
      document: {
        documentId: documentRef.documentId,
        projectRelativePath: documentRef.projectRelativePath,
        revision: createCanvasDocumentRevision({ nodes: [node] }),
      },
      node,
      actionId: 'generate-video',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.targetRef.fieldPath).toBe(CANVAS_GENERATED_VIDEO_ASSET_FIELD_PATH);
    expect(result.request.creativeParameters?.promptDocuments).toEqual([
      expect.objectContaining({ blockKind: 'video', documentId: 'shot-1:video' }),
    ]);
    expect(JSON.stringify(result.request)).not.toContain('shot-1:voice');
  });

  it('returns preflight diagnostics before invoking Agent when required action parameters are missing', () => {
    const node = shotNode('shot-1');

    const result = buildCanvasCreativeActionExternalInvocation({
      document: {
        documentId: documentRef.documentId,
        projectRelativePath: documentRef.projectRelativePath,
        revision: createCanvasDocumentRevision({ nodes: [node] }),
      },
      node,
      actionId: 'edit-video',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'canvas-creative-ai-video-prompt-required' }),
        expect.objectContaining({ code: 'canvas-creative-ai-missing-video-edit-source' }),
      ]),
    );
  });

  it('applies stable generated asset outputs through the Canvas node update port', async () => {
    const node = shotNode('shot-1');
    const targetRef = buildCanvasGeneratedImageTargetRef({ documentRef, node });
    const targetRevision = createCanvasTargetRevision(node, CANVAS_GENERATED_IMAGE_FIELD_PATH);
    const updateNode = vi.fn(async () => undefined);
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => node),
      updateNode,
    });

    const result = await adapter.apply(applyRequest(targetRef, targetRevision));

    expect(result.ok).toBe(true);
    expect(updateNode).toHaveBeenCalledWith('shot-1', {
      generatedImage: 'generated-assets/image/shot-1.png',
      generatedAsset: expect.objectContaining({
        id: 'image/shot-1.png',
        path: 'generated-assets/image/shot-1.png',
        mimeType: 'image/png',
      }),
    });
  });

  it('returns existing apply result for duplicate idempotency keys', async () => {
    const node = shotNode('shot-1');
    const targetRef = buildCanvasGeneratedImageTargetRef({ documentRef, node });
    const targetRevision = createCanvasTargetRevision(node, CANVAS_GENERATED_IMAGE_FIELD_PATH);
    const updateNode = vi.fn(async () => undefined);
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => node),
      updateNode,
    });

    await adapter.apply(applyRequest(targetRef, targetRevision));
    const duplicate = await adapter.apply(applyRequest(targetRef, targetRevision));

    expect(duplicate.ok).toBe(true);
    expect(updateNode).toHaveBeenCalledTimes(1);
  });

  it('rejects stale target revisions without mutating Canvas state', async () => {
    const node = shotNode('shot-1', { data: { generatedImage: 'newer.png' } });
    const staleNode = shotNode('shot-1', { data: { generatedImage: 'old.png' } });
    const targetRef = buildCanvasGeneratedImageTargetRef({ documentRef, node: staleNode });
    const staleRevision = createCanvasTargetRevision(staleNode, CANVAS_GENERATED_IMAGE_FIELD_PATH);
    const updateNode = vi.fn(async () => undefined);
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => node),
      updateNode,
    });

    const result = await adapter.apply(applyRequest(targetRef, staleRevision));

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'creative-ai-canvas-target-stale' }),
    ]);
    expect(updateNode).not.toHaveBeenCalled();
  });

  it('rejects deleted targets without affecting other batch targets', async () => {
    const node = shotNode('shot-1');
    const missing = shotNode('shot-2');
    const firstTarget = buildCanvasGeneratedImageTargetRef({ documentRef, node });
    const secondTarget = buildCanvasGeneratedImageTargetRef({ documentRef, node: missing });
    const updateNode = vi.fn(async () => undefined);
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async (nodeId: string) => (nodeId === 'shot-1' ? node : undefined)),
      updateNode,
    });

    const batch = await adapter.applyBatch([
      applyRequest(
        firstTarget,
        createCanvasTargetRevision(node, CANVAS_GENERATED_IMAGE_FIELD_PATH),
        {
          requestId: 'apply-1',
          idempotencyKey: 'apply-key-1',
        },
      ),
      applyRequest(
        secondTarget,
        createCanvasTargetRevision(missing, CANVAS_GENERATED_IMAGE_FIELD_PATH),
        {
          requestId: 'apply-2',
          idempotencyKey: 'apply-key-2',
        },
      ),
    ]);

    expect(batch.ok).toBe(false);
    expect(batch.atomic).toBe(false);
    expect(batch.results).toHaveLength(2);
    expect(batch.results[0]?.ok).toBe(true);
    expect(batch.results[1]?.ok).toBe(false);
    expect(batch.diagnostics).toEqual([
      expect.objectContaining({ code: 'creative-ai-canvas-target-deleted' }),
    ]);
    expect(updateNode).toHaveBeenCalledTimes(1);
  });

  it('stops atomic batch apply after the first failed target', async () => {
    const missing = shotNode('shot-1');
    const next = shotNode('shot-2');
    const missingTarget = buildCanvasGeneratedImageTargetRef({ documentRef, node: missing });
    const nextTarget = buildCanvasGeneratedImageTargetRef({ documentRef, node: next });
    const updateNode = vi.fn(async () => undefined);
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async (nodeId: string) => (nodeId === 'shot-2' ? next : undefined)),
      updateNode,
    });

    const batch = await adapter.applyBatch([
      applyRequest(
        missingTarget,
        createCanvasTargetRevision(missing, CANVAS_GENERATED_IMAGE_FIELD_PATH),
        {
          requestId: 'apply-1',
          idempotencyKey: 'apply-key-1',
          writeback: { kind: 'mutating', atomicity: 'atomic', requiresRevisionMatch: true },
        },
      ),
      applyRequest(
        nextTarget,
        createCanvasTargetRevision(next, CANVAS_GENERATED_IMAGE_FIELD_PATH),
        {
          requestId: 'apply-2',
          idempotencyKey: 'apply-key-2',
          writeback: { kind: 'mutating', atomicity: 'atomic', requiresRevisionMatch: true },
        },
      ),
    ]);

    expect(batch.atomic).toBe(true);
    expect(batch.results).toHaveLength(1);
    expect(updateNode).not.toHaveBeenCalled();
  });

  it('rejects target field conflicts before Canvas mutation', async () => {
    const node = shotNode('shot-1');
    const targetRef = {
      ...buildCanvasGeneratedImageTargetRef({ documentRef, node }),
      fieldPath: '/visualDescription',
      id: 'canvas-node:shot-1#/visualDescription',
    };
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => node),
      updateNode: vi.fn(async () => undefined),
    });

    const result = await adapter.apply(
      applyRequest(targetRef, createCanvasTargetRevision(node, '/visualDescription')),
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'creative-ai-canvas-target-field-conflict' }),
    ]);
  });

  it('keeps candidate-only output out of Canvas document state', async () => {
    const node = shotNode('shot-1');
    const candidateTargetRef = {
      ...buildCanvasGeneratedImageTargetRef({ documentRef, node }),
      kind: 'candidate-target',
      id: 'canvas-node:shot-1#candidate-generated-image',
      candidateOnly: true,
    } satisfies CreativeAiTargetRef;
    const updateNode = vi.fn(async () => undefined);
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => node),
      updateNode,
    });

    const result = await adapter.apply({
      ...applyRequest(
        buildCanvasGeneratedImageTargetRef({ documentRef, node }),
        createCanvasTargetRevision(node, CANVAS_GENERATED_IMAGE_FIELD_PATH),
      ),
      targetRef: undefined,
      candidateTargetRef,
      writeback: { kind: 'candidate', atomicity: 'per-target', requiresRevisionMatch: false },
      idempotencyKey: 'candidate-key',
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'creative-ai-canvas-candidate-output-ready' }),
    ]);
    expect(updateNode).toHaveBeenCalledWith('shot-1', {
      creativeAiCandidates: expect.objectContaining({
        [candidateTargetRef.id]: expect.objectContaining({
          status: 'candidate',
          candidateTargetRef,
          outputRefs: [expect.objectContaining({ generatedAssetId: 'image/shot-1.png' })],
        }),
      }),
    });
    expect(updateNode.mock.calls[0]?.[1]).not.toHaveProperty('generatedImage');
    expect(updateNode.mock.calls[0]?.[1]).not.toHaveProperty('generatedAsset');
  });

  it('promotes stored candidates only after target revision still matches', async () => {
    const node = shotNode('shot-1');
    const targetRef = {
      ...buildCanvasGeneratedImageTargetRef({ documentRef, node }),
      fieldPath: CANVAS_GENERATED_ASSET_FIELD_PATH,
      id: 'canvas-node:shot-1#/generatedAsset',
      revision: createCanvasTargetRevision(node, CANVAS_GENERATED_ASSET_FIELD_PATH),
    };
    const candidateTargetRef = {
      ...targetRef,
      kind: 'candidate-target',
      id: 'canvas-node:shot-1#candidate-generated-asset',
      candidateOnly: true,
    } satisfies CreativeAiTargetRef;
    let currentNode = node;
    const updateNode = vi.fn(async (nodeId: string, data: Record<string, unknown>) => {
      currentNode = {
        ...currentNode,
        data: {
          ...(currentNode.data as Record<string, unknown>),
          ...data,
        },
      } as CanvasNode;
    });
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => currentNode),
      updateNode,
    });
    const targetRevision = createCanvasTargetRevision(node, CANVAS_GENERATED_ASSET_FIELD_PATH);
    const candidateApply = await adapter.apply({
      ...applyRequest(targetRef, targetRevision),
      candidateTargetRef,
      writeback: { kind: 'candidate', atomicity: 'per-target', requiresRevisionMatch: true },
      idempotencyKey: 'candidate-promote-key',
    });
    expect(candidateApply.ok).toBe(true);

    const promoted = await adapter.promoteCandidate({
      schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
      requestId: 'promote-1',
      sourcePackage: 'neko-canvas',
      targetRef,
      candidateTargetRef,
      targetRevision,
      actor: 'user',
      idempotencyKey: 'promote-key-1',
    });

    expect(promoted).toEqual(
      expect.objectContaining({
        ok: true,
        outcome: 'promoted',
        appliedOutputRefs: [expect.objectContaining({ generatedAssetId: 'image/shot-1.png' })],
      }),
    );
    expect(updateNode).toHaveBeenLastCalledWith(
      'shot-1',
      expect.objectContaining({
        generatedAsset: expect.objectContaining({
          path: 'generated-assets/image/shot-1.png',
        }),
        creativeAiCandidates: expect.objectContaining({
          [candidateTargetRef.id]: expect.objectContaining({ status: 'promoted' }),
        }),
      }),
    );
  });

  it('rejects stale target revisions during candidate promotion', async () => {
    const node = shotNode('shot-1');
    const targetRef = {
      ...buildCanvasGeneratedImageTargetRef({ documentRef, node }),
      fieldPath: CANVAS_GENERATED_ASSET_FIELD_PATH,
      id: 'canvas-node:shot-1#/generatedAsset',
      revision: createCanvasTargetRevision(node, CANVAS_GENERATED_ASSET_FIELD_PATH),
    };
    const candidateTargetRef = {
      ...targetRef,
      kind: 'candidate-target',
      id: 'canvas-node:shot-1#candidate-generated-asset',
      candidateOnly: true,
    } satisfies CreativeAiTargetRef;
    let currentNode = node;
    const updateNode = vi.fn(async (nodeId: string, data: Record<string, unknown>) => {
      currentNode = {
        ...currentNode,
        data: {
          ...(currentNode.data as Record<string, unknown>),
          ...data,
        },
      } as CanvasNode;
    });
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => currentNode),
      updateNode,
    });
    const targetRevision = createCanvasTargetRevision(node, CANVAS_GENERATED_ASSET_FIELD_PATH);
    await adapter.apply({
      ...applyRequest(targetRef, targetRevision),
      candidateTargetRef,
      writeback: { kind: 'candidate', atomicity: 'per-target', requiresRevisionMatch: true },
      idempotencyKey: 'candidate-stale-key',
    });
    currentNode = shotNode('shot-1', { data: { generatedAsset: { path: 'newer.png' } } });

    const promoted = await adapter.promoteCandidate({
      schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
      requestId: 'promote-stale',
      sourcePackage: 'neko-canvas',
      targetRef,
      candidateTargetRef,
      targetRevision,
      actor: 'user',
      idempotencyKey: 'promote-stale-key',
    });

    expect(promoted.ok).toBe(false);
    expect(promoted.outcome).toBe('stale-target');
    expect(promoted.diagnostics).toEqual([
      expect.objectContaining({ code: 'creative-ai-canvas-target-stale' }),
    ]);
  });

  it('promotes stored candidates from Webview candidate action requests', async () => {
    const node = shotNode('shot-1');
    const targetRef = {
      ...buildCanvasGeneratedImageTargetRef({ documentRef, node }),
      fieldPath: CANVAS_GENERATED_ASSET_FIELD_PATH,
      id: 'canvas-node:shot-1#/generatedAsset',
      revision: createCanvasTargetRevision(node, CANVAS_GENERATED_ASSET_FIELD_PATH),
    };
    const candidateTargetRef = {
      ...targetRef,
      kind: 'candidate-target',
      id: 'canvas-node:shot-1#candidate-generated-asset',
      candidateOnly: true,
    } satisfies CreativeAiTargetRef;
    let currentNode = node;
    const updateNode = vi.fn(async (_nodeId: string, data: Record<string, unknown>) => {
      currentNode = {
        ...currentNode,
        data: {
          ...(currentNode.data as Record<string, unknown>),
          ...data,
        },
      } as CanvasNode;
    });
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => currentNode),
      updateNode,
    });
    const targetRevision = createCanvasTargetRevision(node, CANVAS_GENERATED_ASSET_FIELD_PATH);
    await adapter.apply({
      ...applyRequest(targetRef, targetRevision),
      candidateTargetRef,
      writeback: { kind: 'candidate', atomicity: 'per-target', requiresRevisionMatch: true },
      idempotencyKey: 'candidate-webview-key',
    });

    const promoted = await adapter.promoteStoredCandidate({
      nodeId: 'shot-1',
      candidateId: candidateTargetRef.id,
      actor: 'user',
      requestedAt: '2026-07-10T00:00:00.000Z',
    });

    expect(promoted.ok).toBe(true);
    expect(promoted.outcome).toBe('promoted');
    expect(updateNode).toHaveBeenLastCalledWith(
      'shot-1',
      expect.objectContaining({
        generatedAsset: expect.objectContaining({ path: 'generated-assets/image/shot-1.png' }),
        creativeAiCandidates: expect.objectContaining({
          [candidateTargetRef.id]: expect.objectContaining({
            status: 'promoted',
            provenance: expect.objectContaining({
              promotion: expect.objectContaining({ actor: 'user', outcome: 'promoted' }),
            }),
          }),
        }),
      }),
    );
  });

  it('marks stored candidates rejected or deleted without promoting formal targets', async () => {
    const node = shotNode('shot-1');
    const targetRef = {
      ...buildCanvasGeneratedImageTargetRef({ documentRef, node }),
      fieldPath: CANVAS_GENERATED_ASSET_FIELD_PATH,
      id: 'canvas-node:shot-1#/generatedAsset',
      revision: createCanvasTargetRevision(node, CANVAS_GENERATED_ASSET_FIELD_PATH),
    };
    const candidateTargetRef = {
      ...targetRef,
      kind: 'candidate-target',
      id: 'canvas-node:shot-1#candidate-generated-asset',
      candidateOnly: true,
    } satisfies CreativeAiTargetRef;
    let currentNode = node;
    const updateNode = vi.fn(async (_nodeId: string, data: Record<string, unknown>) => {
      currentNode = {
        ...currentNode,
        data: {
          ...(currentNode.data as Record<string, unknown>),
          ...data,
        },
      } as CanvasNode;
    });
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => currentNode),
      updateNode,
    });
    const targetRevision = createCanvasTargetRevision(node, CANVAS_GENERATED_ASSET_FIELD_PATH);
    await adapter.apply({
      ...applyRequest(targetRef, targetRevision),
      candidateTargetRef,
      writeback: { kind: 'candidate', atomicity: 'per-target', requiresRevisionMatch: true },
      idempotencyKey: 'candidate-disposition-key',
    });

    const rejected = await adapter.markStoredCandidateDisposition({
      nodeId: 'shot-1',
      candidateId: candidateTargetRef.id,
      disposition: 'rejected',
      requestedAt: '2026-07-10T00:00:00.000Z',
    });
    const deleted = await adapter.markStoredCandidateDisposition({
      nodeId: 'shot-1',
      candidateId: candidateTargetRef.id,
      disposition: 'deleted',
      requestedAt: '2026-07-10T00:00:01.000Z',
    });

    expect(rejected.ok).toBe(true);
    expect(deleted.ok).toBe(true);
    expect(updateNode.mock.calls.some((call) => 'generatedAsset' in call[1])).toBe(false);
    expect(updateNode).toHaveBeenLastCalledWith(
      'shot-1',
      expect.objectContaining({
        creativeAiCandidates: expect.objectContaining({
          [candidateTargetRef.id]: expect.objectContaining({
            status: 'deleted',
            deletedAt: '2026-07-10T00:00:01.000Z',
          }),
        }),
      }),
    );
  });

  it('rejects runtime-only output identities before apply', async () => {
    const node = shotNode('shot-1');
    const targetRef = buildCanvasGeneratedImageTargetRef({ documentRef, node });
    const adapter = new CanvasCreativeAiApplyAdapter({
      getNode: vi.fn(async () => node),
      updateNode: vi.fn(async () => undefined),
    });

    const result = await adapter.apply(
      applyRequest(targetRef, createCanvasTargetRevision(node, CANVAS_GENERATED_IMAGE_FIELD_PATH), {
        outputRefs: [
          outputRef({
            generatedAssetId: 'asset-1',
            metadata: { previewUrl: 'blob:vscode/preview' },
          }),
        ],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'creative-ai-canvas-runtime-only-identity' }),
    ]);
  });

  it('does not directly mutate Canvas Webview component state from the adapter', () => {
    const port = {
      getNode: vi.fn(async () => shotNode('shot-1')),
      updateNode: vi.fn(async () => undefined),
      webview: { postMessage: vi.fn() },
    };
    const adapter = new CanvasCreativeAiApplyAdapter(port);

    expect(adapter).toBeInstanceOf(CanvasCreativeAiApplyAdapter);
    expect(port.webview.postMessage).not.toHaveBeenCalled();
  });
});
