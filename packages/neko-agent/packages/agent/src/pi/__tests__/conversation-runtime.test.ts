import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createAssistantMessageEventStream,
  createModels,
  createProvider,
  Type,
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from '@earendil-works/pi-ai';
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import { createReadDocumentTool } from '@neko/content/document';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PiConversationRuntime } from '../conversation-runtime';
import { DEFAULT_PI_MODEL_REQUEST_TIMEOUT_MS, resolveAgentModelPolicy } from '../model-policy';
import { NodePiConversationAuthority } from '../node-conversation-authority';
import { projectOpenNekoTool } from '../openneko-tool';
import { PiSkillHost } from '../skill-host';
import type { PiProductAgentEvent } from '../event-projector';

const MODEL: Model<'openai-completions'> = {
  id: 'main',
  name: 'Main',
  api: 'openai-completions',
  provider: 'newapi',
  baseUrl: 'https://newapi.example.invalid/v1',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8_192,
  maxTokens: 2_048,
};

describe('PiConversationRuntime', () => {
  let root: string;
  let authority: NodePiConversationAuthority;
  let skillEnv: NodeExecutionEnv;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'neko-pi-runtime-'));
    authority = await NodePiConversationAuthority.create({
      userDataRoot: root,
      workspaceId: 'workspace-1',
      hostId: 'tui',
    });
    skillEnv = new NodeExecutionEnv({ cwd: root });
  });

  afterEach(async () => {
    await authority.dispose();
    await skillEnv.cleanup();
    await rm(root, { recursive: true, force: true });
  });

  it('runs the canonical Pi Agent path and commits one terminal turn checkpoint', async () => {
    const lease = authority.acquireLease('conversation-1');
    await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });
    const captured: Array<{
      model: Model<Api>;
      context: Context;
      options?: SimpleStreamOptions;
    }> = [];
    const models = createFixtureModels((model, context, options) => {
      captured.push({ model, context, options });
      return completedStream(assistant('stop', 'hello from Pi'));
    });
    const modelPolicy = policy({ temperature: 0.7, topP: 0.95, maxTokens: 777 });
    const skills = await emptySkills();
    const runtime = await PiConversationRuntime.open({
      authority,
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      models,
      initialModelPolicy: modelPolicy,
      baseSystemPrompt: 'OpenNeko fixture',
    });
    const events: PiProductAgentEvent[] = [];

    await runtime.execute({
      turnId: 'turn-1',
      runId: 'run-1',
      prompt: 'hello',
      modelPolicy,
      skillSnapshot: skills,
      capabilityTools: [],
      permissionPolicy: { preflight: () => ({ allowed: true }) },
      workspaceTrusted: true,
      events: collect(events),
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      model: { provider: 'newapi', id: 'main' },
      context: { systemPrompt: 'OpenNeko fixture' },
      options: {
        temperature: 0.7,
        maxTokens: 777,
        timeoutMs: DEFAULT_PI_MODEL_REQUEST_TIMEOUT_MS,
      },
    });
    await expect(
      captured[0]?.options?.onPayload?.({ model: 'main', messages: [] }, captured[0].model),
    ).resolves.toEqual({ model: 'main', messages: [], top_p: 0.95 });
    expect(events.map((event) => event.type)).toEqual([
      'turn.started',
      'turn.persistence',
      'assistant.message.completed',
      'usage',
      'turn.completed',
      'turn.persistence',
      'turn.persistence',
    ]);
    expect(events.filter((event) => event.type === 'turn.persistence')).toEqual([
      expect.objectContaining({ state: 'volatile' }),
      expect.objectContaining({ state: 'persisting' }),
      expect.objectContaining({ state: 'durable' }),
    ]);
    expect(authority.readCheckpoint('conversation-1', 'turn-1')).toMatchObject({
      terminalState: 'completed',
      branchId: 'branch-main',
    });
    const context = await authority.buildContext('conversation-1', 'branch-main');
    expect(context.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: [expect.objectContaining({ type: 'text', text: 'hello' })],
      }),
      expect.objectContaining({ role: 'assistant' }),
    ]);
    runtime.dispose();
  });

  it('rejects an incomplete ReadDocument chapter locator before capability execution', async () => {
    const lease = authority.acquireLease('conversation-1');
    await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });
    const responses = [
      assistantContent('toolUse', [
        {
          type: 'toolCall' as const,
          id: 'read-document-1',
          name: 'ReadDocument',
          arguments: {
            source: { kind: 'file', path: '${A}/books/book.epub' },
            mode: 'range',
            range: {
              locator: { kind: 'chapter', spineIndex: 304 },
              endLocator: { kind: 'chapter', spineIndex: 401 },
            },
          },
        },
      ]),
      assistant('stop', 'invalid document range rejected'),
    ];
    const models = createFixtureModels(() => {
      const response = responses.shift();
      if (response === undefined) throw new Error('Unexpected extra Pi model turn.');
      return completedStream(response);
    });
    const modelPolicy = policy();
    const resolveDocumentContent = vi.fn();
    const permissionPreflight = vi.fn(() => ({ allowed: true as const }));
    const runtime = await PiConversationRuntime.open({
      authority,
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      models,
      initialModelPolicy: modelPolicy,
      baseSystemPrompt: 'OpenNeko fixture',
    });
    const events: PiProductAgentEvent[] = [];

    await runtime.execute({
      turnId: 'turn-read-document',
      runId: 'run-read-document',
      prompt: 'read the document range',
      modelPolicy,
      skillSnapshot: await emptySkills(),
      capabilityTools: [
        projectOpenNekoTool(
          createReadDocumentTool({ contentAccessRuntime: { resolveDocumentContent } }),
        ),
      ],
      permissionPolicy: { preflight: permissionPreflight },
      workspaceTrusted: true,
      events: collect(events),
    });

    expect(resolveDocumentContent).not.toHaveBeenCalled();
    expect(permissionPreflight).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'tool.completed',
        toolCallId: 'read-document-1',
        isError: true,
        result: expect.objectContaining({
          details: expect.objectContaining({
            success: false,
            error: expect.stringContaining('chapterHref'),
          }),
        }),
      }),
    );
    runtime.dispose();
  });

  it('does not submit a media task before the originating ToolCall is approved', async () => {
    const lease = authority.acquireLease('conversation-1');
    await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });
    const responses = [
      assistantContent('toolUse', [
        {
          type: 'toolCall' as const,
          id: 'generate-image-1',
          name: 'GenerateImage',
          arguments: { prompt: 'two cats playing' },
        },
      ]),
      assistant('stop', 'submitted'),
    ];
    const models = createFixtureModels(() => {
      const response = responses.shift();
      if (response === undefined) throw new Error('Unexpected extra Pi model turn.');
      return completedStream(response);
    });
    const modelPolicy = policy();
    let announceConfirmation: (() => void) | undefined;
    const confirmationRequired = new Promise<void>((resolve) => {
      announceConfirmation = resolve;
    });
    let approve: (() => void) | undefined;
    const approval = new Promise<void>((resolve) => {
      approve = resolve;
    });
    const submitMediaTask = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'task:media-1' }],
      details: { taskId: 'media-1' },
    }));
    const runtime = await PiConversationRuntime.open({
      authority,
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      models,
      initialModelPolicy: modelPolicy,
      baseSystemPrompt: 'base',
    });

    const execution = runtime.execute({
      turnId: 'turn-generate',
      runId: 'run-generate',
      prompt: 'generate an image',
      modelPolicy,
      skillSnapshot: await emptySkills(),
      capabilityTools: [
        {
          name: 'GenerateImage',
          label: 'Generate image',
          description: 'Submit an image generation task',
          parameters: Type.Object({ prompt: Type.String() }),
          requiresConfirmation: true,
          execute: submitMediaTask,
        },
      ],
      permissionPolicy: {
        preflight: async () => {
          announceConfirmation?.();
          await approval;
          return { allowed: true };
        },
      },
      workspaceTrusted: true,
      events: { emit: () => undefined },
    });

    await confirmationRequired;
    expect(submitMediaTask).not.toHaveBeenCalled();

    approve?.();
    await execution;

    expect(submitMediaTask).toHaveBeenCalledOnce();
    expect(submitMediaTask).toHaveBeenCalledWith(
      expect.objectContaining({
        args: { prompt: 'two cats playing' },
        context: expect.objectContaining({
          identity: expect.objectContaining({
            conversationId: 'conversation-1',
            turnId: 'turn-generate',
            runId: 'run-generate',
            toolCallId: 'generate-image-1',
          }),
        }),
      }),
    );
    runtime.dispose();
  });

  it('fails a silent Pi provider stream after the configured idle timeout', async () => {
    const lease = authority.acquireLease('conversation-1');
    await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });
    let providerSignal: AbortSignal | undefined;
    const models = createFixtureModels((_model, _context, options) => {
      providerSignal = options?.signal;
      return createAssistantMessageEventStream();
    });
    const modelPolicy = policy({ timeoutMs: 20 });
    const runtime = await PiConversationRuntime.open({
      authority,
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      models,
      initialModelPolicy: modelPolicy,
      baseSystemPrompt: 'OpenNeko fixture',
    });
    const events: PiProductAgentEvent[] = [];

    await runtime.execute({
      turnId: 'turn-timeout',
      runId: 'run-timeout',
      prompt: 'wait forever',
      modelPolicy,
      skillSnapshot: await emptySkills(),
      capabilityTools: [],
      permissionPolicy: { preflight: () => ({ allowed: true }) },
      workspaceTrusted: true,
      events: collect(events),
    });

    expect(providerSignal?.aborted).toBe(true);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'turn.failed',
        error: 'Pi provider request newapi/main was idle for 20ms.',
      }),
    );
    expect(authority.readCheckpoint('conversation-1', 'turn-timeout')).toMatchObject({
      terminalState: 'failed',
    });
    runtime.dispose();
  });

  it('keeps the writer lease alive between turns for the lifetime of the runtime', async () => {
    await authority.dispose();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    authority = await NodePiConversationAuthority.create({
      userDataRoot: root,
      workspaceId: 'workspace-1',
      hostId: 'tui',
      leaseTtlMs: 1_000,
    });
    const lease = authority.acquireLease('conversation-1');
    await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });
    const modelPolicy = policy();
    const runtime = await PiConversationRuntime.open({
      authority,
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      models: createFixtureModels(() => completedStream(assistant('stop', 'done'))),
      initialModelPolicy: modelPolicy,
      baseSystemPrompt: 'base',
    });

    try {
      await runtime.execute({
        turnId: 'turn-1',
        runId: 'run-1',
        prompt: 'first',
        modelPolicy,
        skillSnapshot: await emptySkills(),
        capabilityTools: [],
        permissionPolicy: { preflight: () => ({ allowed: true }) },
        workspaceTrusted: true,
        events: { emit: () => undefined },
      });

      await vi.advanceTimersByTimeAsync(2_500);

      await expect(
        runtime.execute({
          turnId: 'turn-2',
          runId: 'run-2',
          prompt: 'second',
          modelPolicy,
          skillSnapshot: await emptySkills(),
          capabilityTools: [],
          permissionPolicy: { preflight: () => ({ allowed: true }) },
          workspaceTrusted: true,
          events: { emit: () => undefined },
        }),
      ).resolves.toBeUndefined();
      expect(authority.readCheckpoint('conversation-1', 'turn-2')).toMatchObject({
        terminalState: 'completed',
        writerEpoch: 1,
      });
    } finally {
      runtime.dispose();
      vi.useRealTimers();
    }
  });

  it('fences an idle runtime after another Host explicitly takes over', async () => {
    await authority.dispose();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    authority = await NodePiConversationAuthority.create({
      userDataRoot: root,
      workspaceId: 'workspace-1',
      hostId: 'tui',
      leaseTtlMs: 1_000,
    });
    const lease = authority.acquireLease('conversation-1');
    await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });
    const modelPolicy = policy();
    const runtime = await PiConversationRuntime.open({
      authority,
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      models: createFixtureModels(() => completedStream(assistant('stop', 'done'))),
      initialModelPolicy: modelPolicy,
      baseSystemPrompt: 'base',
    });
    const otherHost = await NodePiConversationAuthority.create({
      userDataRoot: root,
      workspaceId: 'workspace-1',
      hostId: 'vscode',
      leaseTtlMs: 1_000,
    });

    try {
      const takeover = otherHost.acquireLease('conversation-1', { takeover: true });
      await vi.advanceTimersByTimeAsync(500);

      await expect(
        runtime.execute({
          turnId: 'turn-after-takeover',
          runId: 'run-after-takeover',
          prompt: 'must fail',
          modelPolicy,
          skillSnapshot: await emptySkills(),
          capabilityTools: [],
          permissionPolicy: { preflight: () => ({ allowed: true }) },
          workspaceTrusted: true,
          events: { emit: () => undefined },
        }),
      ).rejects.toMatchObject({ code: 'lease-stale' });
      expect(authority.readCheckpoint('conversation-1', 'turn-after-takeover')).toBeUndefined();
      expect(() => runtime.dispose()).not.toThrow();
      otherHost.releaseLease(takeover);
    } finally {
      await otherHost.dispose();
      vi.useRealTimers();
    }
  });

  it('persists explicit Skill invocation as real Pi transcript input without physical paths', async () => {
    const lease = authority.acquireLease('conversation-1');
    await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });
    const skillDirectory = join(root, 'project-skills', 'fixture-skill');
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(
      join(skillDirectory, 'SKILL.md'),
      '---\nname: fixture-skill\ndescription: Fixture\n---\nFollow the fixture method.\n',
      'utf8',
    );
    const skills = await new PiSkillHost(skillEnv, {
      isTrusted: () => true,
      isEnabled: () => true,
    }).discover([{ path: join(root, 'project-skills'), source: { kind: 'project' } }]);
    let capturedContext: Context | undefined;
    const models = createFixtureModels((_model, context) => {
      capturedContext = context;
      return completedStream(assistant('stop', 'done'));
    });
    const modelPolicy = policy();
    const runtime = await PiConversationRuntime.open({
      authority,
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      models,
      initialModelPolicy: modelPolicy,
      baseSystemPrompt: 'base',
    });

    await runtime.executeSkill({
      turnId: 'turn-skill',
      runId: 'run-skill',
      skillName: 'fixture-skill',
      additionalInstructions: 'Be concise',
      modelPolicy,
      skillSnapshot: skills,
      capabilityTools: [],
      permissionPolicy: { preflight: () => ({ allowed: true }) },
      workspaceTrusted: true,
      events: { emit: () => undefined },
    });

    expect(capturedContext?.systemPrompt).toContain('/__neko_skills/');
    expect(capturedContext?.systemPrompt).not.toContain(root);
    const persisted = await authority.buildContext('conversation-1', 'branch-main');
    expect(persisted.messages[0]).toMatchObject({
      role: 'user',
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('Follow the fixture method.'),
        }),
      ],
    });
    expect(JSON.stringify(persisted.messages)).not.toContain(root);
    runtime.dispose();
  });

  it('loads model-selected Skill content only through read_skill and persists its receipt', async () => {
    const lease = authority.acquireLease('conversation-1');
    await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });
    const skillDirectory = join(root, 'project-skills', 'fixture-skill');
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(
      join(skillDirectory, 'SKILL.md'),
      '---\nname: fixture-skill\ndescription: Fixture\n---\nModel selected body.\n',
      'utf8',
    );
    const skills = await new PiSkillHost(skillEnv, {
      isTrusted: () => true,
      isEnabled: () => true,
    }).discover([{ path: join(root, 'project-skills'), source: { kind: 'project' } }]);
    const locator = skills.records[0]!.locator.value;
    const contexts: Context[] = [];
    let request = 0;
    const models = createFixtureModels((_model, context) => {
      contexts.push(context);
      request += 1;
      return completedStream(
        request === 1
          ? assistantContent('toolUse', [
              {
                type: 'toolCall',
                id: 'read-skill-1',
                name: 'read_skill',
                arguments: { locator },
              },
            ])
          : assistant('stop', 'used the Skill'),
      );
    });
    const modelPolicy = policy();
    const permissionTraits: Array<{
      readonly requiresConfirmation: boolean | undefined;
      readonly isReadOnly: boolean | undefined;
    }> = [];
    const runtime = await PiConversationRuntime.open({
      authority,
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      models,
      initialModelPolicy: modelPolicy,
      baseSystemPrompt: 'base',
    });

    await runtime.execute({
      turnId: 'turn-model-skill',
      runId: 'run-model-skill',
      prompt: 'Use the matching Skill',
      modelPolicy,
      skillSnapshot: skills,
      capabilityTools: [],
      permissionPolicy: {
        preflight: ({ tool }) => {
          permissionTraits.push({
            requiresConfirmation: tool.requiresConfirmation,
            isReadOnly: tool.isReadOnly,
          });
          return { allowed: true };
        },
      },
      workspaceTrusted: true,
      events: { emit: () => undefined },
    });

    expect(contexts[0]!.systemPrompt ?? '').toContain('read_skill');
    expect(contexts[0]!.tools?.map((tool) => tool.name)).toEqual(['read_skill']);
    expect(permissionTraits).toEqual([{ requiresConfirmation: false, isReadOnly: true }]);
    expect(JSON.stringify(contexts[1]!.messages)).toContain('Model selected body.');
    const persisted = await authority.buildContext('conversation-1', 'branch-main');
    expect(JSON.stringify(persisted.messages)).toContain('"fingerprint"');
    expect(JSON.stringify(persisted.messages)).toContain('Model selected body.');
    expect(JSON.stringify(persisted.messages)).not.toContain(root);
    runtime.dispose();
  });

  it('uses Pi compaction primitives and persists the Pi compaction entry', async () => {
    const lease = authority.acquireLease('conversation-1');
    await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });
    const summarizationPrompts: string[] = [];
    const models = createFixtureModels((_model, context) => {
      if (context.systemPrompt.includes('context summarization assistant')) {
        summarizationPrompts.push(JSON.stringify(context.messages));
        return completedStream(assistant('stop', 'Pi-owned compacted summary'));
      }
      return completedStream(assistant('stop', 'A sufficiently verbose response for history'));
    });
    const modelPolicy = policy();
    const runtime = await PiConversationRuntime.open({
      authority,
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      models,
      initialModelPolicy: modelPolicy,
      baseSystemPrompt: 'base',
    });
    await runtime.execute({
      turnId: 'turn-before-compact',
      runId: 'run-before-compact',
      prompt: 'A sufficiently verbose request for compaction',
      modelPolicy,
      skillSnapshot: await emptySkills(),
      capabilityTools: [],
      permissionPolicy: { preflight: () => ({ allowed: true }) },
      workspaceTrusted: true,
      events: { emit: () => undefined },
    });
    await runtime.execute({
      turnId: 'turn-kept-after-compact',
      runId: 'run-kept-after-compact',
      prompt: 'Keep this recent request after compaction',
      modelPolicy,
      skillSnapshot: await emptySkills(),
      capabilityTools: [],
      permissionPolicy: { preflight: () => ({ allowed: true }) },
      workspaceTrusted: true,
      events: { emit: () => undefined },
    });

    const result = await runtime.compactContext({
      reserveTokens: 1_024,
      keepRecentTokens: 20,
      retainedProductReferences: ['resource:asset-1'],
    });

    expect(result).toMatchObject({ performed: true, originalTokens: expect.any(Number) });
    expect(summarizationPrompts).toHaveLength(1);
    expect(summarizationPrompts[0]).toContain('resource:asset-1');
    const compactedSession = await authority.openBranch('conversation-1', 'branch-main');
    expect((await compactedSession.getBranch()).at(-1)).toMatchObject({
      type: 'compaction',
      summary: 'Pi-owned compacted summary',
    });
    expect((await compactedSession.buildContext()).messages[0]).toMatchObject({
      role: 'compactionSummary',
      summary: 'Pi-owned compacted summary',
    });
    expect(runtime.messages[0]).toMatchObject({ role: 'compactionSummary' });
    runtime.dispose();
  });

  it('rejects a second turn before issuing another provider request', async () => {
    const lease = authority.acquireLease('conversation-1');
    await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });
    let startedResolve: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    let providerRequestCount = 0;
    const models = createFixtureModels((_model, _context, options) => {
      providerRequestCount += 1;
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        stream.push({ type: 'start', partial: assistant('stop', '') });
        startedResolve?.();
        options?.signal?.addEventListener(
          'abort',
          () => {
            const message = assistant('aborted', '', 'cancelled');
            stream.push({ type: 'error', reason: 'aborted', error: message });
          },
          { once: true },
        );
      });
      return stream;
    });
    const modelPolicy = policy();
    const runtime = await PiConversationRuntime.open({
      authority,
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      models,
      initialModelPolicy: modelPolicy,
      baseSystemPrompt: 'base',
    });
    const firstExecution = runtime.execute({
      turnId: 'turn-1',
      runId: 'run-1',
      prompt: 'wait',
      modelPolicy,
      skillSnapshot: await emptySkills(),
      capabilityTools: [],
      permissionPolicy: { preflight: () => ({ allowed: true }) },
      workspaceTrusted: true,
      events: { emit: () => undefined },
    });
    await started;

    await expect(
      runtime.execute({
        turnId: 'turn-2',
        runId: 'run-2',
        prompt: 'do not send',
        modelPolicy,
        skillSnapshot: await emptySkills(),
        capabilityTools: [],
        permissionPolicy: { preflight: () => ({ allowed: true }) },
        workspaceTrusted: true,
        events: { emit: () => undefined },
      }),
    ).rejects.toThrow('already has an active turn');
    expect(providerRequestCount).toBe(1);

    runtime.cancel({ turnId: 'turn-1', runId: 'run-1' });
    await firstExecution;
    runtime.dispose();
  });

  it('cancels only the explicitly identified active run and checkpoints cancellation', async () => {
    const lease = authority.acquireLease('conversation-1');
    await authority.createConversation({
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
    });
    let startedResolve: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    const models = createFixtureModels((_model, _context, options) => {
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        stream.push({ type: 'start', partial: assistant('stop', '') });
        startedResolve?.();
        options?.signal?.addEventListener(
          'abort',
          () => {
            const message = assistant('aborted', '', 'cancelled');
            stream.push({ type: 'error', reason: 'aborted', error: message });
          },
          { once: true },
        );
      });
      return stream;
    });
    const modelPolicy = policy();
    const runtime = await PiConversationRuntime.open({
      authority,
      lease,
      conversationId: 'conversation-1',
      branchId: 'branch-main',
      models,
      initialModelPolicy: modelPolicy,
      baseSystemPrompt: 'base',
    });
    const events: PiProductAgentEvent[] = [];
    const execution = runtime.execute({
      turnId: 'turn-cancel',
      runId: 'run-cancel',
      prompt: 'wait',
      modelPolicy,
      skillSnapshot: await emptySkills(),
      capabilityTools: [],
      permissionPolicy: { preflight: () => ({ allowed: true }) },
      workspaceTrusted: true,
      events: collect(events),
    });
    await started;

    expect(() => runtime.cancel({ turnId: 'other', runId: 'run-cancel' })).toThrow(
      'does not own the active turn',
    );
    runtime.cancel({ turnId: 'turn-cancel', runId: 'run-cancel' });
    await execution;

    expect(events).toContainEqual(
      expect.objectContaining({ type: 'turn.cancelled', reason: 'cancelled' }),
    );
    expect(events.at(-1)).toMatchObject({ type: 'turn.persistence', state: 'durable' });
    expect(authority.readCheckpoint('conversation-1', 'turn-cancel')?.terminalState).toBe(
      'cancelled',
    );
    runtime.dispose();
  });

  function policy(parameters = {}) {
    return resolveAgentModelPolicy({
      catalog: [
        {
          model: MODEL,
          capabilities: ['llm.chat', 'tools'],
          credentialState: 'configured',
        },
      ],
      userBindings: {
        'agent.main': { providerId: 'newapi', modelId: 'main', parameters },
      },
    });
  }

  async function emptySkills() {
    return new PiSkillHost(skillEnv, {
      isTrusted: () => true,
      isEnabled: () => true,
    }).discover([]);
  }
});

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
      id: 'newapi',
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

function assistant(
  stopReason: AssistantMessage['stopReason'],
  text: string,
  errorMessage?: string,
): AssistantMessage {
  return {
    role: 'assistant',
    content: text.length === 0 ? [] : [{ type: 'text', text }],
    api: 'openai-completions',
    provider: 'newapi',
    model: 'main',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    ...(errorMessage === undefined ? {} : { errorMessage }),
    timestamp: Date.now(),
  };
}

function assistantContent(
  stopReason: AssistantMessage['stopReason'],
  content: AssistantMessage['content'],
): AssistantMessage {
  return {
    ...assistant(stopReason, ''),
    content,
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

function collect(events: PiProductAgentEvent[]) {
  return {
    emit(event: PiProductAgentEvent) {
      events.push(event);
    },
  };
}
