import { describe, expect, it } from 'vitest';
import {
  CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
  type CreativeAiDocumentRef,
  type CreativeAiSourceRef,
  type CreativeAiTargetRef,
  isAgentInternalInvocation,
  isExternalCreativeAiInvocation,
  isRuntimeOnlyCreativeAiIdentityValue,
  validateAgentInternalInvocation,
  validateConversationLifecycleCommand,
  validateCreativeAiCandidateApplyRequest,
  validateCreativeAiCandidatePromotionRequest,
  validateCreativeAiLaneSnapshot,
  validateCreativeAiRoutingDecision,
  validateCreativeAiRunAggregateSnapshot,
  validateCreativeAiRunSnapshot,
  validateExternalCreativeAiInvocation,
} from '../index';

const documentRef: CreativeAiDocumentRef = {
  kind: 'nk-document',
  packageId: 'neko-canvas',
  documentId: 'doc-1',
  projectRelativePath: 'boards/intro.nkc',
  format: 'nkc',
};

const sourceRef: CreativeAiSourceRef = {
  kind: 'canvas-node',
  packageId: 'neko-canvas',
  id: 'canvas-node:node-1',
  documentRef,
  entityId: 'node-1',
  revision: 'source-rev-1',
};

const targetRef: CreativeAiTargetRef = {
  kind: 'canvas-field',
  packageId: 'neko-canvas',
  id: 'canvas-node:node-1#/data/prompt',
  documentRef,
  entityId: 'node-1',
  fieldPath: '/data/prompt',
  revision: 'target-rev-1',
};

function validExternalInvocation() {
  return {
    schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
    domain: 'external-creative-package',
    invocationId: 'invoke-1',
    sourcePackage: 'neko-canvas',
    documentRef,
    sourceRef,
    targetRef,
    intent: 'Improve the prompt field for a storyboard node.',
    mode: 'edit',
    writeback: {
      kind: 'mutating',
      atomicity: 'per-target',
      requiresRevisionMatch: true,
    },
    documentRevision: 'doc-rev-1',
    targetRevision: 'target-rev-1',
    routing: {
      associationKey: 'neko-canvas:doc-1',
      allowCreateBackgroundConversation: true,
    },
    idempotencyKey: 'neko-canvas:doc-1:node-1:prompt:edit:doc-rev-1',
  } as const;
}

describe('creative AI invocation contracts', () => {
  it('validates Agent-internal invocations against the selected conversation', () => {
    const valid = {
      schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
      domain: 'agent-internal',
      invocationId: 'agent-action-1',
      conversationId: 'conversation-1',
      intent: 'Regenerate this Agent message artifact.',
      mode: 'retry',
      idempotencyKey: 'conversation-1:agent-action-1',
    } as const;

    expect(validateAgentInternalInvocation(valid).valid).toBe(true);
    expect(isAgentInternalInvocation(valid)).toBe(true);

    const missingConversation = validateAgentInternalInvocation({
      ...valid,
      conversationId: '',
    });

    expect(missingConversation.valid).toBe(false);
    expect(missingConversation.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'creative-ai-missing-conversation-id',
        target: 'conversationId',
      }),
    ]);
  });

  it('validates external creative-package invocations with explicit source and target refs', () => {
    const valid = validExternalInvocation();

    expect(validateExternalCreativeAiInvocation(valid).valid).toBe(true);
    expect(isExternalCreativeAiInvocation(valid)).toBe(true);

    const missingSource = validateExternalCreativeAiInvocation({
      ...valid,
      sourceRef: undefined,
    });

    expect(missingSource.valid).toBe(false);
    expect(missingSource.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'creative-ai-missing-source-ref',
        target: 'sourceRef',
      }),
    ]);
  });

  it('rejects mutating invocations that lack target or candidate target refs', () => {
    const missingTarget = validateExternalCreativeAiInvocation({
      ...validExternalInvocation(),
      targetRef: undefined,
      candidateTargetRef: undefined,
    });

    expect(missingTarget.valid).toBe(false);
    expect(missingTarget.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'creative-ai-missing-target-ref',
        target: 'targetRef',
      }),
    ]);

    const candidateOnly = validateExternalCreativeAiInvocation({
      ...validExternalInvocation(),
      targetRef: undefined,
      candidateTargetRef: {
        ...targetRef,
        kind: 'candidate-target',
        id: 'canvas-node:node-1#candidate-output',
        candidateOnly: true,
      },
    });

    expect(candidateOnly.valid).toBe(true);
  });

  it('rejects runtime handles and cache paths as durable invocation identity', () => {
    expect(isRuntimeOnlyCreativeAiIdentityValue('blob:vscode/preview')).toBe(true);
    expect(isRuntimeOnlyCreativeAiIdentityValue('.neko/.cache/generated/image.png')).toBe(true);
    expect(isRuntimeOnlyCreativeAiIdentityValue('boards/intro.nkc')).toBe(false);

    const runtimeSource = validateExternalCreativeAiInvocation({
      ...validExternalInvocation(),
      sourceRef: {
        ...sourceRef,
        contentRef: {
          kind: 'runtime',
          runtimeKind: 'webview-uri',
          value: 'vscode-webview://panel/generated.png',
        },
      },
    });

    expect(runtimeSource.valid).toBe(false);
    expect(runtimeSource.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'creative-ai-runtime-only-identity',
        target: 'sourceRef.contentRef',
      }),
    ]);

    const cachePathDocument = validateExternalCreativeAiInvocation({
      ...validExternalInvocation(),
      documentRef: {
        ...documentRef,
        documentId: undefined,
        projectRelativePath: '.neko/.cache/generated/image.png',
      },
    });

    expect(cachePathDocument.valid).toBe(false);
    expect(cachePathDocument.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'creative-ai-runtime-only-identity',
        target: 'documentRef.projectRelativePath',
      }),
    ]);
  });

  it('validates routing, lifecycle, and run snapshot envelopes', () => {
    expect(
      validateCreativeAiRoutingDecision({
        conversationId: 'conversation-1',
        domain: 'external-creative-package',
        routingReason: 'recent-associated-conversation',
        associationKey: 'neko-canvas:doc-1',
        sourcePackage: 'neko-canvas',
        conversationState: 'active',
        diagnostics: [],
      }).valid,
    ).toBe(true);

    expect(
      validateConversationLifecycleCommand({
        schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
        commandId: 'archive-1',
        conversationId: 'conversation-1',
        action: 'stop-and-delete',
        activeRunIds: ['run-1'],
      }).valid,
    ).toBe(true);

    const runSnapshot = validateCreativeAiRunSnapshot({
      schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
      runId: 'run-1',
      conversationId: 'conversation-1',
      invocationId: 'invoke-1',
      invocationDomain: 'external-creative-package',
      sourcePackage: 'neko-canvas',
      associationKey: 'neko-canvas:doc-1',
      routingReason: 'recent-associated-conversation',
      sourceRef,
      documentRef,
      targetRef,
      intent: 'Improve prompt.',
      mode: 'edit',
      writeback: { kind: 'mutating', requiresRevisionMatch: true },
      documentRevision: 'doc-rev-1',
      targetRevision: 'target-rev-1',
      idempotencyKey: 'neko-canvas:doc-1:node-1:prompt:edit:doc-rev-1',
      status: 'accepted',
      createdAt: '2026-07-07T00:00:00.000Z',
      workItems: [
        {
          workItemId: 'work-1',
          status: 'queued',
          targetRef,
          diagnostics: [],
        },
      ],
    });

    expect(runSnapshot.valid).toBe(true);
  });

  it('validates candidate apply and promotion envelopes', () => {
    const candidateTargetRef: CreativeAiTargetRef = {
      ...targetRef,
      kind: 'candidate-target',
      id: 'canvas-node:node-1#/candidates/prompt-1',
      candidateOnly: true,
    };
    const candidateApply = validateCreativeAiCandidateApplyRequest({
      schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
      requestId: 'candidate-apply-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      workItemId: 'work-1',
      sourcePackage: 'neko-canvas',
      candidateTargetRef,
      outputRefs: [{ kind: 'text', id: 'candidate-text-1' }],
      writeback: { kind: 'candidate', requiresRevisionMatch: true },
      targetRevision: 'target-rev-1',
      idempotencyKey: 'candidate-apply:run-1:work-1',
    });

    expect(candidateApply.valid).toBe(true);

    const wrongWriteback = validateCreativeAiCandidateApplyRequest({
      schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
      requestId: 'candidate-apply-2',
      conversationId: 'conversation-1',
      runId: 'run-1',
      sourcePackage: 'neko-canvas',
      candidateTargetRef,
      outputRefs: [{ kind: 'text', id: 'candidate-text-1' }],
      writeback: { kind: 'mutating', requiresRevisionMatch: true },
      targetRevision: 'target-rev-1',
      idempotencyKey: 'candidate-apply:run-1:work-2',
    });

    expect(wrongWriteback.valid).toBe(false);
    expect(wrongWriteback.diagnostics).toEqual([
      expect.objectContaining({
        code: 'creative-ai-invalid-writeback-kind',
        target: 'writeback.kind',
      }),
    ]);

    const promotion = validateCreativeAiCandidatePromotionRequest({
      schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
      requestId: 'promote-1',
      sourcePackage: 'neko-canvas',
      targetRef,
      candidateTargetRef,
      targetRevision: 'target-rev-1',
      runId: 'run-1',
      workItemId: 'work-1',
      conversationId: 'conversation-1',
      outputRefs: [{ kind: 'text', id: 'candidate-text-1' }],
      actor: 'judge',
      judgeWorkItemId: 'judge-1',
      judgeResultRef: { kind: 'structured-data', id: 'judge-result-1' },
      idempotencyKey: 'promote:run-1:work-1',
    });

    expect(promotion.valid).toBe(true);

    const missingRevision = validateCreativeAiCandidatePromotionRequest({
      schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
      requestId: 'promote-2',
      sourcePackage: 'neko-canvas',
      targetRef,
      candidateTargetRef,
      actor: 'user',
      idempotencyKey: 'promote:run-1:work-2',
    });

    expect(missingRevision.valid).toBe(false);
    expect(missingRevision.diagnostics).toEqual([
      expect.objectContaining({
        code: 'creative-ai-missing-revision',
        target: 'targetRevision',
      }),
    ]);
  });

  it('validates lane and aggregate run snapshots', () => {
    const lane = {
      laneKind: 'video',
      maxActive: 1,
      activeCount: 1,
      queuedCount: 2,
      runningCount: 1,
      completedCount: 3,
      failedCount: 0,
      cancelledCount: 0,
      diagnostics: [],
    } as const;

    expect(validateCreativeAiLaneSnapshot(lane).valid).toBe(true);
    expect(
      validateCreativeAiRunAggregateSnapshot({
        runId: 'run-1',
        totalCount: 6,
        completedCount: 3,
        failedCount: 0,
        runningCount: 1,
        queuedCount: 2,
        lanes: [lane],
      }).valid,
    ).toBe(true);

    const invalidLane = validateCreativeAiLaneSnapshot({
      ...lane,
      laneKind: 'video-and-audio',
      queuedCount: -1,
    });

    expect(invalidLane.valid).toBe(false);
    expect(invalidLane.diagnostics).toEqual([
      expect.objectContaining({
        code: 'creative-ai-invalid-lane-kind',
        target: 'lane.laneKind',
      }),
      expect.objectContaining({
        code: 'creative-ai-invalid-count',
        target: 'lane.queuedCount',
      }),
    ]);
  });
});
