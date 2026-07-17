import { describe, expect, it } from 'vitest';
import type { CreativeEntityRef } from '../creative-entity-asset-composition';
import type { PerceptionCard } from '../perception-card';
import {
  COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
  BATCH_EXECUTION_PLAN_KIND,
  CHARACTER_STATE_CHANGE_KIND,
  CONTINUITY_CONSTRAINT_KIND,
  INDEXED_RANGE_STATE_KIND,
  PLOT_EVENT_KIND,
  STORY_CONTINUITY_SNAPSHOT_KIND,
  VISUAL_OCCURRENCE_KIND,
  buildBatchExecutionReviewTable,
  buildComicAnimationReviewArtifact,
  buildContinuityDiagnosticsReviewTable,
  buildVisualOccurrenceReviewTable,
  createLocalOcrPerceptionCapabilityFacet,
  createLocalPanelDetectionPerceptionCapabilityFacet,
  createLocalPerceptionCapabilityFacet,
  createLocalReadingOrderPerceptionCapabilityFacet,
  createLocalSpeechBalloonMaskPerceptionCapabilityFacet,
  diagnosePerceptionCapabilityFacet,
  perceptionFacetRequiresReview,
  projectPerceptionCardToIndexedRangeState,
  projectVisualOccurrenceFromEvidence,
  projectVisualOccurrencesToShotReferenceBundle,
  reviewStateForPerceptionOutput,
  validateBatchExecutionPlan,
  validateIndexedRangeState,
  validatePerceptionCapabilityFacet,
  validateStoryContinuitySnapshot,
  validateVisualOccurrence,
  type BatchExecutionPlan,
  type StoryContinuitySnapshot,
  type VisualOccurrence,
} from '../comic-animation-indexing';

describe('comic animation incremental indexing contracts', () => {
  it('validates indexed range state and projects perception cards into task state', () => {
    const card = makePerceptionCard();

    const state = projectPerceptionCardToIndexedRangeState({
      card,
      sourceRef: sourceRef(),
      rangeKind: 'page',
      range: { pageId: 'page-1' },
    });

    expect(state).toMatchObject({
      schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
      kind: INDEXED_RANGE_STATE_KIND,
      assetId: 'asset-page-1',
      status: 'partial',
      rangeRef: {
        rangeKind: 'page',
        range: { pageId: 'page-1' },
      },
    });
    expect(state.tasks.map((task) => task.task)).toEqual(['asr', 'vlm-review']);
    expect(validateIndexedRangeState(state)).toEqual({ ok: true, diagnostics: [] });
  });

  it('rejects unsafe runtime handles in visual occurrence refs', () => {
    const result = validateVisualOccurrence({
      ...makeOccurrence(),
      cropRef: {
        refId: 'crop-1',
        role: 'derived',
        locator: {
          type: 'workspace-path',
          path: 'blob:https://localhost/crop',
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unsafe-runtime-handle',
          path: ['cropRef', 'locator', 'path'],
        }),
      ]),
    );
  });

  it('keeps confidence-less perception provider output on review path', () => {
    const facet = createLocalPerceptionCapabilityFacet({
      providerId: 'ocr.no-score',
      source: 'engine',
      tasks: ['ocr'],
      supportedMediaKinds: ['comic', 'image'],
      confidenceKind: 'none',
    });

    expect(validatePerceptionCapabilityFacet(facet)).toEqual({ ok: true, diagnostics: [] });
    expect(perceptionFacetRequiresReview(facet)).toBe(true);
    expect(reviewStateForPerceptionOutput(facet, 0.99)).toBe('needs-review');
    expect(
      diagnosePerceptionCapabilityFacet(facet, {
        availableProviderIds: ['ocr.other'],
        currentDeviceTier: 'light',
        requireConfidenceForAutoBinding: true,
      }).map((diagnostic) => diagnostic.code),
    ).toEqual(expect.arrayContaining(['provider-unavailable', 'low-confidence']));
  });

  it('creates local perception facets for OCR, panel detection, reading order, and masks', () => {
    const facets = [
      createLocalOcrPerceptionCapabilityFacet(),
      createLocalPanelDetectionPerceptionCapabilityFacet(),
      createLocalReadingOrderPerceptionCapabilityFacet(),
      createLocalSpeechBalloonMaskPerceptionCapabilityFacet(),
    ];

    expect(facets.map((facet) => facet.tasks[0])).toEqual([
      'ocr',
      'panel-detection',
      'reading-order',
      'speech-balloon-mask',
    ]);
    expect(facets.map((facet) => validatePerceptionCapabilityFacet(facet).ok)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(perceptionFacetRequiresReview(facets[3]!)).toBe(true);
  });

  it('validates continuity snapshots as bounded read models', () => {
    const snapshot = makeContinuitySnapshot();

    expect(validateStoryContinuitySnapshot(snapshot)).toEqual({ ok: true, diagnostics: [] });
    expect(snapshot.limitsApplied).toEqual({
      boundary: 'scene',
      maxEvents: 12,
      maxCharacterStates: 24,
      maxConstraints: 8,
    });
  });

  it('warns when unknown batch cost does not require approval', () => {
    const result = validateBatchExecutionPlan({
      ...makeBatchPlan(),
      approvalPolicy: { requiresApproval: false },
      costEstimate: { estimateState: 'unknown' },
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          code: 'cost-unknown',
        }),
      ]),
    );
  });

  it('projects visual evidence and batch items into review tables', () => {
    const occurrence = projectVisualOccurrenceFromEvidence({
      occurrenceId: 'occ-rin-page-1-panel-2',
      sourceRef: sourceRef(),
      range: { pageId: 'page-1', panelId: 'panel-2' },
      cropRef: makeOccurrence().cropRef,
      candidateEntityRefs: [characterRef],
      appearanceText: 'short dark hair, school jacket',
      providerId: 'local.person-detector',
      confidence: 0.91,
      facet: createLocalOcrPerceptionCapabilityFacet(),
    });
    const visualTable = buildVisualOccurrenceReviewTable([occurrence]);
    const batchTable = buildBatchExecutionReviewTable(makeBatchPlan());
    const snapshot = makeContinuitySnapshot();
    const continuityTable = buildContinuityDiagnosticsReviewTable(snapshot);
    const artifact = buildComicAnimationReviewArtifact({
      artifactId: 'artifact-comic-review-1',
      visualOccurrences: [occurrence],
      continuitySnapshot: snapshot,
      batchPlan: makeBatchPlan(),
    });
    const referenceBundle = projectVisualOccurrencesToShotReferenceBundle([occurrence]);

    expect(visualTable.rows[0]?.cells['candidate']).toEqual({
      type: 'string',
      value: 'char-rin',
    });
    expect(batchTable.rows[0]?.cells['capabilityId']).toEqual({
      type: 'string',
      value: 'perception.ocr',
    });
    expect(continuityTable.rows.map((row) => row.rowId)).toEqual(
      expect.arrayContaining(['constraint-1', 'question-0']),
    );
    expect(artifact.blocks.map((block) => block.blockId)).toEqual([
      'visual-occurrences',
      'continuity-diagnostics',
      'batch-execution',
    ]);
    expect(referenceBundle.characterRefs?.[0]).toMatchObject({
      entityRef: characterRef,
      role: 'appearance',
      confidence: 0.91,
    });
  });

  it('validates batch execution plan status, policy, and items', () => {
    const plan = makeBatchPlan();

    expect(validateBatchExecutionPlan(plan)).toEqual({ ok: true, diagnostics: [] });
    expect(validateBatchExecutionPlan({ ...plan, targetDomain: 'music' }).ok).toBe(false);
    expect(validateBatchExecutionPlan({ ...plan, executionPolicy: { maxConcurrency: 0 } }).ok).toBe(
      false,
    );
  });
});

const characterRef: CreativeEntityRef = {
  entityId: 'char-rin',
  entityKind: 'character',
};

function sourceRef() {
  return {
    kind: 'generated-asset',
    assetId: 'asset-page-1',
    range: {
      pageId: 'page-1',
      panelId: 'panel-2',
    },
  } as const;
}

function makePerceptionCard(): PerceptionCard {
  return {
    version: 1,
    assetId: 'asset-page-1',
    modality: 'image',
    createdAt: 1_800_000_000,
    layerStatus: {
      layer0: 'complete',
      layer1: 'complete',
      layer2: 'skipped',
    },
    structural: {
      format: 'png',
      mimeType: 'image/png',
      byteSize: 1024,
    },
    semantic: {
      evidences: [
        {
          kind: 'transcript',
          confidence: 0.76,
          value: 'Rin: We need to go.',
        },
        {
          kind: 'description',
          confidence: 0.7,
          value: 'Rin stands near the gate.',
        },
      ],
    },
  };
}

function makeOccurrence(): VisualOccurrence {
  return {
    schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
    kind: VISUAL_OCCURRENCE_KIND,
    occurrenceId: 'occ-rin-page-1-panel-2',
    sourceRef: sourceRef(),
    range: {
      pageId: 'page-1',
      panelId: 'panel-2',
    },
    boundingBox: {
      x: 10,
      y: 20,
      width: 120,
      height: 240,
      unit: 'pixel',
    },
    cropRef: {
      refId: 'crop-rin-1',
      role: 'derived',
      locator: {
        type: 'workspace-path',
        path: '${PROJECT}/.neko/semantic-index/asset-page-1/crops/rin.png',
      },
      mimeType: 'image/png',
    },
    candidateEntityRefs: [characterRef],
    appearanceText: 'short dark hair, school jacket',
    providerId: 'local.person-detector',
    confidence: 0.91,
    reviewState: 'candidate',
  };
}

function makeContinuitySnapshot(): StoryContinuitySnapshot {
  return {
    schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
    kind: STORY_CONTINUITY_SNAPSHOT_KIND,
    snapshotId: 'continuity-scene-1',
    query: {
      storyPosition: {
        chapterId: 'chapter-1',
        sceneId: 'scene-1',
        orderIndex: 8,
      },
      characterRefs: [characterRef],
      include: ['plot-events', 'character-states', 'constraints', 'diagnostics'],
    },
    events: [
      {
        schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
        kind: PLOT_EVENT_KIND,
        eventId: 'event-1',
        summary: 'Rin discovers the closed gate.',
        storyPosition: {
          chapterId: 'chapter-1',
          sceneId: 'scene-1',
          orderIndex: 7,
        },
        orderIndex: 7,
        sourceRef: sourceRef(),
        participantRefs: [characterRef],
        confidence: 0.82,
      },
    ],
    characterStates: [
      {
        schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
        kind: CHARACTER_STATE_CHANGE_KIND,
        changeId: 'state-1',
        characterRef,
        dimension: 'location',
        after: 'front gate',
        sourceRef: sourceRef(),
        confidence: 0.8,
      },
    ],
    constraints: [
      {
        schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
        kind: CONTINUITY_CONSTRAINT_KIND,
        constraintId: 'constraint-1',
        type: 'blocking',
        message: 'Rin must remain at the gate until the key is found.',
        entityRefs: [characterRef],
        confidence: 0.7,
      },
    ],
    unresolvedQuestions: ['Who owns the key?'],
    limitsApplied: {
      boundary: 'scene',
      maxEvents: 12,
      maxCharacterStates: 24,
      maxConstraints: 8,
    },
  };
}

function makeBatchPlan(): BatchExecutionPlan {
  return {
    schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
    kind: BATCH_EXECUTION_PLAN_KIND,
    planId: 'batch-index-1',
    sourceArtifactRefs: ['artifact-storyboard-1'],
    targetDomain: 'asset-indexing',
    items: [
      {
        itemId: 'item-ocr-page-1',
        targetRef: 'range:asset-page-1:page-1',
        capabilityId: 'perception.ocr',
        status: 'approved',
        providerId: 'local.ocr',
        requiredDeviceTier: 'light',
        costEstimate: {
          estimateState: 'known',
          estimatedCost: 0,
        },
      },
    ],
    approvalPolicy: {
      requiresApproval: true,
      approvalId: 'approval-1',
    },
    executionPolicy: {
      maxConcurrency: 2,
      retryPolicy: {
        maxAttempts: 2,
        retryOn: ['provider-timeout', 'rate-limit'],
      },
      failurePolicy: 'continue-approved-only',
      allowCancellation: true,
    },
    costEstimate: {
      estimateState: 'known',
      estimatedCost: 0,
    },
    status: 'approved',
  };
}
