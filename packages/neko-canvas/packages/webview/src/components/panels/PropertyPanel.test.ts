import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import { buildCanvasNode } from '../../utils/nodeFactory';
import {
  createBuiltInNodePropertiesRendererRegistry,
  enumerateComposablePropertyItems,
  resolveComposableActionDisabledReasonPath,
  writeComposablePropertyBinding,
} from './PropertyPanel';

describe('PropertyPanel node properties registry', () => {
  it('registers built-in node property renderers', () => {
    const registry = createBuiltInNodePropertiesRendererRegistry();

    expect(registry.annotation).toBeTypeOf('function');
    expect(registry.storyboard).toBeTypeOf('function');
    expect(registry.text).toBeTypeOf('function');
    expect(registry.group).toBeTypeOf('function');
    expect(registry.media).toBeUndefined();
    expect(registry.shot).toBeUndefined();
    expect(registry.scene).toBeUndefined();
    expect(registry.gallery).toBeUndefined();
  });

  it('enumerates migrated Shot bindings before legacy branches', () => {
    const node = createMigratedNode('shot', {
      shotNumber: 1,
      visualDescription: 'A quiet hallway',
      duration: 4,
      characters: [{ characterId: 'char-mika', characterName: 'Mika' }],
      textCues: [{ cueId: 'text-1', kind: 'dialogue', text: 'Hello', speakerName: 'Mika' }],
      voiceCues: [{ cueId: 'voice-1', kind: 'dialogue', text: 'Hello', speakerName: 'Mika' }],
      emotion: ['calm'],
      generationPrompt: 'animated hallway',
      shotImagePrepPlan: {
        schemaVersion: 1,
        kind: 'shot-image-prep-plan',
        planId: 'shot-1-image-prep',
        sceneId: 'scene-1',
        shotId: 'shot-1',
        imageStrategy: 'transform-original',
        operationPlan: ['crop-panel', 'remove-text', 'inpaint'],
        sourceMediaRefs: [
          {
            refId: 'source-panel-1',
            role: 'source',
            locator: { type: 'tool-result', toolCallId: 'read-comic', assetIndex: 0 },
          },
        ],
        referenceBundle: {
          characterRefs: [
            {
              entityRef: { entityId: 'char-mika', entityKind: 'character' },
              role: 'continuity',
            },
          ],
        },
        diagnostics: [
          {
            severity: 'warning',
            code: 'missing-cost-estimate',
            path: ['costEstimate'],
            message: 'Cost is unknown.',
          },
        ],
        metadata: {
          regenerationRecommendation: {
            decision: 'transform-source',
            label: 'Recommend editing source image',
            reason: 'The shot can preserve source composition through image transform operations.',
            confidence: 0.85,
          },
        },
        status: 'needs-approval',
      },
      visualOccurrences: [
        {
          schemaVersion: 1,
          kind: 'visual-occurrence',
          occurrenceId: 'occ-1',
          sourceRef: { kind: 'asset', assetId: 'page-1' },
          appearanceText: 'Mika in a red coat',
          confidence: 0.74,
          reviewState: 'needs-review',
        },
      ],
      characterCandidates: [
        {
          candidateId: 'candidate-1',
          entityRef: { entityId: 'char-mika', entityKind: 'character' },
          displayName: 'Mika',
          confidence: 0.8,
        },
      ],
      continuityDiagnostics: [
        {
          severity: 'warning',
          code: 'conflict',
          path: ['characters', 0],
          message: 'Outfit differs from previous panel.',
        },
      ],
      batchExecutionPlan: {
        schemaVersion: 1,
        kind: 'batch-execution-plan',
        planId: 'batch-1',
        targetDomain: 'asset-indexing',
        items: [
          {
            itemId: 'item-1',
            targetRef: 'page-1',
            capabilityId: 'perception.ocr',
            status: 'blocked',
            providerId: 'local-ocr',
            diagnostics: [
              {
                severity: 'error',
                code: 'provider-unavailable',
                path: ['providerId'],
                message: 'Local OCR provider unavailable.',
              },
            ],
          },
        ],
        approvalPolicy: { mode: 'explicit' },
        executionPolicy: { maxConcurrency: 1 },
        costEstimate: { estimateState: 'unknown' },
        status: 'needs-approval',
        diagnostics: [
          {
            severity: 'warning',
            code: 'unknown-cost',
            path: ['costEstimate'],
            message: 'Cost is unknown.',
          },
        ],
      },
    });

    const items = enumerateComposablePropertyItems(node);
    const fieldPaths = items
      .filter((item) => item.kind === 'field')
      .map((item) => item.binding.path);
    const collectionPaths = items
      .filter((item) => item.kind === 'collection')
      .map((item) => item.collection.source.path);

    expect(fieldPaths).toContain('/visualDescription');
    expect(fieldPaths).toContain('/duration');
    expect(fieldPaths).not.toContain('/generationPrompt');
    expect(fieldPaths).toContain('/dialogue');
    expect(fieldPaths).toContain('/shotImagePrepPlan/status');
    expect(fieldPaths).toContain('/shotImagePrepPlan/imageStrategy');
    expect(fieldPaths).toContain('/shotImagePrepPlan/metadata/regenerationRecommendation/label');
    expect(fieldPaths).toContain('/shotImagePrepPlan/operationPlan');
    expect(collectionPaths).toContain('/characters');
    expect(collectionPaths).toContain('/textCues');
    expect(collectionPaths).toContain('/voiceCues');
    expect(collectionPaths).toContain('/shotImagePrepPlan/sourceMediaRefs');
    expect(collectionPaths).toContain('/shotImagePrepPlan/referenceBundle/characterRefs');
    expect(collectionPaths).toContain('/shotImagePrepPlan/diagnostics');
    expect(collectionPaths).toContain('/visualOccurrences');
    expect(collectionPaths).toContain('/characterCandidates');
    expect(collectionPaths).toContain('/continuityDiagnostics');
    expect(collectionPaths).toContain('/batchExecutionPlan/items');
    expect(collectionPaths).toContain('/batchExecutionPlan/diagnostics');
    expect(fieldPaths).toContain('/batchExecutionPlan/status');
    expect(fieldPaths).toContain('/batchExecutionPlan/targetDomain');
    expect(fieldPaths).toContain('/batchExecutionPlan/costEstimate/estimatedCost');
    expect(items.filter((item) => item.kind === 'action').map((item) => item.action)).toEqual(
      expect.arrayContaining([
        'approve-shot-prep',
        'reject-shot-prep',
        'estimate-batch-cost',
        'run-shot-prep',
        'run-approved-shot-prep-batch',
      ]),
    );
    expect(
      items.find((item) => item.kind === 'action' && item.action === 'run-shot-prep'),
    ).toMatchObject({
      disabledReasonPath: '/shotImagePrepPlan/diagnostics',
      requiresCapability: 'image-prep-pipeline',
    });
    expect(
      items.some(
        (item) =>
          item.kind === 'collection' &&
          item.collection.source.path === '/characters' &&
          item.collection.source.mode === 'read',
      ),
    ).toBe(true);
    expect(items.some((item) => item.kind === 'preview')).toBe(true);
  });

  it('writes migrated Shot scalar and tag bindings without replacing unrelated data', () => {
    const node = createMigratedNode('shot', {
      shotNumber: 2,
      visualDescription: 'Old',
      duration: 3,
      characters: ['Mika'],
      generationHistory: [
        { id: 'v1', dataUrl: 'asset.png', prompt: 'old', timestamp: 1, selected: true },
      ],
    });

    const nextData = writeComposablePropertyBinding(
      node,
      { path: '/visualDescription', valueType: 'string' },
      'New',
    );
    const withTags = writeComposablePropertyBinding(
      { ...node, data: nextData } as CanvasNode,
      { path: '/characters', valueType: 'array' },
      ['Mika', 'Ren'],
    );

    expect(withTags.visualDescription).toBe('New');
    expect(withTags.characters).toEqual(['Mika', 'Ren']);
    expect(withTags.generationHistory).toEqual(
      (node.data as Record<string, unknown>).generationHistory,
    );
  });

  it('resolves disabled execution action reasons when diagnostics block the gate', () => {
    const node = createMigratedNode('shot', {
      shotNumber: 3,
      visualDescription: 'A blocked shot',
      duration: 3,
      shotImagePrepPlan: {
        schemaVersion: 1,
        kind: 'shot-image-prep-plan',
        planId: 'shot-3-image-prep',
        sceneId: 'scene-1',
        shotId: 'shot-3',
        imageStrategy: 'transform-original',
        operationPlan: ['crop-panel'],
        sourceMediaRefs: [],
        diagnostics: [
          {
            severity: 'error',
            code: 'provider-unavailable',
            path: ['providerId'],
            message: 'Provider unavailable.',
          },
        ],
        status: 'needs-approval',
      },
    });

    expect(resolveComposableActionDisabledReasonPath(node, '/shotImagePrepPlan/diagnostics')).toBe(
      '/shotImagePrepPlan/diagnostics',
    );
    expect(resolveComposableActionDisabledReasonPath(node, '/missing/diagnostics')).toBeUndefined();
  });

  it('enumerates migrated Gallery as container without cells collection', () => {
    const node = createMigratedNode('gallery', {
      characterName: 'Mika',
      preset: 'character-3view',
      rows: 1,
      cols: 3,
    });

    const items = enumerateComposablePropertyItems(node);
    const hasCollection = items.some((item) => item.kind === 'collection');
    expect(hasCollection).toBe(false);
    const hasPresetField = items.some(
      (item) => item.kind === 'field' && item.blockId === 'gallery-preset',
    );
    expect(hasPresetField).toBe(true);
  });

  it('enumerates migrated Media preview metadata as read-only property context', () => {
    const node = createMigratedNode('media', {
      assetPath: 'assets/ref.png',
      mediaType: 'image',
      duration: 1,
    });

    const items = enumerateComposablePropertyItems(node);
    const fieldPaths = items
      .filter((item) => item.kind === 'field')
      .map((item) => item.binding.path);

    expect(fieldPaths).toContain('/assetPath');
    expect(items.some((item) => item.kind === 'preview' && item.role === 'asset-identity')).toBe(
      true,
    );
    expect(items.some((item) => item.kind === 'action' && item.action === 'open-media')).toBe(true);
  });

  it('does not expose retired Scene container actions through composable metadata', () => {
    const node = {
      ...createMigratedNode('scene', {
        sceneTitle: 'Arrival',
        sceneNumber: 1,
      }),
      container: { policy: 'scene', childIds: ['shot-1'] },
    } as CanvasNode;

    const items = enumerateComposablePropertyItems(node);
    const actions = items.filter((item) => item.kind === 'action').map((item) => item.action);

    expect(actions).toEqual([]);
  });
});

function createMigratedNode(
  type: 'shot' | 'scene' | 'gallery' | 'media',
  data: Record<string, unknown>,
): CanvasNode {
  return {
    ...buildCanvasNode({
      type,
      position: { x: 0, y: 0 },
      zIndex: 1,
      preset: `${type}.basic`,
      data,
    }),
    id: `${type}-1`,
  } as CanvasNode;
}
