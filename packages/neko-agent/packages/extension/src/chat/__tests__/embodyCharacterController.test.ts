import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type {
  CharacterEvidenceBundle,
  CharacterEvidenceRequest,
  CreativeEntityOccurrenceProjection,
  CreativeEntityRef,
  CreativeEntityRelationshipProjection,
  NpcAgentWorkflowRequest,
  NpcProfileFact,
  NpcProfileSource,
} from '@neko/shared';
import type { OpenTab } from '@neko-agent/types';
import { EmbodyCharacterController } from '../embodyCharacterController';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

beforeEach(() => {
  vi.mocked(vscode.commands.executeCommand).mockReset();
  vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
});

const entityRef: CreativeEntityRef = {
  entityId: 'char-xiaoju',
  entityKind: 'character',
  projectRoot: '/workspace/project-a',
  source: 'neko-entity',
};

const profile: NpcProfileSource = {
  entityRef,
  displayName: '小橘',
  aliases: ['Xiaoju'],
  facts: [
    {
      key: 'identity.name',
      value: '小橘',
      source: 'registry',
      authority: 'confirmed',
    },
  ],
  sparsity: 'partial',
};

const request: NpcAgentWorkflowRequest = {
  workflow: 'embody-character',
  entityRef,
  source: 'dashboard',
  projectRoot: '/workspace/project-a',
  prompt: 'Check knowledge boundary.',
};

const relationship: CreativeEntityRelationshipProjection = {
  from: entityRef,
  to: {
    entityId: 'char-ahui',
    entityKind: 'character',
    projectRoot: '/workspace/project-a',
    source: 'neko-story',
  },
  type: 'ally',
  source: {
    sourceId: 'neko-story',
    sourceKind: 'story',
    sourceRef: 'cases/test.fountain:8',
    providerId: 'neko-story',
  },
};

const occurrence: CreativeEntityOccurrenceProjection = {
  entityRef,
  label: '小橘',
  source: {
    sourceId: 'neko-story',
    sourceKind: 'story',
    sourceRef: 'cases/test.fountain:8',
    providerId: 'neko-story',
  },
  role: 'reference',
  location: 'cases/test.fountain:8',
};

const scriptFact: NpcProfileFact = {
  key: 'script.context.1',
  value: '小橘只知道公开线索。',
  source: 'script-extraction',
  authority: 'confirmed',
};

function createHarness(
  overrides: Partial<ConstructorParameters<typeof EmbodyCharacterController>[0]> = {},
) {
  let tabState: { openTabs: readonly OpenTab[]; activeTabId: string | null } = {
    openTabs: [],
    activeTabId: null,
  };
  const webview = vscode.createMockWebview();
  const responder = vi.fn(async ({ userMessage, config }) => ({
    content: `Feedback:${userMessage.content}`,
    classifications: ['mode-boundary' as const],
    metadata: {
      toolPolicy: config.toolPolicy.kind,
      capabilityPolicy: config.capabilityPolicy.kind,
    },
  }));
  const assembler = {
    assembleProfile: vi.fn(async () => ({ status: 'assembled' as const, profile })),
  };
  const evidenceReader = {
    listRelationships: vi.fn(async () => [relationship]),
    listOccurrences: vi.fn(async () => [occurrence]),
    listRepresentationHints: vi.fn(async () => []),
    listScriptContextFacts: vi.fn(async () => [scriptFact]),
  };
  const evidenceLoader = {
    loadEvidence: vi.fn(async (evidenceRequest: CharacterEvidenceRequest) =>
      createEvidenceBundle(evidenceRequest, []),
    ),
  };
  const updateTabState = vi.fn((openTabs: OpenTab[], activeTabId: string | null) => {
    tabState = { openTabs, activeTabId };
  });
  const controller = new EmbodyCharacterController({
    getWebview: () => webview as never,
    getProjectRoot: () => '/workspace/project-a',
    createAssembler: vi.fn(() => assembler),
    createEvidenceReader: vi.fn(() => evidenceReader),
    createEvidenceLoader: vi.fn(() => evidenceLoader),
    createResponder: vi.fn(() => responder),
    getTabState: () => tabState,
    updateTabState,
    sendTabState: vi.fn(),
    now: () => '2026-06-02T00:00:00.000Z',
    createSessionId: () => 'embody-session-1',
    logger: { warn: vi.fn(), debug: vi.fn() },
    ...overrides,
  });

  return {
    assembler,
    controller,
    evidenceReader,
    evidenceLoader,
    responder,
    tabState: () => tabState,
    updateTabState,
    webview,
  };
}

function createEvidenceBundle(
  request: CharacterEvidenceRequest,
  chunks: CharacterEvidenceBundle['chunks'],
): CharacterEvidenceBundle {
  return {
    entityRef: request.entityRef,
    mode: request.mode,
    query: request.query,
    chunks,
    omitted: [],
    freshness: 'fresh',
    budget: request.budget,
  };
}

describe('EmbodyCharacterController', () => {
  it('launches an isolated Embody Character feedback session', async () => {
    const { assembler, controller, tabState, updateTabState, webview } = createHarness();

    const result = await controller.launch(request);

    expect(result?.sessionId).toBe('embody-session-1');
    expect(assembler.assembleProfile).toHaveBeenCalledWith({ entityRef });
    expect(updateTabState).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          conversationId: 'embody-session-1',
          kind: 'embody-character',
          embodyCharacterSession: expect.objectContaining({
            sessionId: 'embody-session-1',
            displayName: '小橘',
            status: 'active',
          }),
        }),
      ],
      'tab-embody-session-1',
    );
    expect(tabState().activeTabId).toBe('tab-embody-session-1');
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'embodyCharacterSessionStarted',
        session: expect.objectContaining({ sessionId: 'embody-session-1' }),
      }),
    );
  });

  it('routes user messages through the feedback responder without ordinary Agent tools', async () => {
    const { controller, responder, webview } = createHarness();
    await controller.launch(request);

    await controller.routeUserMessage('embody-session-1', '记录今天的日记');

    expect(responder).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.objectContaining({ content: '记录今天的日记' }),
        config: expect.objectContaining({
          toolPolicy: { kind: 'none' },
          capabilityPolicy: { kind: 'character-feedback-readonly' },
        }),
        locale: 'zh-cn',
        evidenceSnapshot: expect.objectContaining({
          relationships: [relationship],
          occurrences: [occurrence],
          scriptContextFacts: expect.arrayContaining([scriptFact, profile.facts[0]]),
        }),
        turnEvidence: expect.objectContaining({
          mode: 'embody-character',
          chunks: [],
        }),
      }),
    );
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'streamText',
        conversationId: 'embody-session-1',
        content: 'Feedback:记录今天的日记',
      }),
    );
  });

  it('loads turn-scoped evidence for feedback without polluting transcript', async () => {
    const evidenceText = 'Script file: cases/late.fountain\n220: 小橘不知道幕后真相。';
    const evidenceLoader = {
      loadEvidence: vi.fn(async (evidenceRequest: CharacterEvidenceRequest) =>
        createEvidenceBundle(evidenceRequest, [
          {
            id: 'evidence-1',
            text: evidenceText,
            sourceRefs: [
              {
                id: 'source-1',
                kind: 'dashboard-detail',
                projectRelativePath: 'cases/late.fountain',
                lineStart: 220,
                lineEnd: 220,
                freshness: 'fresh',
              },
            ],
            authority: 'confirmed',
            relevance: { score: 12, signals: [] },
            freshness: 'fresh',
          },
        ]),
      ),
    };
    const responder = vi.fn(async ({ turnEvidence, userMessage, config }) => ({
      content: turnEvidence.chunks.some((chunk) => chunk.text === evidenceText)
        ? `Feedback:evidence:${userMessage.content}`
        : 'Feedback:no-evidence',
      classifications: ['confirmed' as const],
      metadata: {
        toolPolicy: config.toolPolicy.kind,
        capabilityPolicy: config.capabilityPolicy.kind,
      },
    }));
    const { controller } = createHarness({
      createEvidenceLoader: vi.fn(() => evidenceLoader),
      createResponder: vi.fn(() => responder),
    });
    await controller.launch(request);

    await controller.routeUserMessage('embody-session-1', '我知道幕后真相');
    const result = await controller.exit('embody-session-1');

    expect(evidenceLoader.loadEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        entityRef,
        mode: 'embody-character',
        query: '我知道幕后真相',
        projectRoot: '/workspace/project-a',
      }),
    );
    expect(responder).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          toolPolicy: { kind: 'none' },
          capabilityPolicy: { kind: 'character-feedback-readonly' },
        }),
        locale: 'zh-cn',
        turnEvidence: expect.objectContaining({
          chunks: [expect.objectContaining({ text: evidenceText })],
        }),
      }),
    );
    expect(result?.artifact.transcript.map((message) => message.content)).toEqual([
      '我知道幕后真相',
      'Feedback:evidence:我知道幕后真相',
    ]);
  });

  it('collects evidence through the injected read-only evidence reader port', async () => {
    const { controller, evidenceReader } = createHarness();

    await controller.launch(request);

    expect(evidenceReader.listRelationships).toHaveBeenCalledWith(entityRef);
    expect(evidenceReader.listOccurrences).toHaveBeenCalledWith(entityRef);
    expect(evidenceReader.listRepresentationHints).toHaveBeenCalledWith(entityRef);
    expect(evidenceReader.listScriptContextFacts).toHaveBeenCalledWith(entityRef);
  });

  it('launches with bounded feedback semantics when profile and evidence are thin', async () => {
    const thinProfile: NpcProfileSource = {
      ...profile,
      facts: [],
      sparsity: 'thin',
    };
    const responder = vi.fn(async ({ systemPrompt, evidenceSnapshot }) => ({
      content: `${systemPrompt}\nrelationships=${evidenceSnapshot.relationships.length}`,
      classifications: ['unknown' as const],
    }));
    const { controller, webview } = createHarness({
      createAssembler: vi.fn(() => ({
        assembleProfile: vi.fn(async () => ({
          status: 'assembled' as const,
          profile: thinProfile,
        })),
      })),
      createEvidenceReader: vi.fn(() => ({
        listRelationships: vi.fn(async () => []),
        listOccurrences: vi.fn(async () => []),
        listRepresentationHints: vi.fn(async () => []),
        listScriptContextFacts: vi.fn(async () => []),
      })),
      createResponder: vi.fn(() => responder),
    });

    await controller.launch(request);
    await controller.routeUserMessage('embody-session-1', '我知道幕后真相');

    expect(responder).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          toolPolicy: { kind: 'none' },
          capabilityPolicy: { kind: 'character-feedback-readonly' },
        }),
        locale: 'zh-cn',
        profileSnapshot: expect.objectContaining({
          facts: [],
          sparsity: 'thin',
        }),
        evidenceSnapshot: {
          relationships: [],
          occurrences: [],
          representationHints: [],
          scriptContextFacts: [],
        },
        turnEvidence: expect.objectContaining({
          mode: 'embody-character',
          chunks: [],
        }),
      }),
    );
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'streamText',
        content: expect.stringContaining('relationships=0'),
      }),
    );
  });

  it('marks the Embody Character tab exited on exit', async () => {
    const { controller, tabState, webview } = createHarness();
    await controller.launch(request);

    const result = await controller.exit('embody-session-1');

    expect(result?.artifact.transcript.map((message) => message.role)).toEqual([]);
    expect(tabState().openTabs[0]?.embodyCharacterSession?.status).toBe('exited');
    expect(webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'embodyCharacterSessionExited',
        sessionId: 'embody-session-1',
      }),
    );
  });

});
