import { describe, expect, it } from 'vitest';
import type { CanvasData, CanvasNode } from '../../types/canvas';
import type { CanvasStoryboardPayload } from '../../types/storyboard-planner';
import {
  CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
  CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
} from '../../types/canvas-semantic-storyboard';
import { createResourceFingerprint, createResourceRef } from '../../types/resource-cache';
import {
  createEmptyCanvasData,
  planCanvasAgentContentApplication,
  planCanvasBlockUpdate,
  planCanvasCompositeCreation,
  planCanvasNodeCreation,
  planCanvasStoryboardSceneShotCreation,
  validateCanvasDurableResourceIdentity,
} from '../canvasHeadlessAuthoring';

function ids(): () => string {
  let next = 0;
  return () => `generated-${++next}`;
}

function emptyCanvas(): CanvasData {
  return createEmptyCanvasData('Headless Test Canvas');
}

function storyboardPayload(): CanvasStoryboardPayload {
  return {
    mode: 'semantic',
    sourceScriptUri: '${WORKSPACE}/story/demo.nks',
    creativeScope: {
      kind: 'sequence',
      workId: 'demo-sequence',
      title: 'Demo Sequence',
      sceneIds: ['scene-alpha', 'scene-beta'],
      shotIds: ['shot-alpha-1', 'shot-alpha-2', 'shot-beta-1'],
      sourceStoryboardRef: '${WORKSPACE}/story/demo.nks',
    },
    scenes: [
      {
        sceneId: 'scene-alpha',
        sceneTitle: 'Arrival',
        sceneNumber: 1,
        location: 'Rainy hallway',
        storyboardPrompt: {
          version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
          promptBlocks: {
            videoPromptDocument: {
              version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
              documentId: 'scene-alpha:scene:video:prompt',
              blockKind: 'video',
              text: 'A continuous rainy hallway scene with a slow dolly-in and tense pause.',
              fieldProjections: [
                {
                  fieldId: 'scene.videoPrompt',
                  value: 'A continuous rainy hallway scene with a slow dolly-in and tense pause.',
                  alignmentState: 'in-sync',
                },
              ],
              profileId: 'canvas.storyboard.semantic-prompt',
            },
          },
        },
        shotPlans: [
          {
            shotId: 'shot-alpha-1',
            shotNumber: 1,
            duration: 4,
            visualDescription: 'Aki stands under flickering hallway lights.',
            characters: [{ characterName: 'Aki', role: 'primary', action: 'looks back' }],
            shotScale: 'MS',
            cameraMovement: 'dolly-in',
            characterAction: 'turns toward a shadow at the door',
            emotion: ['tense'],
            sceneTags: ['rain', 'hallway'],
            dialogue: '你怎么会在这里？',
            generationPrompt:
              'Aki in a rainy school hallway, wet uniform, tense look, cinematic anime still.',
          },
          {
            shotId: 'shot-alpha-2',
            shotNumber: 2,
            duration: 3,
            visualDescription: 'A black silhouette fills the doorway.',
            characters: [],
            shotScale: 'LS',
            characterAction: 'shadow steps into the frame',
            emotion: ['ominous'],
            sceneTags: ['doorway'],
          },
        ],
      },
      {
        sceneId: 'scene-beta',
        sceneTitle: 'Rooftop',
        sceneNumber: 2,
        location: 'Dusk rooftop',
        shotPlans: [
          {
            shotId: 'shot-beta-1',
            shotNumber: 3,
            duration: 5,
            visualDescription: 'The city glows behind the rooftop fence.',
            characters: [{ characterName: 'Aki', role: 'primary' }],
            shotScale: 'LS',
            cameraMovement: 'static',
            characterAction: 'catches breath against the fence',
            emotion: ['resolved'],
            sceneTags: ['dusk', 'rooftop'],
          },
        ],
      },
    ],
  };
}

describe('canvasHeadlessAuthoring planner', () => {
  it('creates composite scene and shot facts without a Webview executor', () => {
    const plan = planCanvasCompositeCreation(
      { canvasData: emptyCanvas(), generateId: ids() },
      {
        containerType: 'scene',
        position: { x: 100, y: 100 },
        data: {
          sceneId: 'scene-alpha',
          sceneTitle: 'Arrival',
          sceneNumber: 1,
        },
        children: [
          { type: 'shot', data: { shotNumber: 1, visualDescription: 'First beat' } },
          { type: 'shot', data: { shotNumber: 2, visualDescription: 'Second beat' } },
        ],
        connections: [
          {
            sourceChildIndex: 0,
            targetChildIndex: 1,
            type: 'sequence',
            label: 'next',
          },
        ],
      },
    );

    const scene = plan.canvasData.nodes.find((node) => node.id === plan.result.containerId);
    const shots = plan.result.childIds.map((id) =>
      plan.canvasData.nodes.find((node) => node.id === id),
    );

    expect(scene).toMatchObject({
      type: 'scene',
      preset: 'scene.basic',
      container: { policy: 'scene', childIds: plan.result.childIds },
    });
    expect(shots.every((shot) => shot?.type === 'shot')).toBe(true);
    expect(shots[0]?.parentId).toBe(scene?.id);
    expect(plan.canvasData.connections).toEqual([
      expect.objectContaining({
        sourceId: plan.result.childIds[0],
        targetId: plan.result.childIds[1],
        type: 'sequence',
      }),
    ]);
  });

  it('replays a stable composite id without duplicating its Group or children', () => {
    const request = {
      containerId: 'asset-group:task-1',
      containerType: 'group' as const,
      position: { x: 100, y: 100 },
      data: { label: 'Saved candidates' },
      children: [
        {
          id: 'asset-node:entity-1',
          type: 'media' as const,
          data: { mediaType: 'image', assetPath: 'neko/assets/files/image/concept.png' },
        },
      ],
    };
    const created = planCanvasCompositeCreation(
      { canvasData: emptyCanvas(), generateId: ids() },
      request,
    );
    const replayed = planCanvasCompositeCreation(
      { canvasData: created.canvasData, generateId: ids() },
      request,
    );

    expect(created.canvasData.nodes).toHaveLength(2);
    expect(replayed.canvasData.nodes).toEqual(created.canvasData.nodes);
    expect(replayed.batch.operations).toEqual([]);
    expect(replayed.result).toEqual(created.result);
  });

  it('plans deterministic storyboard scene and shot nodes with prompt-first shot data', () => {
    const plan = planCanvasStoryboardSceneShotCreation(
      { canvasData: emptyCanvas() },
      storyboardPayload(),
    );

    expect(plan.result).toMatchObject({
      scenesCreated: 2,
      totalShots: 3,
      scenes: [
        {
          sourceSceneId: 'scene-alpha',
          sceneNodeId: 'scene-scene-alpha',
          shotIds: ['shot-shot-alpha-1', 'shot-shot-alpha-2'],
        },
        {
          sourceSceneId: 'scene-beta',
          sceneNodeId: 'scene-scene-beta',
          shotIds: ['shot-shot-beta-1'],
        },
      ],
    });
    expect(plan.canvasData.creativeScope?.title).toBe('Demo Sequence');
    const firstScene = plan.canvasData.nodes.find(
      (node): node is Extract<CanvasNode, { type: 'scene' }> => node.id === 'scene-scene-alpha',
    );
    expect(firstScene?.data.storyboardPrompt?.promptBlocks?.videoPromptDocument?.text).toBe(
      'A continuous rainy hallway scene with a slow dolly-in and tense pause.',
    );
    const firstShot = plan.canvasData.nodes.find(
      (node): node is Extract<CanvasNode, { type: 'shot' }> => node.id === 'shot-shot-alpha-1',
    );
    expect(firstShot?.data.storyboardPrompt).toBeDefined();
    expect(firstShot?.data.dialogue).toBe('你怎么会在这里？');
    expect(plan.canvasData.connections.some((connection) => connection.type === 'sequence')).toBe(
      true,
    );
  });

  it('preserves stable resource refs in durable shot facts', () => {
    const resourceRef = createResourceRef({
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source: {
        kind: 'document',
        filePath: '${A}/books/demo.epub',
        document: {
          filePath: '${A}/books/demo.epub',
          format: 'epub',
        },
      },
      locator: { kind: 'document', entryPath: 'OPS/page-001.jpg' },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'demo:OPS/page-001.jpg',
        providerId: 'document-archive',
      }),
    });

    const plan = planCanvasNodeCreation(
      { canvasData: emptyCanvas(), generateId: ids() },
      {
        type: 'shot',
        data: {
          shotNumber: 1,
          visualDescription: 'Reference-backed panel.',
          referenceResourceRef: resourceRef,
        },
      },
    );

    expect(plan.result.node).toMatchObject({
      type: 'shot',
      data: {
        referenceResourceRef: resourceRef,
      },
    });
  });

  it('rejects runtime handles and legacy cachePath before persistence', () => {
    const diagnostics = validateCanvasDurableResourceIdentity(
      {
        resourceRef: {
          id: 'stable-ref',
          cachePath: '/Users/feng/Git/neko-test/.neko/.cache/page.png',
        },
        previewUrl: 'http://127.0.0.1:43124/preview/page.png',
        runtimeReferenceImagePath: 'blob:vscode-webview://preview',
      },
      { rootLabel: 'shot.data' },
    );

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'runtime-only-resource-identity',
      'runtime-only-resource-identity',
      'runtime-only-resource-identity',
    ]);
    expect(() =>
      planCanvasNodeCreation(
        { canvasData: emptyCanvas(), generateId: ids() },
        {
          type: 'shot',
          data: {
            visualDescription: 'Bad runtime source',
            referenceImagePath: '/var/folders/neko/page.png',
          },
        },
      ),
    ).toThrow(/runtime-only-resource-identity/);
  });

  it('rejects runtime projection ids while accepting canonical generated output refs', () => {
    const generatedRef = createResourceRef({
      scope: 'project',
      provider: 'generated-output',
      kind: 'generated',
      source: { kind: 'generated-asset', generatedAssetId: 'generated-output:1' },
      locator: { kind: 'generated-asset', assetId: 'generated-output:1' },
      fingerprint: createResourceFingerprint({ strategy: 'hash', value: 'sha256:draft' }),
    });

    expect(
      validateCanvasDurableResourceIdentity({
        groupId: 'runtime:canvas-generated-group:task:1',
        candidateId: 'runtime:canvas-generated-candidate:output:1',
        resourceRef: generatedRef,
      }).map(({ code }) => code),
    ).toEqual(['runtime-only-resource-identity', 'runtime-only-resource-identity']);

    expect(
      planCanvasNodeCreation(
        { canvasData: emptyCanvas(), generateId: ids() },
        {
          type: 'media',
          data: {
            mediaType: 'image',
            resourceRef: generatedRef,
          },
        },
      ).result.node.data,
    ).toMatchObject({ resourceRef: generatedRef });
  });

  it('accepts stable Asset refs and portable legacy generated-source file refs', () => {
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
    const legacyGeneratedSourceRef = createResourceRef({
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

    expect(validateCanvasDurableResourceIdentity({ assetRef, legacyGeneratedSourceRef })).toEqual(
      [],
    );
    expect(
      planCanvasNodeCreation(
        { canvasData: emptyCanvas(), generateId: ids() },
        {
          type: 'media',
          data: {
            mediaType: 'image',
            resourceRef: assetRef,
            legacyGeneratedSourceRef,
          },
        },
      ).result.node,
    ).toMatchObject({ type: 'media' });
  });

  it('applies Agent content through pure headless Canvas data operations', () => {
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
    expect(nodeId).toBeDefined();
    expect(inserted.canvasData.nodes[0]).toMatchObject({
      id: nodeId,
      type: 'text',
      position: { x: 10, y: 20 },
      data: { content: 'first note', format: 'plain' },
    });

    const appended = planCanvasAgentContentApplication(
      { canvasData: inserted.canvasData },
      {
        kind: 'text',
        text: 'second note',
        target: { nodeId, mode: 'append', fieldPath: '/content' },
      },
    );
    expect(appended.result.changed).toBe(true);
    expect(appended.canvasData.nodes[0]?.data.content).toBe('first note\nsecond note');
  });

  it('keeps replayed Agent artifacts idempotent by stable provenance identity', () => {
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

    expect(inserted.canvasData.nodes[0]?.data).toMatchObject({
      title: 'Notes',
      provenance: { messageId: 'artifact:1' },
    });
    expect(replayed.result.changed).toBe(false);
    expect(replayed.result.nodeId).toBe(inserted.result.nodeId);
    expect(replayed.canvasData.nodes).toHaveLength(1);
    expect(replayed.batch.operations).toEqual([]);
  });

  it('keeps replayed stable file and media node imports idempotent by provenance', () => {
    const resourceRef = createResourceRef({
      scope: 'project',
      provider: 'workspace',
      kind: 'document',
      source: { kind: 'file', projectRelativePath: 'docs/reference.pdf' },
      locator: { kind: 'file', path: 'docs/reference.pdf' },
      fingerprint: createResourceFingerprint({ strategy: 'none', value: 'docs/reference.pdf' }),
    });
    const request = {
      type: 'document' as const,
      data: {
        docPath: '',
        docType: 'pdf',
        title: 'Reference',
        resourceRef,
        provenance: { source: 'agent', messageId: 'artifact:file:1' },
      },
    };
    const inserted = planCanvasNodeCreation(
      { canvasData: emptyCanvas(), generateId: ids() },
      request,
    );
    const replayed = planCanvasNodeCreation(
      { canvasData: inserted.canvasData, generateId: ids() },
      request,
    );

    expect(replayed.result.nodeId).toBe(inserted.result.nodeId);
    expect(replayed.canvasData.nodes).toHaveLength(1);
    expect(replayed.batch.operations).toEqual([]);
  });

  it('fails visibly for editor-only Agent content slot targets', () => {
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
  });

  it('fails visibly for invalid presets and headless block targets without bindings', () => {
    expect(() =>
      planCanvasCompositeCreation(
        { canvasData: emptyCanvas(), generateId: ids() },
        {
          containerPreset: 'missing.container',
          children: [{ type: 'shot' }],
        },
      ),
    ).toThrow(/Unsupported container preset/);

    const created = planCanvasNodeCreation(
      { canvasData: emptyCanvas(), generateId: ids() },
      {
        type: 'text',
        data: { content: 'draft' },
      },
    );
    expect(() =>
      planCanvasBlockUpdate(
        { canvasData: created.canvasData },
        {
          nodeId: created.result.nodeId,
          blockId: 'text-content',
          value: 'updated',
        },
      ),
    ).toThrow(/no writable binding in headless mode/);
  });
});
