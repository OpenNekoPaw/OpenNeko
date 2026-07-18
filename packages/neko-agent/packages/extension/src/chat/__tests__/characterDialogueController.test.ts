import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as vscode from 'vscode';
import type {
  CharacterEvidenceBundle,
  CharacterEvidenceRequest,
  CreativeEntityRef,
  NpcEvaluationReport,
  NpcEvaluationSuggestion,
  NpcProfileSource,
} from '@neko/shared';
import type { OpenTab } from '@neko-agent/types';
import {
  CharacterDialogueController,
  createDefaultCharacterProfileAssembler,
  defaultEnrichCharacterProfile,
  parseCharacterDialogueSlashArgs,
} from '../characterDialogueController';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

beforeEach(() => {
  vi.mocked(vscode.workspace.fs.createDirectory).mockClear();
  vi.mocked(vscode.workspace.fs.writeFile).mockClear();
  vi.mocked(vscode.workspace.fs.readFile).mockReset();
  vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('not found'));
  vi.mocked(vscode.commands.executeCommand).mockReset();
  vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
  vi.mocked(vscode.window.showInformationMessage).mockReset();
  vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);
  vi.mocked(vscode.window.showQuickPick).mockReset();
  vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);
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
    {
      key: 'metadata.role',
      value: 'protagonist',
      source: 'registry',
      authority: 'confirmed',
    },
  ],
  sparsity: 'partial',
};

const thinProfile: NpcProfileSource = {
  entityRef,
  displayName: '小橘',
  aliases: [],
  facts: [
    {
      key: 'identity.name',
      value: '小橘',
      source: 'registry',
      authority: 'confirmed',
    },
  ],
  sparsity: 'thin',
};

const thinProfileWithEvidence: NpcProfileSource = {
  ...thinProfile,
  dialogueSamples: ['小橘：我先看看。'],
  sceneAppearances: ['cases/test.fountain:8'],
  relationships: [
    {
      key: 'relationship.char-ahui.friend',
      value: {
        name: 'char-ahui',
        relation: 'friend',
        entityRef: {
          entityId: 'char-ahui',
          entityKind: 'character',
          projectRoot: '/workspace/project-a',
          source: 'fountain-content',
        },
      },
      source: 'relationship-graph',
      authority: 'confirmed',
      sourceRef: 'story://cases/test.fountain:8',
    },
  ],
};

const evaluation: NpcEvaluationReport = {
  version: 1,
  createdAt: '2026-06-01T00:00:00.000Z',
  entityRef,
  summary: 'consistent',
  scores: [{ dimension: 'persona-consistency', score: 1 }],
  findings: [],
  suggestions: [],
};

function createHarness(
  overrides: Partial<ConstructorParameters<typeof CharacterDialogueController>[0]> = {},
) {
  let tabState: { openTabs: readonly OpenTab[]; activeTabId: string | null } = {
    openTabs: [],
    activeTabId: null,
  };
  const webview = vscode.createMockWebview();
  const responder = vi.fn(async ({ userMessage }) => ({
    content: `NPC:${userMessage.content}`,
    metadata: { runtime: 'test' },
  }));
  const evidenceLoader = {
    loadEvidence: vi.fn(async (request: CharacterEvidenceRequest) =>
      createEvidenceBundle(request, []),
    ),
  };
  const assembler = {
    assembleProfile: vi.fn(async () => ({ status: 'assembled' as const, profile })),
  };
  const inferFacts = vi.fn(async () => []);
  const updateTabState = vi.fn((openTabs: OpenTab[], activeTabId: string | null) => {
    tabState = { openTabs, activeTabId };
  });
  const controller = new CharacterDialogueController({
    getWebview: () => webview as never,
    getProjectRoot: () => '/workspace/project-a',
    createAssembler: vi.fn(() => assembler),
    createEvidenceLoader: vi.fn(() => evidenceLoader),
    createResponder: vi.fn(() => responder),
    evaluateTranscript: vi.fn(async () => evaluation),
    enrichProfile: (input) =>
      defaultEnrichCharacterProfile({
        ...input,
        now: () => '2026-06-01T00:00:00.000Z',
        inferFacts,
      }),
    getTabState: () => tabState,
    updateTabState,
    sendTabState: vi.fn(),
    now: () => '2026-06-01T00:00:00.000Z',
    createSessionId: () => 'npc-session-1',
    createMessageId: (role, turnIndex) => `msg-${turnIndex}-${role}`,
    logger: { warn: vi.fn(), debug: vi.fn() },
    ...overrides,
  });

  return {
    assembler,
    controller,
    evidenceLoader,
    inferFacts,
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

describe('CharacterDialogueController', () => {
  it('launches roleplay from the stable Entity identity selected by Project Search', async () => {
    const resolveEntityRef = vi.fn(async () => null);
    const pickEntityRef = vi.fn(async () => null);
    const harness = createHarness({ resolveEntityRef, pickEntityRef });

    const result = await harness.controller.launchFromSlash({
      args: 'entity:char-xiaoju --roleplay --skip-enrich',
    });

    expect(result).toEqual(expect.objectContaining({ sessionId: 'npc-session-1' }));
    expect(harness.assembler.assembleProfile).toHaveBeenCalledWith({ entityRef });
    expect(resolveEntityRef).not.toHaveBeenCalled();
    expect(pickEntityRef).not.toHaveBeenCalled();
    expect(harness.webview.postMessage).not.toHaveBeenCalledWith({
      type: 'globalError',
      message: '请先选择一个项目角色，再开始角色对话。',
    });
  });

  it('fails an unresolved explicit roleplay Entity without name or picker fallback', async () => {
    const resolveEntityRef = vi.fn(async () => entityRef);
    const pickEntityRef = vi.fn(async () => entityRef);
    const assembleProfile = vi.fn(async ({ entityRef: unresolvedRef }) => ({
      status: 'missing-entity' as const,
      entityRef: unresolvedRef,
      reason: `Creative entity not found: ${unresolvedRef.entityId}`,
    }));
    const harness = createHarness({
      resolveEntityRef,
      pickEntityRef,
      createAssembler: () => ({ assembleProfile }),
    });

    await expect(
      harness.controller.launchFromSlash({
        args: 'entity:missing-character --roleplay --skip-enrich',
      }),
    ).resolves.toBeNull();

    expect(assembleProfile).toHaveBeenCalledWith({
      entityRef: {
        entityId: 'missing-character',
        entityKind: 'character',
        projectRoot: '/workspace/project-a',
        source: 'neko-entity',
      },
    });
    expect(resolveEntityRef).not.toHaveBeenCalled();
    expect(pickEntityRef).not.toHaveBeenCalled();
    expect(harness.webview.postMessage).toHaveBeenCalledWith({
      type: 'globalError',
      message: 'Creative entity not found: missing-character',
    });
    expect(harness.webview.postMessage).not.toHaveBeenCalledWith({
      type: 'globalError',
      message: '请先选择一个项目角色，再开始角色对话。',
    });
  });

  it('re-resolves and confirms a Search Candidate before launching with the returned Entity ref', async () => {
    const resolveRoleplayCandidate = vi.fn(async () => ({
      projectSearchItemId: 'entity-projection:semantic-xiaoju',
      candidateId: 'candidate:auto:character:小橘',
      name: '小橘',
      kind: 'character' as const,
      sourceRef: 'workspace:cases/test.fountain',
    }));
    const confirmRoleplayCandidate = vi.fn(async () => entityRef);
    const resolveEntityRef = vi.fn(async () => null);
    const pickEntityRef = vi.fn(async () => null);
    const harness = createHarness({
      resolveRoleplayCandidate,
      confirmRoleplayCandidate,
      resolveEntityRef,
      pickEntityRef,
    });

    const result = await harness.controller.confirmRoleplayCandidate({
      projectSearchItemId: 'entity-projection:semantic-xiaoju',
      initialUserMessage: '你好，小橘',
    });

    expect(result).toEqual(expect.objectContaining({ sessionId: 'npc-session-1' }));
    expect(resolveRoleplayCandidate).toHaveBeenCalledWith({
      projectRoot: '/workspace/project-a',
      projectSearchItemId: 'entity-projection:semantic-xiaoju',
    });
    expect(confirmRoleplayCandidate).toHaveBeenCalledWith({
      projectRoot: '/workspace/project-a',
      candidate: expect.objectContaining({
        candidateId: 'candidate:auto:character:小橘',
        name: '小橘',
        kind: 'character',
      }),
    });
    expect(harness.assembler.assembleProfile).toHaveBeenCalledWith({ entityRef });
    expect(resolveEntityRef).not.toHaveBeenCalled();
    expect(pickEntityRef).not.toHaveBeenCalled();
  });

  it('writes an explicitly selected Search Candidate through the Entity facade before launch', async () => {
    const candidate = {
      projectSearchItemId: 'entity-projection:semantic-xiaoju',
      candidateId: 'candidate:auto:character:小橘',
      name: '小橘',
      kind: 'character' as const,
      aliases: ['橘仔'],
      sourceRef: 'workspace:cases/test.fountain',
    };
    const resolveRoleplayCandidate = vi.fn(async () => candidate);
    vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
      if (command === 'neko.entity.proposeCandidate') {
        return {
          id: candidate.candidateId,
          kind: 'character',
          name: '小橘',
          aliases: ['橘仔'],
          status: 'open',
          identityBasis: 'user-named',
          provenance: [
            {
              providerId: 'neko-agent-roleplay',
              sourceKind: 'candidate',
              sourceRef: candidate.sourceRef,
            },
          ],
          sourceRefs: [candidate.sourceRef],
        };
      }
      if (command === 'neko.entity.confirmCandidate') {
        return {
          ok: true,
          action: 'confirm-candidate',
          projectRoot: '/workspace/project-a',
          affectedEntityRefs: [entityRef],
          changedRefs: [{ kind: 'entity', id: entityRef.entityId, entityRef }],
          generation: 1,
          freshness: 'fresh',
          updatedAt: '2026-06-01T00:00:00.000Z',
        };
      }
      return undefined;
    });
    const harness = createHarness({ resolveRoleplayCandidate });

    await expect(
      harness.controller.confirmRoleplayCandidate({
        projectSearchItemId: candidate.projectSearchItemId,
      }),
    ).resolves.toEqual(expect.objectContaining({ sessionId: 'npc-session-1' }));

    expect(vscode.commands.executeCommand).toHaveBeenNthCalledWith(
      1,
      'neko.entity.proposeCandidate',
      expect.objectContaining({
        projectRoot: '/workspace/project-a',
        candidate: expect.objectContaining({
          id: candidate.candidateId,
          kind: 'character',
          name: '小橘',
          metadata: expect.objectContaining({ promotionSource: 'agent-roleplay' }),
        }),
      }),
    );
    expect(
      JSON.stringify(vi.mocked(vscode.commands.executeCommand).mock.calls[0]?.[1]),
    ).not.toContain(candidate.projectSearchItemId);
    expect(vscode.commands.executeCommand).toHaveBeenNthCalledWith(
      2,
      'neko.entity.confirmCandidate',
      {
        projectRoot: '/workspace/project-a',
        candidateId: candidate.candidateId,
        kind: 'character',
      },
    );
    expect(harness.assembler.assembleProfile).toHaveBeenCalledWith({ entityRef });
  });

  it('fails visibly when a selected Candidate cannot be re-resolved and never starts dialogue', async () => {
    const harness = createHarness({ resolveRoleplayCandidate: vi.fn(async () => null) });

    await expect(
      harness.controller.confirmRoleplayCandidate({
        projectSearchItemId: 'entity-projection:stale',
      }),
    ).resolves.toBeNull();

    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'neko.entity.proposeCandidate',
      expect.anything(),
    );
    expect(harness.assembler.assembleProfile).not.toHaveBeenCalled();
    expect(harness.webview.postMessage).toHaveBeenCalledWith({
      type: 'globalError',
      message: '角色候选已失效或不再可确认，请刷新后重试。',
    });
  });

  it('launches a project-scoped Character Dialogue session with a deterministic profile projection', async () => {
    const harness = createHarness();

    const result = await harness.controller.launch({ entityRef, source: 'agent' });

    expect(result).toEqual(
      expect.objectContaining({
        sessionId: 'npc-session-1',
        session: expect.objectContaining({
          displayName: '小橘',
          projectRoot: '/workspace/project-a',
          startedAt: '2026-06-01T00:00:00.000Z',
          status: 'active',
        }),
      }),
    );
    expect(harness.assembler.assembleProfile).toHaveBeenCalledWith({ entityRef });
    expect(harness.tabState().openTabs).toEqual([
      expect.objectContaining({
        conversationId: 'npc-session-1',
        kind: 'character-dialogue',
        characterDialogueSession: expect.objectContaining({ profile }),
      }),
    ]);
    expect(harness.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'characterDialogueSessionStarted',
        session: expect.objectContaining({ sessionId: 'npc-session-1' }),
      }),
    );
  });

  it('reports unresolved entities without creating a session', async () => {
    const harness = createHarness({
      createAssembler: () => ({
        assembleProfile: vi.fn(async () => ({
          status: 'missing-entity' as const,
          entityRef,
          reason: 'Creative entity not found: char-xiaoju',
        })),
      }),
    });

    await expect(harness.controller.launch({ entityRef })).resolves.toBeNull();

    expect(harness.controller.hasSession('npc-session-1')).toBe(false);
    expect(harness.webview.postMessage).toHaveBeenCalledWith({
      type: 'globalError',
      message: 'Creative entity not found: char-xiaoju',
    });
  });

  it('routes NPC turns through session memory and webview streaming messages', async () => {
    const harness = createHarness();
    await harness.controller.launch({ entityRef });

    await expect(harness.controller.routeUserMessage('npc-session-1', 'hello')).resolves.toBe(true);

    expect(harness.responder).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'npc-session-1',
        config: expect.objectContaining({ toolPolicy: { kind: 'none' } }),
        userMessage: expect.objectContaining({ content: 'hello' }),
      }),
    );
    expect(harness.webview.postMessage).toHaveBeenCalledWith({
      type: 'thinking',
      conversationId: 'npc-session-1',
    });
    expect(harness.webview.postMessage).toHaveBeenCalledWith({
      type: 'streamText',
      conversationId: 'npc-session-1',
      messageId: 'msg-1-npc',
      content: 'NPC:hello',
    });
    expect(harness.webview.postMessage).toHaveBeenCalledWith({
      type: 'streamComplete',
      conversationId: 'npc-session-1',
      messageId: 'msg-1-npc',
    });
  });

  it('loads turn-scoped character evidence without granting tools or polluting transcript', async () => {
    const evidenceText = 'Script file: cases/late.fountain\n220: 小橘只知道公开线索。';
    const evidenceLoader = {
      loadEvidence: vi.fn(async (request: CharacterEvidenceRequest) =>
        createEvidenceBundle(request, [
          {
            id: 'evidence-1',
            text: evidenceText,
            sourceRefs: [
              {
                id: 'source-1',
                kind: 'entity-occurrence',
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
    const responder = vi.fn(async ({ turnEvidence, userMessage }) => ({
      content: turnEvidence.chunks.some((chunk) => chunk.text === evidenceText)
        ? `NPC:evidence:${userMessage.content}`
        : 'NPC:no-evidence',
    }));
    const harness = createHarness({
      createEvidenceLoader: vi.fn(() => evidenceLoader),
      createResponder: vi.fn(() => responder),
      chooseSavePolicy: vi.fn(async () => 'never'),
      evaluateTranscript: vi.fn(async () => evaluation),
    });
    await harness.controller.launch({ entityRef });

    await harness.controller.routeUserMessage('npc-session-1', '我知道什么？');
    const result = await harness.controller.exit('npc-session-1');

    expect(evidenceLoader.loadEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        entityRef,
        mode: 'character-dialogue',
        query: '我知道什么？',
        projectRoot: '/workspace/project-a',
      }),
    );
    expect(responder).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ toolPolicy: { kind: 'none' } }),
        locale: 'zh-cn',
        turnEvidence: expect.objectContaining({
          chunks: [expect.objectContaining({ text: evidenceText })],
        }),
      }),
    );
    expect(result?.artifact.transcript.map((message) => message.content)).toEqual([
      '我知道什么？',
      'NPC:evidence:我知道什么？',
    ]);
  });

  it('extracts transcript on exit and marks the Character Dialogue tab as exited', async () => {
    const harness = createHarness();
    await harness.controller.launch({ entityRef });
    await harness.controller.routeUserMessage('npc-session-1', 'hello');

    const result = await harness.controller.exit('npc-session-1');

    expect(result?.artifact).toEqual(
      expect.objectContaining({
        version: 1,
        entityRef,
        profileSnapshot: profile,
        transcript: [
          expect.objectContaining({ role: 'user', content: 'hello' }),
          expect.objectContaining({ role: 'npc', content: 'NPC:hello' }),
        ],
      }),
    );
    expect(harness.controller.hasSession('npc-session-1')).toBe(false);
    expect(harness.tabState().openTabs[0]?.characterDialogueSession?.status).toBe('exited');
    expect(harness.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'characterDialogueSessionExited',
        sessionId: 'npc-session-1',
        artifact: expect.objectContaining({ sessionId: 'npc-session-1' }),
      }),
    );
  });

  it('evaluates and saves character role artifacts under the project-local character-tests folder', async () => {
    const evaluateTranscript = vi.fn(async () => evaluation);
    const saveTranscriptArtifact = vi.fn(async ({ artifact }) => ({
      path: `.neko/character-tests/${artifact.entityRef.entityId}-2026-06-01T00-00-00-000Z.json`,
    }));
    const harness = createHarness({
      evaluateTranscript,
      chooseSavePolicy: vi.fn(async () => 'always'),
      saveTranscriptArtifact,
    });
    await harness.controller.launch({ entityRef });
    await harness.controller.routeUserMessage('npc-session-1', 'hello');

    const result = await harness.controller.exit('npc-session-1');

    expect(evaluateTranscript).toHaveBeenCalledWith({
      artifact: expect.objectContaining({
        entityRef,
        profileSnapshot: profile,
        transcript: expect.arrayContaining([expect.objectContaining({ content: 'hello' })]),
      }),
      projectRoot: '/workspace/project-a',
    });
    expect(saveTranscriptArtifact).toHaveBeenCalledWith({
      artifact: expect.objectContaining({ evaluation }),
      projectRoot: '/workspace/project-a',
    });
    expect(result?.artifact.evaluation).toEqual(evaluation);
    expect(result?.savedPath).toBe(
      '.neko/character-tests/char-xiaoju-2026-06-01T00-00-00-000Z.json',
    );
    expect(harness.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'characterDialogueSessionExited',
        savedPath: '.neko/character-tests/char-xiaoju-2026-06-01T00-00-00-000Z.json',
      }),
    );
  });

  it('uses the default project-local save path when the user keeps validation evidence', async () => {
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce('Save' as never);
    const harness = createHarness({ evaluateTranscript: vi.fn(async () => evaluation) });
    await harness.controller.launch({ entityRef });
    await harness.controller.routeUserMessage('npc-session-1', 'hello');

    const result = await harness.controller.exit('npc-session-1');

    expect(vscode.workspace.fs.createDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath: '/workspace/project-a/.neko/character-tests',
      }),
    );
    expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fsPath:
          '/workspace/project-a/.neko/character-tests/char-xiaoju-2026-06-01T00-00-00-000Z.json',
      }),
      expect.any(Buffer),
    );
    expect(result?.savedPath).toBe(
      '.neko/character-tests/char-xiaoju-2026-06-01T00-00-00-000Z.json',
    );
  });

  it('handles thin profiles with project enrichment and manual supplement before launch', async () => {
    const enrichedProfile: NpcProfileSource = {
      ...thinProfile,
      facts: [
        ...thinProfile.facts,
        {
          key: 'speech.sample',
          value: '我先看看',
          source: 'script-extraction',
          authority: 'suggested',
        },
      ],
      dialogueSamples: ['小橘：我先看看。'],
      sparsity: 'partial',
    };
    const enrichProfile = vi.fn(async () => ({ profile: enrichedProfile }));
    const harness = createHarness({
      createAssembler: () => ({
        assembleProfile: vi.fn(async () => ({
          status: 'assembled' as const,
          profile: thinProfile,
        })),
      }),
      enrichProfile,
    });

    const result = await harness.controller.launch({
      entityRef,
      enrichment: 'auto',
      source: 'agent',
    });

    expect(enrichProfile).toHaveBeenCalledWith({
      projectRoot: '/workspace/project-a',
      profile: thinProfile,
      request: expect.objectContaining({ enrichment: 'auto' }),
    });
    expect(result?.session.profile).toEqual(enrichedProfile);

    const manualHarness = createHarness({
      createAssembler: () => ({
        assembleProfile: vi.fn(async () => ({
          status: 'assembled' as const,
          profile: thinProfile,
        })),
      }),
      promptUserSupplement: vi.fn(async () => 'speaks softly'),
    });
    const manualResult = await manualHarness.controller.launch({
      entityRef,
      enrichment: 'manual',
    });

    expect(manualResult?.session.profile.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'userSupplement.notes',
          value: 'speaks softly',
          authority: 'suggested',
        }),
      ]),
    );
  });

  it('does not prompt for thin-profile enrichment unless the caller requests it', async () => {
    const chooseThinProfileAction = vi.fn(async () => 'manual-supplement' as const);
    const promptUserSupplement = vi.fn(async () => 'should not be used');
    const harness = createHarness({
      createAssembler: () => ({
        assembleProfile: vi.fn(async () => ({
          status: 'assembled' as const,
          profile: thinProfile,
        })),
      }),
      chooseThinProfileAction,
      promptUserSupplement,
    });

    const result = await harness.controller.launch({
      entityRef,
      enrichment: 'skip',
      source: 'agent',
    });

    expect(result?.session.profile).toEqual(thinProfile);
    expect(chooseThinProfileAction).not.toHaveBeenCalled();
    expect(promptUserSupplement).not.toHaveBeenCalled();
    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
  });

  it('shows localized thin profile choices for explicit ask launches', async () => {
    const harness = createHarness({
      createAssembler: () => ({
        assembleProfile: vi.fn(async () => ({
          status: 'assembled' as const,
          profile: thinProfile,
        })),
      }),
    });

    await harness.controller.launch({
      entityRef,
      enrichment: 'ask',
      source: 'slash-command',
    });

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ label: '直接开始' }),
        expect.objectContaining({ label: '提取项目证据' }),
        expect.objectContaining({ label: '手动补充' }),
      ]),
      expect.objectContaining({
        placeHolder: '小橘 的 NPC 资料较少。',
      }),
    );
  });

  it('uses the semantic project evidence enrichment port', async () => {
    const harness = createHarness({
      createAssembler: () => ({
        assembleProfile: vi.fn(async () => ({
          status: 'assembled' as const,
          profile: thinProfileWithEvidence,
        })),
      }),
    });

    const result = await harness.controller.launch({
      entityRef,
      enrichment: 'auto',
      source: 'agent',
    });

    expect(result?.session.profile.sparsity).toBe('partial');
    expect(result?.session.profile.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'dialogue.sample',
          value: '小橘：我先看看。',
          source: 'script-extraction',
          authority: 'suggested',
        }),
        expect.objectContaining({
          key: 'occurrence.sceneAppearance',
          value: 'cases/test.fountain:8',
          source: 'script-extraction',
          authority: 'suggested',
        }),
        expect.objectContaining({
          key: 'relationship.suggested.char-ahui.friend',
          value: {
            name: 'char-ahui',
            relation: 'friend',
            entityRef: {
              entityId: 'char-ahui',
              entityKind: 'character',
              projectRoot: '/workspace/project-a',
              source: 'fountain-content',
            },
          },
          source: 'relationship-graph',
          authority: 'suggested',
        }),
      ]),
    );
  });

  it('keeps AI-enriched profile facts suggested and tool-free', async () => {
    const inferFacts = vi.fn(async () => [
      {
        key: 'agent.speechPattern',
        value: 'short cautious replies',
        source: 'agent-inferred' as const,
        authority: 'suggested' as const,
        confidence: 0.78,
      },
    ]);

    const result = await defaultEnrichCharacterProfile({
      projectRoot: '/workspace/project-a',
      profile: thinProfileWithEvidence,
      request: { entityRef, enrichment: 'auto' },
      inferFacts,
      now: () => '2026-06-01T00:00:00.000Z',
    });

    expect(inferFacts).toHaveBeenCalledWith(thinProfileWithEvidence, '2026-06-01T00:00:00.000Z');
    expect(result.profile.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'agent.speechPattern',
          value: 'short cautious replies',
          source: 'agent-inferred',
          authority: 'suggested',
          confidence: 0.78,
        }),
      ]),
    );
  });

  it('requires explicit confirmation before applying character evaluation suggestions', async () => {
    const suggestion: NpcEvaluationSuggestion = {
      id: 'suggestion-1',
      kind: 'entity-metadata',
      status: 'suggested',
      title: 'Add speech pattern',
      rationale: 'Transcript shows a repeated phrase.',
      proposedValue: 'careful and brief',
      applyTarget: {
        kind: 'entity-metadata',
        entityRef,
        metadataKey: 'speechPattern',
      },
      authority: 'suggested',
      requiresUserConfirmation: true,
    };
    const applySuggestion = vi.fn(async () => ({ applied: true }));
    const harness = createHarness({
      confirmSuggestionApply: vi.fn(async () => false),
      applySuggestion,
    });

    await expect(harness.controller.applyEvaluationSuggestion({ suggestion })).resolves.toEqual({
      applied: false,
      message: 'Character suggestion was not confirmed.',
    });
    expect(applySuggestion).not.toHaveBeenCalled();

    const confirmedHarness = createHarness({
      confirmSuggestionApply: vi.fn(async () => true),
      applySuggestion,
    });
    await expect(
      confirmedHarness.controller.applyEvaluationSuggestion({ suggestion }),
    ).resolves.toEqual({ applied: true });
    expect(applySuggestion).toHaveBeenCalledWith({
      suggestion,
      projectRoot: '/workspace/project-a',
    });
  });

  it('cancels active Character Dialogue sessions without touching ordinary conversations', async () => {
    const harness = createHarness({
      createResponder:
        () =>
        async ({ signal }) =>
          await new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')));
          }),
    });
    await harness.controller.launch({ entityRef });

    const pending = harness.controller.routeUserMessage('npc-session-1', 'wait');
    expect(harness.controller.cancel('npc-session-1')).toBe(true);
    await pending;

    expect(harness.webview.postMessage).toHaveBeenCalledWith({
      type: 'error',
      conversationId: 'npc-session-1',
      message: 'aborted',
    });
  });

  it('launches from /as args with mention resolution, consult mode, enrichment, and initial message', async () => {
    const resolvedRef: CreativeEntityRef = {
      entityId: 'char-resolved',
      entityKind: 'character',
      projectRoot: '/workspace/project-a',
    };
    const harness = createHarness({
      resolveEntityRef: vi.fn(async () => resolvedRef),
    });

    await harness.controller.launchFromSlash({
      args: '@小橘 --consult --enrichment auto 你好',
      conversationId: 'conv-1',
    });

    expect(harness.assembler.assembleProfile).toHaveBeenCalledWith({
      entityRef: { ...resolvedRef, source: 'neko-entity' },
    });
    expect(harness.responder).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'consult',
        userMessage: expect.objectContaining({ content: '你好' }),
      }),
    );
  });

  it('uses the project-scoped picker fallback when /as has no entity token', async () => {
    const pickEntityRef = vi.fn(async () => entityRef);
    const harness = createHarness({ pickEntityRef });

    await harness.controller.launchFromSlash({ args: '--skip-enrich' });

    expect(pickEntityRef).toHaveBeenCalledWith({ projectRoot: '/workspace/project-a' });
    expect(harness.controller.hasSession('npc-session-1')).toBe(true);
  });

  it('resolves /as mentions only from confirmed canonical Entity facts', async () => {
    const projectRoot = await createConfirmedCharacterProject();
    try {
      const harness = createHarness({ getProjectRoot: () => projectRoot });

      await harness.controller.launchFromSlash({ args: '@小橘 --skip-enrich' });

      expect(harness.assembler.assembleProfile).toHaveBeenCalledWith({
        entityRef: {
          entityId: 'char-xiaoju',
          entityKind: 'character',
          projectRoot,
          source: 'neko-entity',
        },
      });
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('offers confirmed canonical characters in the default /as picker', async () => {
    const projectRoot = await createConfirmedCharacterProject();
    vi.mocked(vscode.window.showQuickPick).mockImplementation(async (items) => {
      const options = Array.isArray(items) ? items : [];
      return options.find((item) => item.label === '小橘');
    });
    try {
      const harness = createHarness({ getProjectRoot: () => projectRoot });

      await harness.controller.launchFromSlash({ args: '--skip-enrich' });

      expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            label: '小橘',
            ref: expect.objectContaining({
              entityId: 'char-xiaoju',
              source: 'neko-entity',
            }),
          }),
        ],
        expect.objectContaining({ placeHolder: '选择要对话测试的项目角色' }),
      );
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('assembles profile facts from the canonical Entity registry without source fallback', async () => {
    const projectRoot = await createConfirmedCharacterProject();
    try {
      const assembler = createDefaultCharacterProfileAssembler(projectRoot);
      const result = await assembler.assembleProfile({
        entityRef: { ...entityRef, projectRoot },
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: 'assembled',
          profile: expect.objectContaining({
            displayName: '小橘',
            aliases: ['Xiaoju'],
            facts: expect.arrayContaining([
              expect.objectContaining({
                key: 'metadata.role',
                value: 'detective',
                source: 'registry',
                authority: 'confirmed',
              }),
            ]),
          }),
        }),
      );
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  it('parses slash args without treating allowed tools as a Character Dialogue capability', () => {
    expect(parseCharacterDialogueSlashArgs('@小橘 --consult --manual hi there')).toEqual({
      entityToken: '@小橘',
      mode: 'consult',
      enrichment: 'manual',
      initialUserMessage: 'hi there',
    });
  });
});

async function createConfirmedCharacterProject(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'neko-npc-profile-'));
  await writeFile(
    path.join(projectRoot, 'characters.json'),
    `${JSON.stringify(
      {
        version: 1,
        characters: [
          {
            id: 'char-xiaoju',
            canonicalName: '小橘',
            aliases: ['Xiaoju'],
            status: 'confirmed',
            metadata: { role: 'detective' },
          },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return projectRoot;
}
