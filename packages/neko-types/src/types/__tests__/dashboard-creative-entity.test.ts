import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION,
  DASHBOARD_CHARACTER_ROLE_WORKFLOW_ACTIONS,
  DASHBOARD_CREATIVE_ENTITY_ACTIONS,
  DASHBOARD_ENTITY_MEMORY_REVIEW_ACTIONS,
  DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND,
  DASHBOARD_CREATIVE_ENTITY_STATE_COMMAND,
  isDashboardCharacterRoleWorkflowAction,
  isDashboardCharacterRoleWorkflowActionPayload,
  isDashboardCharacterRoleWorkflowActionResult,
  isDashboardCreativeEntityAction,
  isDashboardCreativeEntityActionRequest,
  isDashboardCreativeEntityBindingSummary,
  isDashboardCreativeEntityDetail,
  isDashboardEntityMemoryReviewAction,
  isDashboardEntityMemoryReviewItem,
  isDashboardCreativeEntityRef,
  isDashboardCreativeEntityRow,
  isDashboardCreativeEntitySnapshot,
  isDashboardCreativeEntitySource,
  isDashboardCreativeEntitySourceRequest,
  isDashboardCreativeEntityState,
  isDashboardCreativeEntitySyncSuggestion,
  isSafeDashboardAssetRef,
  isSafeDashboardEntityRef,
  normalizeDashboardEntityLocalRef,
  toDashboardCreativeEntityId,
  type DashboardCreativeEntityDetail,
  type DashboardCreativeEntityRow,
  type DashboardCreativeEntitySource,
} from '../dashboard-creative-entity';

const ref = {
  source: 'neko-story',
  sourceEntityId: 'character:小橘',
  entityId: 'char-xiaoju',
  entityKind: 'character',
  projectRoot: '${workspaceFolder}/story',
} as const;

const row: DashboardCreativeEntityRow = {
  ref,
  label: '小橘',
  kind: 'character',
  status: 'candidate',
  sourceKind: 'script',
  aliases: ['Xiaoju'],
  summary: 'Script candidate without portrait',
  occurrenceCount: 3,
  defaultBindingRoles: ['reference'],
  missingRepresentationKinds: ['portrait'],
  visualDraftCount: 1,
  syncSuggestionCount: 1,
  freshness: 'fresh',
  actions: [
    { id: 'show-detail', label: 'Show detail' },
    { id: 'bind-existing', label: 'Bind asset' },
  ],
  searchText: '小橘 Xiaoju portrait',
};

const detail: DashboardCreativeEntityDetail = {
  ref,
  label: '小橘',
  kind: 'character',
  status: 'candidate',
  sourceKind: 'script',
  aliases: ['Xiaoju'],
  description: 'Script candidate',
  relationships: [
    {
      from: 'char-xiaoju',
      to: 'asset-ref-1',
      type: 'depicts-character',
      strength: 'medium',
      provenance: 'matcher',
      confidence: 0.8,
    },
  ],
  occurrences: [
    {
      source: 'script',
      role: 'reference',
      label: '小橘',
      location: 'story/test.fountain',
    },
  ],
  bindings: [
    {
      id: 'binding-1',
      role: 'reference',
      assetRef: 'project://assets/cat-ref',
      status: 'confirmed',
      availability: 'active',
      source: 'user',
      isDefault: true,
      confidence: 0.9,
      updatedAt: '2026-05-18T00:00:00.000Z',
    },
  ],
  defaults: [
    {
      id: 'binding-1',
      role: 'reference',
      assetRef: 'project://assets/cat-ref',
      status: 'confirmed',
      availability: 'active',
      source: 'user',
      isDefault: true,
      confidence: 0.9,
      updatedAt: '2026-05-18T00:00:00.000Z',
    },
  ],
  requirements: [
    {
      id: 'req-1',
      entityId: 'char-xiaoju',
      entityKind: 'character',
      source: 'story',
      sourceRef: 'story/test.fountain',
      requiredKinds: ['portrait'],
      status: 'missing',
      actions: ['generate', 'bind-existing', 'dismiss'],
    },
  ],
  visualDrafts: [
    {
      id: 'draft-1',
      characterId: 'char-xiaoju',
      source: 'agent',
      prompt: 'orange cat portrait',
      generatedAssetIds: ['gen-1'],
      selectedAssetId: 'gen-1',
      status: 'selected',
      factCount: 2,
    },
  ],
  syncSuggestions: [
    {
      id: 'sync-1',
      kind: 'asset-metadata',
      status: 'suggested',
      entityRef: ref,
      targetRef: 'project://assets/cat-ref',
      fields: ['tags', 'description'],
      reason: 'Asset metadata does not mention 小橘',
      ownerSource: 'neko-story',
    },
  ],
  memoryReviews: [
    {
      reviewId: 'review-obs-1',
      contributionId: 'contribution-page-1',
      observationId: 'obs-1',
      entityRef: ref,
      sourcePackage: 'neko-agent',
      sourceLabel: 'Comic OCR',
      sourceKind: 'comic',
      reviewPolicy: 'requires-user-review',
      reviewStatus: 'needs-review',
      dimensions: ['appearance', 'voice'],
      summary: '小橘 is wearing an orange jacket.',
      evidenceText: 'panel P11',
      confidence: 0.82,
      actions: ['accept-memory-review', 'reject-memory-review', 'mark-memory-conflict'],
    },
  ],
  freshness: 'fresh',
  actions: [{ id: 'refresh', label: 'Refresh' }],
};

describe('dashboard creative entity contracts', () => {
  it('accepts valid refs, rows, details, and snapshots', () => {
    expect(isDashboardCreativeEntityRef(ref)).toBe(true);
    expect(toDashboardCreativeEntityId(ref)).toBe('entity:character:char-xiaoju');
    expect(isDashboardCreativeEntityRow(row)).toBe(true);
    expect(isDashboardCreativeEntityDetail(detail)).toBe(true);
    expect(isDashboardEntityMemoryReviewItem(detail.memoryReviews?.[0])).toBe(true);
    expect(isDashboardCreativeEntityState({ statuses: [], rows: [row], detail })).toBe(true);
    expect(
      isDashboardCreativeEntitySnapshot({
        source: 'neko-story',
        sourceDisplayName: 'Neko Story',
        status: {
          source: 'neko-story',
          sourceDisplayName: 'Neko Story',
          available: true,
          freshness: 'fresh',
          entityCount: 1,
        },
        rows: [row],
        freshness: 'fresh',
        updatedAt: '2026-05-18T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('rejects unsafe local refs and accepts stable asset refs', () => {
    expect(isSafeDashboardEntityRef('/tmp/story.fountain')).toBe(false);
    expect(isSafeDashboardEntityRef('file:///tmp/story.fountain')).toBe(false);
    expect(isSafeDashboardEntityRef('../story.fountain')).toBe(false);
    expect(isSafeDashboardEntityRef('story/test.fountain')).toBe(true);
    expect(isSafeDashboardEntityRef('story://demo#10')).toBe(true);
    expect(isSafeDashboardEntityRef('story://.neko/.cache/entity.json')).toBe(false);
    expect(isSafeDashboardEntityRef('${workspaceFolder}/story/test.fountain')).toBe(true);
    expect(normalizeDashboardEntityLocalRef('story\\test.fountain')).toBe('story/test.fountain');
    expect(isSafeDashboardAssetRef('project://assets/cat-ref')).toBe(true);
    expect(isSafeDashboardAssetRef('market://pack/cat')).toBe(true);
    expect(isSafeDashboardAssetRef('generated://asset-1')).toBe(true);
    expect(isSafeDashboardAssetRef('/tmp/cat.png')).toBe(false);
  });

  it('validates binding and sync suggestion payloads', () => {
    expect(isDashboardCreativeEntityBindingSummary(detail.bindings[0])).toBe(true);
    expect(isDashboardCreativeEntitySyncSuggestion(detail.syncSuggestions[0])).toBe(true);
    expect(
      isDashboardCreativeEntitySyncSuggestion({
        ...detail.syncSuggestions[0],
        targetRef: '/tmp/cat.png',
      }),
    ).toBe(false);
  });

  it('validates action requests', () => {
    expect(DASHBOARD_CREATIVE_ENTITY_ACTIONS).toContain('character-dialogue');
    expect(DASHBOARD_CREATIVE_ENTITY_ACTIONS).toContain('embody-character');
    expect(DASHBOARD_CREATIVE_ENTITY_ACTIONS).toContain('accept-memory-review');
    expect(DASHBOARD_ENTITY_MEMORY_REVIEW_ACTIONS).toEqual([
      'accept-memory-review',
      'reject-memory-review',
      'mark-memory-conflict',
      'supersede-memory-review',
    ]);
    expect(DASHBOARD_CHARACTER_ROLE_WORKFLOW_ACTIONS).toEqual(['embody-character']);
    expect(isDashboardCreativeEntityAction('character-dialogue')).toBe(true);
    expect(isDashboardCreativeEntityAction('embody-character')).toBe(true);
    expect(isDashboardEntityMemoryReviewAction('accept-memory-review')).toBe(true);
    expect(isDashboardEntityMemoryReviewAction('confirm-candidate')).toBe(false);
    expect(isDashboardCharacterRoleWorkflowAction('embody-character')).toBe(true);
    expect(isDashboardCreativeEntityAction('test-npc')).toBe(false);
    expect(isDashboardCreativeEntityAction('character-perspective')).toBe(false);
    expect(isDashboardCreativeEntityAction('validate-character')).toBe(false);
    expect(isDashboardCreativeEntityAction('improve-character')).toBe(false);
    expect(
      isDashboardCreativeEntitySourceRequest({
        projectRoot: '/workspace/neko-test',
        contextFilePath: '/workspace/neko-test/cases/test.fountain',
      }),
    ).toBe(true);
    expect(isDashboardCreativeEntitySourceRequest({ projectRoot: '' })).toBe(false);
    expect(
      isDashboardCreativeEntityActionRequest({
        source: 'neko-story',
        ref,
        action: 'character-dialogue',
        payload: { mode: 'roleplay' },
      }),
    ).toBe(true);
    expect(
      isDashboardCreativeEntityActionRequest({
        source: 'neko-story',
        ref,
        action: 'accept-memory-review',
        memoryReviewId: 'review-obs-1',
      }),
    ).toBe(true);
    expect(
      isDashboardCreativeEntityActionRequest({
        source: 'neko-story',
        ref,
        action: 'embody-character',
        payload: {
          entityRef: ref,
          scopes: [
            {
              kind: 'occurrence',
              source: 'neko-story',
              ref: 'cases/test.fountain:8',
              label: 'Scene 1',
            },
          ],
          prompt: 'Check future knowledge leakage.',
        },
      }),
    ).toBe(true);
    expect(
      isDashboardCharacterRoleWorkflowActionPayload({
        entityRef: ref,
        scopes: [{ kind: 'story-document', source: 'neko-story', ref: 'cases/test.fountain' }],
      }),
    ).toBe(true);
    expect(
      isDashboardCharacterRoleWorkflowActionResult({
        kind: 'delegated-command',
        command: 'neko.agent.embodyCharacter',
      }),
    ).toBe(true);
    expect(
      isDashboardCreativeEntityActionRequest({
        source: 'neko-story',
        ref,
        action: 'embody-character',
        payload: {
          scopes: [{ kind: 'occurrence', source: 'neko-story', ref: '/tmp/test.fountain' }],
        },
      }),
    ).toBe(false);
    expect(
      isDashboardCreativeEntityActionRequest({
        source: 'neko-story',
        ref,
        action: 'unknown',
      }),
    ).toBe(false);
    expect(
      isDashboardEntityMemoryReviewItem({
        ...detail.memoryReviews?.[0],
        reviewStatus: 'accepted',
      }),
    ).toBe(false);
  });

  it('accepts source contracts without vscode types', () => {
    const source: DashboardCreativeEntitySource = {
      contractVersion: DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION,
      source: 'neko-story',
      sourceDisplayName: 'Neko Story',
      capabilities: {
        detail: true,
        syncSuggestions: true,
        memoryReviews: true,
        actions: ['show-detail', 'bind-existing'],
      },
      async getSnapshot() {
        return {
          source: 'neko-story',
          status: {
            source: 'neko-story',
            available: true,
            freshness: 'fresh',
            entityCount: 1,
          },
          rows: [row],
          freshness: 'fresh',
          updatedAt: '2026-05-18T00:00:00.000Z',
        };
      },
      async getDetail() {
        return detail;
      },
      async executeAction() {
        return { ok: true, refresh: true };
      },
      onDidChangeEntity() {
        return { dispose() {} };
      },
    };

    expect(DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND).toBe(
      'neko.story.getDashboardCreativeEntitySource',
    );
    expect(DASHBOARD_CREATIVE_ENTITY_STATE_COMMAND).toBe('neko.dashboard.getCreativeEntityState');
    expect(isDashboardCreativeEntitySource(source)).toBe(true);
    expect(
      isDashboardCreativeEntitySource({
        contractVersion: DASHBOARD_CREATIVE_ENTITY_CONTRACT_VERSION,
        source: 'neko-story',
        getSnapshot: async () => [],
      }),
    ).toBe(false);
  });
});
