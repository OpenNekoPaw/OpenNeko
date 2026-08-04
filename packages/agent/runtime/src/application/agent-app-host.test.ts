import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createAssistantMessageEventStream,
  createModels,
  createProvider,
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from '@earendil-works/pi-ai';
import {
  NodePiConversationCatalogReader,
  resolveAgentModelPolicy,
  type PiProductAgentEvent,
} from '@neko/agent-runtime/pi';
import {
  EFFECTIVE_AGENT_CONFIG_DIMENSIONS,
  type Tool,
  type EffectiveAgentConfigurationProjection,
} from '@neko/agent-contracts';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createAgentAppHost,
  projectAgentHomeConversationSummary,
  type AgentAppHost,
  type AgentTurnConfigurationSnapshot,
} from '@neko/agent-runtime/application';
import { createAgentCredentialRuntime } from '@neko/agent-runtime/pi';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import type { AgentExtensionCatalogSnapshot } from '@neko/agent-contracts';

const MODEL: Model<'openai-completions'> = {
  id: 'main',
  name: 'Main',
  api: 'openai-completions',
  provider: 'fixture',
  baseUrl: 'https://fixture.invalid/v1',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8_192,
  maxTokens: 2_048,
};

describe('AgentAppHost', () => {
  const roots: string[] = [];
  const compositions: AgentAppHost[] = [];

  afterEach(async () => {
    await Promise.allSettled(compositions.splice(0).map((composition) => composition.dispose()));
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('runs the canonical Pi Session, Skill, projection and terminal checkpoint path', async () => {
    const fixture = await createFixture();
    const prompts: string[] = [];
    const models = createFixtureModels((_model, context) => {
      prompts.push(lastUserPrompt(context));
      return completedStream(assistant('completed by Pi'));
    });
    const policy = fixturePolicy();
    const workspace = await fixture.composition.attachWorkspace(fixture.workspace);
    const protectedSecret = 'must-not-enter-pi-storage';
    await fixture.composition.credentialRuntime.credentials.replace(
      'fixture',
      { type: 'api_key', key: protectedSecret },
      'interactive',
    );
    workspace.tools.register(fixtureTool());
    expect(await fixture.composition.attachWorkspace(fixture.workspace)).toBe(workspace);
    expect(workspace.tools.list().map((tool) => tool.name)).toEqual([
      'ReadDocument',
      'ReadImage',
      'DesktopFixtureTool',
    ]);
    await workspace.openConversation({
      conversationId: 'conversation-1',
      models,
      initialModelPolicy: policy,
      baseSystemPrompt: 'Desktop Agent fixture',
    });
    const evidence = workspace.readConversationEvidence('conversation-1');
    const observedEvents: PiProductAgentEvent[] = [];

    const first = await workspace.executeTurn({
      conversationId: 'conversation-1',
      prompt: 'hello',
      contextPayloads: [
        {
          type: 'cut-clip',
          id: 'cut:projects/cut/demo.otio:track:video-1:clip:clip-1:r7',
          label: 'Opening shot',
          summary: 'Video Clip “Opening shot” at 0.000s–3.000s.',
          data: {
            schemaVersion: 1,
            kind: 'cut-clip-selection',
            document: {
              locator: { kind: 'workspace-file', path: 'projects/cut/demo.otio' },
              sessionId: 'cut-session-1',
              revision: 7,
            },
          },
        },
      ],
      modelPolicy: policy,
      configuration: fixtureConfiguration(),
      permissionPolicy: allowTools(),
      workspaceTrusted: true,
      locale: 'en',
      events: {
        emit: (event) => {
          observedEvents.push(event);
        },
      },
    });
    const skill = await workspace.executeTurn({
      conversationId: 'conversation-1',
      prompt: 'ignored for explicit Skill',
      skillName: 'desktop-fixture',
      modelPolicy: policy,
      configuration: fixtureConfiguration(),
      permissionPolicy: allowTools(),
      workspaceTrusted: true,
      locale: 'en',
    });

    expect(evidence).toMatchObject({
      workspaceId: fixture.workspace.workspaceId,
      conversationId: 'conversation-1',
      branchId: 'main',
      writerEpoch: 1,
    });
    expect(evidence.piSessionId).toBeTruthy();
    expect(first.path).toEqual({
      runtime: 'pi-conversation-runtime',
      transcript: 'pi-session',
      metadata: 'sqlite',
      projection: 'conversation-projection-store',
    });
    expect(first.durability).toBe('durable');
    expect(first.configuration).toEqual(fixtureConfiguration());
    expect(Object.isFrozen(first.configuration)).toBe(true);
    expect(skill.durability).toBe('durable');
    expect(first.projection.turns[0]?.items).toContainEqual(
      expect.objectContaining({
        kind: 'assistant_text',
        payload: expect.objectContaining({ content: 'completed by Pi' }),
      }),
    );
    expect(skill.projection.turns).toHaveLength(2);
    expect(prompts).toEqual([
      expect.stringMatching(
        /^hello\n\n--- Attached Context ---\n\n\[Context: Opening shot\]\nVideo Clip “Opening shot” at 0\.000s–3\.000s\.$/,
      ),
      expect.stringContaining('Desktop composition Skill body'),
    ]);
    expect(observedEvents.map((event) => event.type)).toContain('turn.persistence');
    expect(JSON.stringify(first)).not.toContain(fixture.workspace.workspacePath);
    await expect(stat(join(fixture.userDataRoot, 'neko.db'))).resolves.toMatchObject({
      size: expect.any(Number),
    });
    const sessions = await readdir(join(fixture.userDataRoot, 'agent', 'pi', 'sessions'), {
      recursive: true,
    });
    expect(sessions.some((entry) => entry.endsWith('.jsonl'))).toBe(true);
    const piStorage = [
      await readFile(join(fixture.userDataRoot, 'neko.db')),
      ...(await Promise.all(
        sessions
          .filter((entry) => entry.endsWith('.jsonl'))
          .map((entry) => readFile(join(fixture.userDataRoot, 'agent', 'pi', 'sessions', entry))),
      )),
    ];
    expect(piStorage.every((content) => !content.includes(protectedSecret))).toBe(true);
  });

  it('checkpoints the exact initial user message when execution fails before Pi starts', async () => {
    const fixture = await createFixture();
    const workspace = await fixture.composition.attachWorkspace(fixture.workspace);
    await workspace.createConversation('conversation-preflight-failed');
    await workspace.checkpointFailedInitialTurn({
      conversationId: 'conversation-preflight-failed',
      turnId: 'turn-preflight-failed',
      messageText: 'retain the locally committed prompt',
    });
    await workspace.checkpointFailedInitialTurn({
      conversationId: 'conversation-preflight-failed',
      turnId: 'turn-preflight-failed',
      messageText: 'retain the locally committed prompt',
    });

    expect(
      (await workspace.readConversationEntries('conversation-preflight-failed'))
        .filter((entry) => entry.type === 'message')
        .map((entry) => entry.message),
    ).toMatchObject([
      {
        role: 'user',
        content: 'retain the locally committed prompt',
      },
    ]);
  });

  it('discovers project, personal and builtin Skills through one sanitized catalog path', async () => {
    const fixture = await createFixture();
    const builtinSkillRoot = join(fixture.root, 'builtin-skills');
    await writeSkill(builtinSkillRoot, 'desktop-fixture', 'Builtin shadowed fixture');
    await writeSkill(builtinSkillRoot, 'builtin-only', 'Builtin-only fixture');
    await writeSkill(
      join(fixture.userHome, '.agents', 'skills'),
      'personal-only',
      'Personal fixture',
    );
    await mkdir(join(fixture.workspace.workspacePath, '.agents', 'skills', 'broken'), {
      recursive: true,
    });
    await writeFile(
      join(fixture.workspace.workspacePath, '.agents', 'skills', 'broken', 'SKILL.md'),
      '---\nname: broken\n---\nMissing description\n',
      'utf8',
    );
    const userDataRoot = join(fixture.root, 'catalog-data');
    const composition = createAgentAppHost({
      userDataRoot,
      userHome: fixture.userHome,
      hostId: 'desktop-catalog-host',
      credentialRuntime: createTestCredentialRuntime(),
      catalogReader: await NodePiConversationCatalogReader.create({ userDataRoot }),
      builtinSkillRoot,
    });
    compositions.push(composition);
    const workspace = await composition.attachWorkspace(fixture.workspace);

    const catalog = await workspace.readSkillCatalog(true);

    expect(catalog.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'desktop-fixture', source: { kind: 'project' } }),
        expect.objectContaining({ name: 'personal-only', source: { kind: 'personal' } }),
        expect.objectContaining({ name: 'builtin-only', source: { kind: 'builtin' } }),
      ]),
    );
    expect(catalog.warnings).toContainEqual({
      code: 'duplicate-skill',
      skillName: 'desktop-fixture',
      selectedSource: 'project',
      shadowedSource: 'builtin',
    });
    expect(catalog.diagnostics).toContainEqual({
      code: 'invalid_metadata',
      source: 'project',
    });
    expect(JSON.stringify(catalog)).not.toContain(fixture.workspace.workspacePath);
  });

  it('discovers the global Skill catalog without attaching or reading a Project root', async () => {
    const fixture = await createFixture();
    const builtinSkillRoot = join(fixture.root, 'global-builtin-skills');
    await writeSkill(builtinSkillRoot, 'shared-skill', 'Builtin shadowed fixture');
    await writeSkill(builtinSkillRoot, 'builtin-only', 'Builtin-only fixture');
    await writeSkill(
      join(fixture.userHome, '.agents', 'skills'),
      'shared-skill',
      'Personal selected fixture',
    );
    const userDataRoot = join(fixture.root, 'global-catalog-data');
    const composition = createAgentAppHost({
      userDataRoot,
      userHome: fixture.userHome,
      hostId: 'desktop-global-catalog-host',
      credentialRuntime: createTestCredentialRuntime(),
      catalogReader: await NodePiConversationCatalogReader.create({ userDataRoot }),
      builtinSkillRoot,
    });
    compositions.push(composition);

    const catalog = await composition.readGlobalSkillCatalog();

    expect(catalog.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'shared-skill', source: { kind: 'personal' } }),
        expect.objectContaining({ name: 'builtin-only', source: { kind: 'builtin' } }),
      ]),
    );
    expect(catalog.records.every((record) => record.source.kind !== 'project')).toBe(true);
    expect(catalog.records.map((record) => record.name)).not.toContain('desktop-fixture');
    expect(catalog.warnings).toContainEqual({
      code: 'duplicate-skill',
      skillName: 'shared-skill',
      selectedSource: 'personal',
      shadowedSource: 'builtin',
    });
    expect(composition.getWorkspace(fixture.workspace.workspaceId)).toBeUndefined();
  });

  it('fails visibly when a configured builtin Skill root is missing', async () => {
    const fixture = await createFixture();
    const userDataRoot = join(fixture.root, 'missing-data');
    const composition = createAgentAppHost({
      userDataRoot,
      userHome: fixture.userHome,
      hostId: 'desktop-missing-builtin-host',
      credentialRuntime: createTestCredentialRuntime(),
      catalogReader: await NodePiConversationCatalogReader.create({ userDataRoot }),
      builtinSkillRoot: join(fixture.root, 'missing-builtin-skills'),
    });
    compositions.push(composition);
    const workspace = await composition.attachWorkspace(fixture.workspace);

    await expect(workspace.readSkillCatalog(true)).rejects.toThrow(
      'Desktop builtin Skill root is unavailable',
    );
  });

  it('isolates conversation runtime and projection owners within one workspace', async () => {
    const fixture = await createFixture();
    const models = createFixtureModels((_model, context) =>
      completedStream(assistant(`reply:${lastUserPrompt(context)}`)),
    );
    const policy = fixturePolicy();
    const workspace = await fixture.composition.attachWorkspace(fixture.workspace);
    await Promise.all(
      ['conversation-a', 'conversation-b'].map((conversationId) =>
        workspace.openConversation({
          conversationId,
          models,
          initialModelPolicy: policy,
          baseSystemPrompt: 'Desktop Agent fixture',
        }),
      ),
    );

    await workspace.executeTurn({
      conversationId: 'conversation-a',
      prompt: 'alpha',
      modelPolicy: policy,
      configuration: fixtureConfiguration(),
      permissionPolicy: allowTools(),
      workspaceTrusted: true,
      locale: 'en',
    });
    await workspace.executeTurn({
      conversationId: 'conversation-b',
      prompt: 'beta',
      modelPolicy: policy,
      configuration: fixtureConfiguration(),
      permissionPolicy: allowTools(),
      workspaceTrusted: true,
      locale: 'en',
    });

    expect(
      workspace
        .listConversations()
        .map((record) => record.conversationId)
        .sort(),
    ).toEqual(['conversation-a', 'conversation-b']);
    expect(JSON.stringify(workspace.readConversationProjection('conversation-a'))).toContain(
      'reply:alpha',
    );
    expect(JSON.stringify(workspace.readConversationProjection('conversation-a'))).not.toContain(
      'reply:beta',
    );
    expect(JSON.stringify(workspace.readConversationProjection('conversation-b'))).toContain(
      'reply:beta',
    );
    expect(workspace.readConversationEvidence('conversation-a').piSessionId).not.toBe(
      workspace.readConversationEvidence('conversation-b').piSessionId,
    );
    const home = fixture.composition.readHomeProjection();
    expect(home.conversations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          navigation: {
            conversationId: 'conversation-a',
            owner: {
              kind: 'workspace',
              workspaceId: fixture.workspace.workspaceId,
            },
          },
          attention: 'none',
          lastActivity: expect.objectContaining({ kind: 'turn-completed' }),
        }),
      ]),
    );
    expect(home.attention).toEqual({ needsInput: 0, needsReview: 0, running: 0 });
    expect(JSON.stringify(home)).not.toContain('reply:alpha');
    expect(JSON.stringify(home)).not.toContain(fixture.workspace.workspacePath);
  });

  it('projects scoped persisted conversations before a workspace runtime is attached', async () => {
    const fixture = await createFixture();
    const workspace = await fixture.composition.attachWorkspace(fixture.workspace);
    await workspace.createConversation('conversation-cold-start');
    await fixture.composition.dispose();
    compositions.splice(compositions.indexOf(fixture.composition), 1);

    const restored = await createComposition(fixture, 'desktop-host-cold-start');
    compositions.push(restored);

    expect(restored.getWorkspace(fixture.workspace.workspaceId)).toBeUndefined();
    expect(restored.readHomeProjection()).toMatchObject({
      conversations: [
        {
          navigation: {
            conversationId: 'conversation-cold-start',
            owner: {
              kind: 'workspace',
              workspaceId: fixture.workspace.workspaceId,
            },
          },
          attention: 'none',
        },
      ],
    });
    restored.setHomeWorkspaceScope([]);
    expect(restored.readHomeProjection().conversations).toEqual([]);
  });

  it('idempotently materializes one exact conversation for lifecycle replay', async () => {
    const fixture = await createFixture();
    const workspace = await fixture.composition.attachWorkspace(fixture.workspace);

    await Promise.all([
      workspace.ensureConversation('conversation-materialized'),
      workspace.ensureConversation('conversation-materialized'),
    ]);
    await workspace.ensureConversation('conversation-materialized');

    expect(
      workspace
        .listConversations()
        .filter((record) => record.conversationId === 'conversation-materialized'),
    ).toHaveLength(1);
    expect(workspace.readConversationProjection('conversation-materialized')).toMatchObject({
      conversationId: 'conversation-materialized',
    });
    await expect(workspace.createConversation('conversation-materialized')).rejects.toMatchObject({
      code: 'conversation-exists',
    });
  });

  it('retains immutable Assistant conversations while Project Home scope changes', async () => {
    const fixture = await createFixture();
    const assistantSpaceId = 'assistant-space:local-user';
    const observedScopes: string[][] = [];
    const conversations = [
      {
        workspaceId: assistantSpaceId,
        conversationId: 'conversation-assistant',
        title: 'Assistant conversation',
        activeBranchId: 'main',
        createdAt: '2026-08-04T00:00:00.000Z',
        updatedAt: '2026-08-04T00:02:00.000Z',
      },
      {
        workspaceId: fixture.workspace.workspaceId,
        conversationId: 'conversation-project',
        title: 'Project conversation',
        activeBranchId: 'main',
        createdAt: '2026-08-04T00:00:00.000Z',
        updatedAt: '2026-08-04T00:01:00.000Z',
      },
    ] as const;
    const composition = createAgentAppHost({
      userDataRoot: fixture.userDataRoot,
      userHome: fixture.userHome,
      hostId: 'desktop-host-assistant-home-scope',
      credentialRuntime: createTestCredentialRuntime(),
      catalogReader: {
        listConversations: (workspaceIds) => {
          observedScopes.push([...workspaceIds]);
          return conversations.filter((record) => workspaceIds.includes(record.workspaceId));
        },
        findConversation: (conversationId) =>
          conversations.find((record) => record.conversationId === conversationId),
        dispose: () => undefined,
      },
      homeConversationWorkspaceIds: [assistantSpaceId],
    });
    compositions.push(composition);

    composition.setHomeWorkspaceScope([fixture.workspace.workspaceId, assistantSpaceId]);
    expect(
      composition
        .readHomeProjection()
        .conversations.map((conversation) => conversation.navigation.conversationId),
    ).toEqual(['conversation-assistant', 'conversation-project']);
    expect(observedScopes.at(-1)).toEqual([fixture.workspace.workspaceId, assistantSpaceId]);

    composition.setHomeWorkspaceScope([]);
    expect(
      composition
        .readHomeProjection()
        .conversations.map((conversation) => conversation.navigation.conversationId),
    ).toEqual(['conversation-assistant']);
    expect(observedScopes.at(-1)).toEqual([assistantSpaceId]);
  });

  it('fails visibly when the persisted Home catalog cannot be read', async () => {
    const fixture = await createFixture();
    const composition = createAgentAppHost({
      userDataRoot: fixture.userDataRoot,
      userHome: fixture.userHome,
      hostId: 'desktop-host-failed-catalog',
      credentialRuntime: createTestCredentialRuntime(),
      catalogReader: {
        listConversations: () => {
          throw new Error('catalog fixture failed');
        },
        findConversation: () => undefined,
        dispose: () => undefined,
      },
    });
    composition.setHomeWorkspaceScope([fixture.workspace.workspaceId]);
    compositions.push(composition);

    expect(() => composition.readHomeProjection()).toThrow('catalog fixture failed');
  });

  it('reports no active turn for a durable conversation that has not opened a Pi runtime', async () => {
    const fixture = await createFixture();
    const workspace = await fixture.composition.attachWorkspace(fixture.workspace);
    await workspace.createConversation('conversation-cold');

    expect(workspace.readActiveTurn('conversation-cold')).toBeUndefined();
    await expect(
      Promise.resolve().then(() => workspace.readContextTokenCount('conversation-cold')),
    ).resolves.toBe(0);
    expect(() => workspace.readActiveTurn('conversation-missing')).toThrow(
      "conversation 'conversation-missing' does not exist",
    );
  });

  it('projects active-run Attention from the conversation owner without copying Timeline state', async () => {
    const fixture = await createFixture();
    const stream = createAssistantMessageEventStream();
    const models = createFixtureModels(() => stream);
    const policy = fixturePolicy();
    const workspace = await fixture.composition.attachWorkspace(fixture.workspace);
    await workspace.openConversation({
      conversationId: 'conversation-running',
      models,
      initialModelPolicy: policy,
      baseSystemPrompt: 'Desktop Agent fixture',
    });
    const runningProjection = new Promise<void>((resolve) => {
      const unsubscribe = fixture.composition.subscribeHomeProjection(() => {
        if (fixture.composition.readHomeProjection().attention.running === 1) {
          unsubscribe();
          resolve();
        }
      });
    });

    const operation = workspace.executeTurn({
      conversationId: 'conversation-running',
      prompt: 'stay active',
      modelPolicy: policy,
      configuration: fixtureConfiguration(),
      permissionPolicy: allowTools(),
      workspaceTrusted: true,
      locale: 'en',
    });
    await runningProjection;

    expect(fixture.composition.readHomeProjection()).toMatchObject({
      attention: { needsInput: 0, needsReview: 0, running: 1 },
      conversations: [
        {
          attention: 'running',
          lastActivity: {
            kind: 'turn-running',
          },
        },
      ],
    });
    const message = assistant('finished');
    stream.push({ type: 'start', partial: message });
    stream.push({ type: 'done', reason: 'stop', message });
    await operation;
    expect(fixture.composition.readHomeProjection().attention.running).toBe(0);
  });

  it('projects an immutable GenerationJob link/status without creating a Desktop Job owner', () => {
    const summary = projectAgentHomeConversationSummary(
      {
        workspaceId: 'workspace-1',
        conversationId: 'conversation-generation',
        title: 'Generation',
        activeBranchId: 'main',
        createdAt: '2026-07-28T00:00:00.000Z',
        updatedAt: '2026-07-28T00:01:00.000Z',
      },
      { kind: 'workspace', workspaceId: 'workspace-1' },
      {
        conversationId: 'conversation-generation',
        projectionVersion: 1,
        turns: [
          {
            turnId: 'turn-1',
            runId: 'run-1',
            messageId: 'message-1',
            items: [
              {
                conversationId: 'conversation-generation',
                turnId: 'turn-1',
                runId: 'run-1',
                messageId: 'message-1',
                itemId: 'tool-generation-1',
                sequence: 1,
                itemRevision: 2,
                kind: 'tool_call',
                status: 'succeeded',
                payload: {
                  toolCall: {
                    id: 'tool-call-1',
                    name: 'GenerateImage',
                    arguments: {},
                    result: {
                      success: true,
                      data: {
                        generationJob: {
                          kind: 'generation-job',
                          jobId: 'generation-1',
                          revision: 4,
                          phase: 'succeeded',
                        },
                      },
                    },
                  },
                },
                createdAt: 1,
                updatedAt: 2,
              },
            ],
            completion: { status: 'completed', completedAt: 3 },
          },
        ],
      },
      undefined,
    );

    expect(summary.lastActivity.generationJob).toEqual({
      jobId: 'generation-1',
      revision: 4,
      phase: 'succeeded',
    });
    expect(JSON.stringify(summary)).not.toContain('CancelGenerationJob');
  });

  it('projects Tool confirmation as needs-input Attention ahead of the active run', () => {
    const summary = projectAgentHomeConversationSummary(
      {
        workspaceId: 'workspace-1',
        conversationId: 'conversation-confirmation',
        title: 'Confirmation',
        activeBranchId: 'main',
        createdAt: '2026-07-28T00:00:00.000Z',
        updatedAt: '2026-07-28T00:01:00.000Z',
      },
      { kind: 'workspace', workspaceId: 'workspace-1' },
      {
        conversationId: 'conversation-confirmation',
        projectionVersion: 1,
        turns: [
          {
            turnId: 'turn-1',
            runId: 'run-1',
            messageId: 'message-1',
            items: [
              {
                conversationId: 'conversation-confirmation',
                turnId: 'turn-1',
                runId: 'run-1',
                messageId: 'message-1',
                itemId: 'tool-confirmation-1',
                sequence: 1,
                itemRevision: 2,
                kind: 'tool_call',
                status: 'pending',
                payload: {
                  toolCall: {
                    id: 'tool-call-1',
                    name: 'WriteDocument',
                    arguments: {},
                    pendingConfirmation: true,
                    confirmation: {
                      action: 'WriteDocument',
                      description: 'Write the document',
                      details: { confirmationId: 'confirmation-1' },
                    },
                  },
                },
                createdAt: 1,
                updatedAt: 2,
              },
            ],
          },
        ],
      },
      { turnId: 'turn-1', runId: 'run-1' },
    );

    expect(summary).toMatchObject({
      attention: 'needs-input',
      lastActivity: {
        kind: 'tool-confirmation-required',
        turnId: 'turn-1',
        runId: 'run-1',
        toolCallId: 'tool-call-1',
      },
    });
  });

  it('cancels only the explicitly identified Desktop conversation run and persists cancellation', async () => {
    const fixture = await createFixture();
    let startedResolve: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    const models = createFixtureModels((_model, _context, options) => {
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        stream.push({ type: 'start', partial: assistant('waiting') });
        startedResolve?.();
        options?.signal?.addEventListener(
          'abort',
          () => {
            stream.push({
              type: 'error',
              reason: 'aborted',
              error: { ...assistant('cancelled'), stopReason: 'aborted' },
            });
          },
          { once: true },
        );
      });
      return stream;
    });
    const workspace = await fixture.composition.attachWorkspace(fixture.workspace);
    await workspace.openConversation({
      conversationId: 'conversation-cancel',
      models,
      initialModelPolicy: fixturePolicy(),
      baseSystemPrompt: 'Desktop Agent fixture',
    });
    const operation = workspace.executeTurn({
      conversationId: 'conversation-cancel',
      prompt: 'wait',
      modelPolicy: fixturePolicy(),
      configuration: fixtureConfiguration(),
      permissionPolicy: allowTools(),
      workspaceTrusted: true,
      locale: 'en',
    });
    await started;

    expect(() =>
      workspace.cancelTurn('conversation-cancel', {
        turnId: 'identity-other',
        runId: 'identity-2',
      }),
    ).toThrow('does not own the active turn');
    workspace.cancelTurn('conversation-cancel', {
      turnId: 'identity-1',
      runId: 'identity-2',
    });
    const result = await operation;

    expect(result.durability).toBe('durable');
    expect(result.projection.turns[0]?.completion?.status).toBe('cancelled');
    expect(fixture.composition.readHomeProjection().conversations[0]?.lastActivity.kind).toBe(
      'turn-cancelled',
    );
  });

  it('restores one Pi Session across AppHost restart without duplicating the prior turn', async () => {
    const fixture = await createFixture();
    const firstModels = createFixtureModels(() => completedStream(assistant('before reply')));
    const firstWorkspace = await fixture.composition.attachWorkspace(fixture.workspace);
    await firstWorkspace.openConversation({
      conversationId: 'conversation-restart',
      models: firstModels,
      initialModelPolicy: fixturePolicy(),
      baseSystemPrompt: 'Desktop Agent fixture',
    });
    await firstWorkspace.executeTurn({
      conversationId: 'conversation-restart',
      prompt: 'before restart',
      modelPolicy: fixturePolicy(),
      configuration: fixtureConfiguration(),
      permissionPolicy: allowTools(),
      workspaceTrusted: true,
      locale: 'en',
    });
    const firstEvidence = firstWorkspace.readConversationEvidence('conversation-restart');
    await fixture.composition.dispose();

    const observedContexts: Context[] = [];
    const second = await createComposition(fixture, 'desktop-host-restarted');
    compositions.push(second);
    const secondModels = createFixtureModels((_model, context) => {
      observedContexts.push(context);
      return completedStream(assistant('after reply'));
    });
    const secondWorkspace = await second.attachWorkspace(fixture.workspace);
    await secondWorkspace.openConversation({
      conversationId: 'conversation-restart',
      models: secondModels,
      initialModelPolicy: fixturePolicy(),
      baseSystemPrompt: 'Desktop Agent fixture',
    });
    const secondEvidence = secondWorkspace.readConversationEvidence('conversation-restart');
    await secondWorkspace.executeTurn({
      conversationId: 'conversation-restart',
      prompt: 'after restart',
      modelPolicy: fixturePolicy(),
      configuration: fixtureConfiguration(),
      permissionPolicy: allowTools(),
      workspaceTrusted: true,
      locale: 'en',
    });

    expect(secondEvidence.piSessionId).toBe(firstEvidence.piSessionId);
    expect(secondEvidence.writerEpoch).toBe(1);
    expect(secondWorkspace.listConversations()).toHaveLength(1);
    expect(JSON.stringify(observedContexts)).toContain('before restart');
    expect(JSON.stringify(observedContexts).match(/before restart/g)).toHaveLength(1);
  });

  it('flushes an active cancelled turn before AppHost disposal releases its lease and projection', async () => {
    const fixture = await createFixture();
    let startedResolve: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    const models = createFixtureModels((_model, _context, options) => {
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        stream.push({ type: 'start', partial: assistant('waiting for quit') });
        startedResolve?.();
        options?.signal?.addEventListener(
          'abort',
          () => {
            stream.push({
              type: 'error',
              reason: 'aborted',
              error: { ...assistant('quit cancelled'), stopReason: 'aborted' },
            });
          },
          { once: true },
        );
      });
      return stream;
    });
    const workspace = await fixture.composition.attachWorkspace(fixture.workspace);
    await workspace.openConversation({
      conversationId: 'conversation-quit',
      models,
      initialModelPolicy: fixturePolicy(),
      baseSystemPrompt: 'Desktop Agent fixture',
    });
    const operation = workspace.executeTurn({
      conversationId: 'conversation-quit',
      prompt: 'wait for quit',
      modelPolicy: fixturePolicy(),
      configuration: fixtureConfiguration(),
      permissionPolicy: allowTools(),
      workspaceTrusted: true,
      locale: 'en',
    });
    await started;

    await fixture.composition.dispose();
    const terminal = await operation;

    expect(terminal.durability).toBe('durable');
    expect(terminal.projection.turns[0]?.completion?.status).toBe('cancelled');
    const replacement = await createComposition(fixture, 'desktop-host-after-quit');
    compositions.push(replacement);
    const replacementWorkspace = await replacement.attachWorkspace(fixture.workspace);
    await expect(
      replacementWorkspace.openConversation({
        conversationId: 'conversation-quit',
        models: createFixtureModels(() => completedStream(assistant('restored'))),
        initialModelPolicy: fixturePolicy(),
        baseSystemPrompt: 'Desktop Agent fixture',
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects a second Host while the first owns the fenced conversation lease', async () => {
    const fixture = await createFixture();
    const second = await createComposition(fixture, 'desktop-host-2');
    compositions.push(second);
    const models = createFixtureModels(() => completedStream(assistant('unused')));
    const policy = fixturePolicy();
    const firstWorkspace = await fixture.composition.attachWorkspace(fixture.workspace);
    const secondWorkspace = await second.attachWorkspace(fixture.workspace);
    await firstWorkspace.openConversation({
      conversationId: 'conversation-fenced',
      models,
      initialModelPolicy: policy,
      baseSystemPrompt: 'Desktop Agent fixture',
    });

    await expect(
      secondWorkspace.openConversation({
        conversationId: 'conversation-fenced',
        models,
        initialModelPolicy: policy,
        baseSystemPrompt: 'Desktop Agent fixture',
      }),
    ).rejects.toMatchObject({ code: 'lease-held' });
    expect(firstWorkspace.readConversationEvidence('conversation-fenced').writerEpoch).toBe(1);
  });

  it('releases owned runtime, lease, projection and SQLite handles on disposal', async () => {
    const fixture = await createFixture();
    const models = createFixtureModels(() => completedStream(assistant('unused')));
    const workspace = await fixture.composition.attachWorkspace(fixture.workspace);
    await workspace.openConversation({
      conversationId: 'conversation-dispose',
      models,
      initialModelPolicy: fixturePolicy(),
      baseSystemPrompt: 'Desktop Agent fixture',
    });

    await fixture.composition.dispose();

    expect(() => workspace.listConversations()).toThrow('disposed');
    expect(() => workspace.readConversationProjection('conversation-dispose')).toThrow('disposed');
    await expect(fixture.composition.attachWorkspace(fixture.workspace)).rejects.toThrow(
      'composition is disposed',
    );
  });

  it('registers the package-owned ContentLocator ReadImage capability for each workspace', async () => {
    const fixture = await createFixture();
    await writeFile(
      join(fixture.workspace.workspacePath, 'station-illustration.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24"></svg>',
      'utf8',
    );
    const workspace = await fixture.composition.attachWorkspace(fixture.workspace);

    const result = await workspace.tools.execute('ReadImage', {
      mode: 'metadata',
      analysis: 'describe',
      max_images: 1,
      images: [
        {
          contentLocator: {
            kind: 'workspace-file',
            path: 'station-illustration.svg',
          },
        },
      ],
    });

    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result).toMatchObject({
      success: true,
      data: {
        imageCount: 1,
        images: [
          {
            contentLocator: {
              kind: 'workspace-file',
              path: 'station-illustration.svg',
            },
            mimeType: 'image/svg+xml',
            width: 32,
            height: 24,
          },
        ],
      },
    });
  });

  it('preflights every workspace before replacing any plugin Tool generation', async () => {
    const fixture = await createFixture();
    const firstWorkspace = await fixture.composition.attachWorkspace(fixture.workspace);
    const secondWorkspacePath = join(fixture.root, 'workspace-second');
    await mkdir(secondWorkspacePath, { recursive: true });
    const secondWorkspace = await fixture.composition.attachWorkspace({
      workspaceId: '22222222-2222-4222-8222-222222222222',
      workspacePath: secondWorkspacePath,
      displayName: 'Second fixture',
      locator: { kind: 'variable', value: '${HOME}/workspace-second' },
    });
    secondWorkspace.tools.register({
      ...fixtureTool(),
      name: 'mcp__fixture__echo',
    });

    const pluginRoot = join(fixture.root, 'mcp-plugin');
    await mkdir(pluginRoot, { recursive: true });
    await writeFile(
      join(pluginRoot, 'fixture-mcp.mjs'),
      [
        '#!/usr/bin/env node',
        "import readline from 'node:readline';",
        'const input = readline.createInterface({ input: process.stdin });',
        "input.on('line', (line) => {",
        '  const request = JSON.parse(line);',
        '  if (request.id === undefined) return;',
        "  const result = request.method === 'tools/list'",
        "    ? { tools: [{ name: 'echo', description: 'Echo input', inputSchema: { type: 'object', properties: {} } }] }",
        '    : { content: [] };',
        "  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');",
        '});',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    await writeFile(
      join(pluginRoot, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          fixture: {
            command: './fixture-mcp.mjs',
            cwd: '.',
          },
        },
      }),
      'utf8',
    );

    await expect(
      fixture.composition.reconcilePluginRuntime({
        revision: `sha256:${'c'.repeat(64)}`,
        records: [],
        runtimeDescriptors: [
          {
            pluginId: 'fixture@openneko',
            pluginRoot,
            mcpDocumentPath: join(pluginRoot, '.mcp.json'),
            mcpServerIds: ['fixture'],
            appIds: [],
          },
        ],
        diagnostics: [],
      }),
    ).rejects.toThrow("Plugin Tool 'mcp__fixture__echo' conflicts");
    expect(firstWorkspace.tools.list().some((tool) => tool.name === 'mcp__fixture__echo')).toBe(
      false,
    );
    expect(secondWorkspace.tools.list().some((tool) => tool.name === 'mcp__fixture__echo')).toBe(
      true,
    );
  });

  it('atomically projects plugin Skill generations into global and workspace Pi discovery', async () => {
    const fixture = await createFixture();
    const pluginRoot = join(fixture.root, 'plugin');
    const skillRoot = join(pluginRoot, 'skills');
    await mkdir(join(skillRoot, 'plugin-fixture'), { recursive: true });
    await writeFile(
      join(skillRoot, 'plugin-fixture', 'SKILL.md'),
      [
        '---',
        'name: plugin-fixture',
        'description: Plugin composition fixture',
        '---',
        'Plugin composition Skill body',
        '',
      ].join('\n'),
      'utf8',
    );
    const installed: AgentExtensionCatalogSnapshot = {
      revision: `sha256:${'a'.repeat(64)}`,
      records: [],
      runtimeDescriptors: [
        {
          pluginId: 'fixture@openneko',
          pluginRoot,
          skillRoot,
          mcpServerIds: [],
          appIds: [],
        },
      ],
      diagnostics: [],
    };

    await expect(fixture.composition.reconcilePluginRuntime(installed)).resolves.toEqual(
      new Map([
        [
          'fixture@openneko',
          {
            status: 'ready',
            diagnosticCode: '',
          },
        ],
      ]),
    );
    expect(await fixture.composition.readGlobalSkillCatalog()).toMatchObject({
      records: [
        expect.objectContaining({
          name: 'plugin-fixture',
          source: { kind: 'plugin', pluginId: 'fixture@openneko' },
        }),
      ],
    });
    const workspace = await fixture.composition.attachWorkspace(fixture.workspace);
    expect(await workspace.readSkillCatalog(true)).toMatchObject({
      records: expect.arrayContaining([
        expect.objectContaining({
          name: 'plugin-fixture',
          source: { kind: 'plugin', pluginId: 'fixture@openneko' },
        }),
      ]),
    });

    await fixture.composition.reconcilePluginRuntime({
      revision: `sha256:${'b'.repeat(64)}`,
      records: [],
      runtimeDescriptors: [],
      diagnostics: [],
    });
    expect(
      (await workspace.readSkillCatalog(true)).records.some(
        (record) => record.source.kind === 'plugin',
      ),
    ).toBe(false);
  });

  async function createFixture() {
    const root = await mkdtemp(join(tmpdir(), 'neko-desktop-agent-'));
    roots.push(root);
    const userHome = join(root, 'home');
    const userDataRoot = join(userHome, '.neko');
    const workspacePath = join(root, 'workspace');
    await mkdir(join(workspacePath, '.agents', 'skills', 'desktop-fixture'), {
      recursive: true,
    });
    await writeFile(
      join(workspacePath, '.agents', 'skills', 'desktop-fixture', 'SKILL.md'),
      [
        '---',
        'name: desktop-fixture',
        'description: Desktop composition fixture',
        '---',
        'Desktop composition Skill body',
        '',
      ].join('\n'),
      'utf8',
    );
    let identity = 0;
    const workspace: AssetWorkspaceResolution = {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      workspacePath,
      displayName: 'Fixture',
      locator: { kind: 'variable', value: '${HOME}/workspace' },
    };
    const composition = createAgentAppHost({
      userDataRoot,
      userHome,
      hostId: 'desktop-host-1',
      credentialRuntime: createTestCredentialRuntime(),
      catalogReader: await NodePiConversationCatalogReader.create({ userDataRoot }),
      createIdentity: () => `identity-${(identity += 1)}`,
    });
    composition.setHomeWorkspaceScope([workspace.workspaceId]);
    compositions.push(composition);
    return { root, userHome, userDataRoot, workspace, composition };
  }
});

async function createComposition(
  fixture: {
    readonly userDataRoot: string;
    readonly userHome: string;
  },
  hostId: string,
): Promise<AgentAppHost> {
  const composition = createAgentAppHost({
    userDataRoot: fixture.userDataRoot,
    userHome: fixture.userHome,
    hostId,
    credentialRuntime: createTestCredentialRuntime(),
    catalogReader: await NodePiConversationCatalogReader.create({
      userDataRoot: fixture.userDataRoot,
    }),
  });
  composition.setHomeWorkspaceScope(['11111111-1111-4111-8111-111111111111']);
  return composition;
}

function createTestCredentialRuntime() {
  const secrets = new Map<string, string>();
  return createAgentCredentialRuntime({
    secrets: {
      get: async (key) => secrets.get(key),
      set: async (key, value) => {
        secrets.set(key, value);
      },
      delete: async (key) => {
        secrets.delete(key);
      },
    },
    prompt: {
      text: async () => null,
      select: async () => null,
      notify: () => undefined,
    },
  });
}

async function writeSkill(root: string, name: string, description: string): Promise<void> {
  await mkdir(join(root, name), { recursive: true });
  await writeFile(
    join(root, name, 'SKILL.md'),
    ['---', `name: ${name}`, `description: ${description}`, '---', `${name} body`, ''].join('\n'),
    'utf8',
  );
}

function fixturePolicy() {
  return resolveAgentModelPolicy({
    catalog: [
      {
        model: MODEL,
        capabilities: ['llm.chat', 'tools'],
        credentialState: 'configured',
      },
    ],
    userBindings: {
      'agent.main': { providerId: MODEL.provider, modelId: MODEL.id },
    },
  });
}

function allowTools() {
  return { preflight: () => ({ allowed: true as const }) };
}

function fixtureTool(): Tool {
  return {
    name: 'DesktopFixtureTool',
    description: 'Proves the workspace-scoped canonical Tool registry owner.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    category: 'system',
    isReadOnly: true,
    execute: async () => ({ success: true, data: { owner: 'desktop-workspace' } }),
  };
}

function createFixtureModels(
  streamSimple: (
    model: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions,
  ) => ReturnType<typeof createAssistantMessageEventStream>,
) {
  const models = createModels();
  models.setProvider(
    createProvider({
      id: MODEL.provider,
      models: [MODEL],
      auth: {
        apiKey: {
          name: 'Fixture',
          resolve: async () => ({ auth: { apiKey: 'redacted-fixture' } }),
        },
      },
      api: {
        stream: streamSimple,
        streamSimple,
      },
    }),
  );
  return models;
}

function fixtureConfiguration(): AgentTurnConfigurationSnapshot {
  const projection: EffectiveAgentConfigurationProjection = Object.freeze({
    schemaVersion: 1,
    profileId: 'effective-agent-aaaaaaaaaaaaaaaa',
    digest: `sha256:${'a'.repeat(64)}`,
    values: Object.freeze({
      modelBinding: Object.freeze({
        purpose: 'agent.main',
        providerId: MODEL.provider,
        modelId: MODEL.id,
      }),
      temperature: 0.7,
      maxTokens: MODEL.maxTokens,
      thinkingBudget: 0,
      executionMode: 'ask',
      outputFormat: 'markdown',
    }),
    sources: Object.freeze({
      modelBinding: 'runtime',
      temperature: 'default',
      maxTokens: 'default',
      thinkingBudget: 'default',
      executionMode: 'default',
      outputFormat: 'default',
    }),
    dimensions: EFFECTIVE_AGENT_CONFIG_DIMENSIONS,
  });
  return Object.freeze({ requested: projection, effective: projection, diagnostics: [] });
}

function assistant(text: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-completions',
    provider: MODEL.provider,
    model: MODEL.id,
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  };
}

function completedStream(message: AssistantMessage) {
  const stream = createAssistantMessageEventStream();
  queueMicrotask(() => {
    stream.push({ type: 'start', partial: message });
    stream.push({ type: 'done', reason: 'stop', message });
  });
  return stream;
}

function lastUserPrompt(context: Context): string {
  let message: Context['messages'][number] | undefined;
  for (let index = context.messages.length - 1; index >= 0; index -= 1) {
    const candidate = context.messages[index];
    if (candidate?.role === 'user') {
      message = candidate;
      break;
    }
  }
  if (!message) throw new Error('Fixture Pi stream received no user prompt.');
  if (typeof message.content === 'string') return message.content;
  return message.content
    .filter((content) => content.type === 'text')
    .map((content) => content.text)
    .join('');
}
