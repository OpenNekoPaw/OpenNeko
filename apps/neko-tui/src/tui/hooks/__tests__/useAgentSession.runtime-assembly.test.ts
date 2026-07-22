import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import React, { useEffect } from 'react';
import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PiCapabilityTool,
  PiProductAgentEvent,
  PiProductEventSink,
  PiToolPermissionPolicy,
} from '@neko/agent/pi';
import type { IService } from '@neko/shared';

import {
  createTuiTestRuntime,
  type TuiTestRuntime,
} from '../../__tests__/render-with-presentation';
import { DEFAULT_CLI_CONFIG, type CLIConfig } from '../../core/types';
import { createTuiConversationId } from '../../core/tui-conversation-id';
import { createMemoryLocalMetadataBinding } from '../../host/__tests__/fixtures/memory-local-metadata';
import { createTestAgentTerminalPresentation } from '../../presentation/testing';
import { TuiApplicationRuntimeProvider } from '../../runtime/tui-runtime-context';
import { useAgentSession, type AgentSessionHandle } from '../useAgentSession';

const piMocks = vi.hoisted(() => ({
  open: vi.fn(),
  execute: vi.fn(),
  executeSkill: vi.fn(),
  cancel: vi.fn(),
  clearContext: vi.fn(),
  compactContext: vi.fn(),
  updateConversationTitle: vi.fn(),
  dispose: vi.fn(),
  busy: false,
  messages: [] as readonly unknown[],
  contextTokenCount: 321,
}));

const legacyMocks = vi.hoisted(() => ({
  createAgentRuntimeSession: vi.fn(() => {
    throw new Error('Legacy AgentSession factory must not be reached.');
  }),
}));

vi.mock('@neko/agent/pi', async () => {
  const actual = await vi.importActual<typeof import('@neko/agent/pi')>('@neko/agent/pi');
  return {
    ...actual,
    PiConversationRuntime: { open: piMocks.open },
  };
});

vi.mock('@neko/agent/runtime', async () => {
  const actual = await vi.importActual<typeof import('@neko/agent/runtime')>('@neko/agent/runtime');
  return {
    ...actual,
    createAgentRuntimeSession: legacyMocks.createAgentRuntimeSession,
  };
});

let tempRoot: string;
let runtime: TuiTestRuntime | undefined;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-tui-pi-runtime-'));
  runtime = undefined;
  piMocks.busy = false;
  piMocks.messages = [];
  piMocks.execute.mockReset();
  piMocks.executeSkill.mockReset();
  piMocks.cancel.mockReset();
  piMocks.clearContext.mockReset();
  piMocks.compactContext.mockReset().mockResolvedValue({
    performed: true,
    originalTokens: 321,
    compressedTokens: 123,
    ratio: 123 / 321,
  });
  piMocks.updateConversationTitle.mockReset();
  piMocks.dispose.mockReset();
  legacyMocks.createAgentRuntimeSession.mockClear();
  piMocks.open.mockReset().mockResolvedValue(createPiRuntimeDouble());
  piMocks.execute.mockImplementation(async (input: PiExecuteInput) => {
    piMocks.busy = true;
    const identity = createIdentity(input);
    await emit(input.events, { type: 'turn.started', identity, timestamp: 1 });
    await emit(input.events, {
      type: 'assistant.text.delta',
      delta: 'Pi response',
      identity,
      timestamp: 2,
    });
    await emit(input.events, {
      type: 'assistant.message.completed',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Pi response' }],
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        api: 'anthropic-messages',
        usage: {
          input: 4,
          output: 2,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 6,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: 2,
      },
      identity,
      timestamp: 2,
    } as PiProductAgentEvent);
    await emit(input.events, {
      type: 'usage',
      usage: {
        input: 4,
        output: 2,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 6,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      identity,
      timestamp: 3,
    });
    await emit(input.events, { type: 'turn.completed', identity, timestamp: 4 });
    piMocks.busy = false;
  });
});

afterEach(async () => {
  cleanup();
  await new Promise<void>((resolve) => setImmediate(resolve));
  runtime?.application.dispose();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('useAgentSession Pi runtime assembly', () => {
  it('contains no source-level legacy runtime or transcript fallback', async () => {
    const hookSource = await fs.readFile(new URL('../useAgentSession.ts', import.meta.url), 'utf8');
    const metadataSource = await fs.readFile(
      new URL('../../host/tui-local-metadata-binding.ts', import.meta.url),
      'utf8',
    );

    expect(hookSource).not.toMatch(
      /createAgentRuntimeSession|AgentEventStreamRuntimeProcessor|ConversationResumeStorage|if \(false\)/,
    );
    expect(metadataSource).not.toMatch(
      /createNodeSqliteConversationStorage|migrateLegacyConversationCatalog|ConversationResumeStorage/,
    );
  });

  it('opens the conversation-scoped Pi runtime and poisons the legacy AgentSession factory', async () => {
    let handle: AgentSessionHandle | undefined;
    renderProbe(validConfig(), (session) => {
      handle = session;
    });

    await waitFor(() => handle?.isReady === true);

    expect(piMocks.open).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: currentRuntime().conversation.conversationId,
        branchId: 'main',
        baseSystemPrompt: expect.any(String),
        initialModelPolicy: expect.objectContaining({ 'agent.main': expect.any(Object) }),
      }),
    );
    expect(legacyMocks.createAgentRuntimeSession).not.toHaveBeenCalled();
    expect(handle?.getConversationPersistenceSnapshot()).toEqual(
      expect.objectContaining({ authority: 'pi-session', catalog: 'sqlite' }),
    );
  });

  it('routes the real hook submit path through Pi and projects product events into TUI stores', async () => {
    let handle: AgentSessionHandle | undefined;
    renderProbe(validConfig(), (session) => {
      handle = session;
    });
    await waitFor(() => handle?.isReady === true);

    await handle!.submit('Hello Pi');

    expect(piMocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Hello Pi',
        turnId: expect.stringMatching(/^turn-/),
        runId: expect.stringMatching(/^run-/),
      }),
    );
    expect(legacyMocks.createAgentRuntimeSession).not.toHaveBeenCalled();
    expect(currentRuntime().conversation.stores.conversation.getState().messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'Hello Pi' }),
        expect.objectContaining({ role: 'assistant', content: 'Pi response' }),
      ]),
    );
    expect(currentRuntime().conversation.stores.agent.getState().usage).toEqual({
      input: 4,
      output: 2,
      total: 6,
    });
  });

  it('submits native ReadImage analysis through the TUI terminal delivery path', async () => {
    const analysisMarkdown = '# 分镜分析\n\n第 1 页建立场景。';
    const documentResourceRef = {
      kind: 'document-entry' as const,
      source: { filePath: '${A}/books/Blame.epub', format: 'epub' as const },
      entryPath: 'OEBPS/images/page-01.jpg',
      versionPolicy: 'read-only-source' as const,
    };
    piMocks.execute.mockImplementationOnce(async (input: PiExecuteInput) => {
      piMocks.busy = true;
      const identity = createIdentity(input);
      await emit(input.events, { type: 'turn.started', identity, timestamp: 1 });
      await emit(input.events, {
        type: 'tool.completed',
        toolCallId: 'read-image-1',
        toolName: 'ReadImage',
        result: {
          details: {
            success: true,
            data: {
              mode: 'metadata',
              analysis: 'storyboard',
              images: [{ resourceRef: documentResourceRef, width: 1200, height: 1800 }],
            },
            attachments: [
              {
                type: 'image',
                path: 'document-entry://page-01',
                assetRef: {
                  assetId: 'page-01',
                  uri: 'document-entry://page-01',
                  mimeType: 'image/jpeg',
                  documentResourceRef,
                },
              },
            ],
          },
        },
        isError: false,
        identity,
        timestamp: 2,
      });
      await emit(input.events, {
        type: 'assistant.text.delta',
        delta: analysisMarkdown,
        identity,
        timestamp: 3,
      });
      await emit(input.events, {
        type: 'assistant.message.completed',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: analysisMarkdown }],
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          api: 'anthropic-messages',
          usage: {
            input: 4,
            output: 2,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 6,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop',
          timestamp: 3,
        },
        identity,
        timestamp: 3,
      } as PiProductAgentEvent);
      piMocks.messages = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: analysisMarkdown }],
        },
      ];
      await emit(input.events, { type: 'turn.completed', identity, timestamp: 4 });
      piMocks.busy = false;
    });
    let handle: AgentSessionHandle | undefined;
    renderProbe(validConfig(), (session) => {
      handle = session;
    });
    await waitFor(() => handle?.isReady === true);

    await handle!.submit('分析这一页的分镜');

    expect(handle!.getCreatorVisibleArtifacts()).toEqual([
      expect.objectContaining({ artifactId: 'page-01', role: 'source' }),
      expect.objectContaining({
        role: 'analysis',
        title: 'Storyboard Analysis',
        sourceArtifactIds: ['page-01'],
        markdown: analysisMarkdown,
      }),
    ]);
    expect(handle!.getWorkspaceBoardProjections()).toEqual([
      expect.objectContaining({
        status: 'projected',
        artifactRoleCounts: { source: 1, analysis: 1, output: 0 },
      }),
    ]);
  });

  it('allows registered workspace read tools without approval in ask mode', async () => {
    let handle: AgentSessionHandle | undefined;
    renderProbe(validConfig(), (session) => {
      handle = session;
    });
    await waitFor(() => handle?.isReady === true);

    expect(currentRuntime().conversation.stores.agent.getState().executionMode).toBe('ask');
    await handle!.submit('Inspect the workspace');

    const executeInput = piMocks.execute.mock.calls[0]?.[0] as PiExecuteInput;
    const readTool = executeInput.capabilityTools.find((tool) => tool.isReadOnly === true);
    if (!readTool) throw new Error('Expected a registered read-only workspace Tool.');
    await expect(
      executeInput.permissionPolicy.preflight({
        tool: readTool,
        args: {},
        identity: {
          workspaceId: 'workspace-1',
          conversationId: 'conversation-1',
          branchId: 'main',
          turnId: 'turn-read',
          runId: 'run-read',
          toolCallId: 'tool-read',
        },
        workspaceTrusted: true,
      }),
    ).resolves.toEqual({ allowed: true });
    expect(currentRuntime().conversation.stores.agent.getState().status).not.toBe(
      'waiting_confirmation',
    );
  });

  it('projects secret-free Pi identity and immutable turn snapshot evidence', async () => {
    let handle: AgentSessionHandle | undefined;
    renderProbe(
      {
        ...validConfig(),
        providerRequiresApiKey: true,
        apiKey: 'MUST_NOT_PROJECT_API_KEY',
        credentialProvenance: 'environment',
      },
      (session) => {
        handle = session;
      },
    );
    await waitFor(() => handle?.isReady === true);

    await handle!.submit('Capture Pi facts');

    const evidence = handle!.getPiRuntimeEvidence();
    expect(evidence).toMatchObject({
      implementation: 'pi-agent-core',
      transcriptAuthority: 'pi-session',
      productMetadataAuthority: 'sqlite',
      conversationId: currentRuntime().conversation.conversationId,
      branchId: 'main',
      writerEpoch: 1,
      workspaceLocator: {
        kind: 'virtual',
        value: expect.stringMatching(/^\/__neko_workspaces\//),
      },
      lastTurn: {
        turnId: expect.stringMatching(/^turn-/),
        runId: expect.stringMatching(/^run-/),
        purpose: 'agent.main',
        providerId: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        parametersDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        snapshotDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        protocol: 'anthropic',
        authMechanism: 'provider-default',
        credentialSource: 'environment',
        durability: 'volatile',
      },
    });
    expect(evidence?.piSessionId).not.toBe(evidence?.conversationId);
    expect(JSON.stringify(evidence)).not.toContain('MUST_NOT_PROJECT_API_KEY');
    expect(JSON.stringify(evidence)).not.toContain(tempRoot);
  });

  it('freezes only purposes referenced by registered Agent Tools into the Pi turn snapshot', async () => {
    let handle: AgentSessionHandle | undefined;
    const config: CLIConfig = {
      ...validConfig(),
      purposeModels: {
        'image.understand': {
          purpose: 'image.understand',
          providerId: DEFAULT_CLI_CONFIG.provider,
          modelId: 'vision-config',
          apiModelId: 'vision-api',
          category: 'llm',
          capabilities: ['image.understand', 'vision'],
          baseUrl: DEFAULT_CLI_CONFIG.baseUrl ?? 'https://api.anthropic.com',
          protocolProfile: 'anthropic',
          providerRequiresApiKey: false,
          providerAuth: { type: 'provider-default' },
          contextWindow: 32_000,
          maxOutputTokens: 4_096,
        },
        'image.generate': {
          purpose: 'image.generate',
          providerId: 'media-newapi',
          modelId: 'image-config',
          apiModelId: 'image-api',
          category: 'image',
          capabilities: ['image.generate'],
          baseUrl: 'https://media.example.invalid/v1',
          protocolProfile: 'newapi',
          providerRequiresApiKey: true,
          providerAuth: { type: 'bearer' },
        },
      },
    };
    renderProbe(config, (session) => {
      handle = session;
    });
    await waitFor(() => handle?.isReady === true);

    expect(piMocks.open).toHaveBeenCalledWith(
      expect.objectContaining({
        initialModelPolicy: expect.objectContaining({
          'agent.main': expect.objectContaining({ execution: 'pi' }),
          'image.generate': expect.objectContaining({
            execution: 'domain',
            model: expect.objectContaining({ id: 'image-config' }),
          }),
        }),
      }),
    );

    await handle!.submit('Inspect image');

    expect(piMocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityTools: expect.any(Array),
      }),
    );
    const executeInput = piMocks.execute.mock.calls[0]?.[0] as PiExecuteInput & {
      readonly modelPolicy: Readonly<Record<string, { readonly execution: string }>>;
      readonly capabilityTools: readonly {
        readonly name: string;
        readonly modelPurpose?: string;
        readonly execute: Function;
      }[];
    };
    expect(executeInput.capabilityTools.length).toBeGreaterThan(0);
    expect(executeInput.modelPolicy['image.understand']).toBeUndefined();
    expect(executeInput.modelPolicy).toMatchObject({
      'image.generate': { execution: 'domain' },
    });
    expect(legacyMocks.createAgentRuntimeSession).not.toHaveBeenCalled();
  });

  it('rejects an incomplete provider projection instead of falling back to provider type', async () => {
    let handle: AgentSessionHandle | undefined;
    renderProbe({ ...validConfig(), protocolProfile: undefined }, (session) => {
      handle = session;
    });

    await waitFor(() => currentRuntime().conversation.stores.agent.getState().status === 'error');

    expect(handle?.isReady).not.toBe(true);
    expect(currentRuntime().conversation.stores.agent.getState().error?.message).toContain(
      'no explicit Pi protocol profile',
    );
    expect(legacyMocks.createAgentRuntimeSession).not.toHaveBeenCalled();
  });

  it('preserves an Anthropic numeric thinking budget in the flat main-model entry', async () => {
    let handle: AgentSessionHandle | undefined;
    renderProbe({ ...validConfig(), thinkingBudget: 1_024 }, (session) => {
      handle = session;
    });

    await waitFor(() => handle?.isReady === true);

    expect(piMocks.open).toHaveBeenCalledWith(
      expect.objectContaining({
        initialModelPolicy: expect.objectContaining({
          'agent.main': expect.objectContaining({
            parameters: expect.objectContaining({
              thinkingLevel: 'medium',
              thinkingBudgets: { medium: 1_024 },
            }),
          }),
        }),
      }),
    );
    expect(legacyMocks.createAgentRuntimeSession).not.toHaveBeenCalled();
  });

  it('routes token inspection and manual compaction through Pi primitives', async () => {
    let handle: AgentSessionHandle | undefined;
    renderProbe(validConfig(), (session) => {
      handle = session;
    });
    await waitFor(() => handle?.isReady === true);

    expect(handle!.getContextTokenCount()).toBe(321);
    await expect(handle!.compactContext()).resolves.toEqual({
      originalTokens: 321,
      compressedTokens: 123,
      ratio: 123 / 321,
    });
    expect(piMocks.compactContext).toHaveBeenCalledWith({
      reserveTokens: 16_384,
      keepRecentTokens: 20_000,
    });
  });

  it('fails an explicit resume when the Pi conversation catalog has no matching record', async () => {
    let handle: AgentSessionHandle | undefined;
    const missingConversationId = createTuiConversationId(tempRoot);
    renderProbe(
      validConfig(),
      (session) => {
        handle = session;
      },
      missingConversationId,
    );

    await waitFor(() => currentRuntime().conversation.stores.agent.getState().status === 'error');

    expect(handle?.isReady).not.toBe(true);
    expect(currentRuntime().conversation.stores.agent.getState().error?.message).toContain(
      'was not found',
    );
    expect(piMocks.open).not.toHaveBeenCalled();
  });
});

interface PiExecuteInput {
  readonly turnId: string;
  readonly runId: string;
  readonly prompt: string;
  readonly events: PiProductEventSink;
  readonly capabilityTools: readonly PiCapabilityTool[];
  readonly permissionPolicy: PiToolPermissionPolicy;
}

function createPiRuntimeDouble(): object {
  return {
    get isBusy() {
      return piMocks.busy;
    },
    get messages() {
      return piMocks.messages;
    },
    get contextTokenCount() {
      return piMocks.contextTokenCount;
    },
    execute: piMocks.execute,
    executeSkill: piMocks.executeSkill,
    cancel: piMocks.cancel,
    clearContext: piMocks.clearContext,
    compactContext: piMocks.compactContext,
    updateConversationTitle: piMocks.updateConversationTitle,
    dispose: piMocks.dispose,
  };
}

function createIdentity(input: PiExecuteInput) {
  const current = currentRuntime();
  const conversationId = current.conversation.conversationId;
  if (!conversationId) throw new Error('Test runtime has no bound conversation id.');
  return {
    workspaceId: current.conversation.runtimeId,
    conversationId,
    branchId: 'main',
    turnId: input.turnId,
    runId: input.runId,
  };
}

async function emit(sink: PiProductEventSink, event: PiProductAgentEvent): Promise<void> {
  await sink.emit(event);
}

function validConfig(): CLIConfig {
  return {
    ...DEFAULT_CLI_CONFIG,
    workDir: tempRoot,
    providerRequiresApiKey: false,
  };
}

function renderProbe(
  config: CLIConfig,
  onReady: (handle: AgentSessionHandle) => void,
  resumeConversationId?: string,
): void {
  runtime = createTuiTestRuntime(
    config,
    resumeConversationId ?? createTuiConversationId(config.workDir),
  );
  render(
    React.createElement(TuiApplicationRuntimeProvider, {
      runtime: runtime.application,
      children: React.createElement(SessionProbe, {
        config,
        onReady,
        ...(resumeConversationId === undefined ? {} : { resumeConversationId }),
      }),
    }),
  );
}

function currentRuntime(): TuiTestRuntime {
  if (!runtime) throw new Error('Test runtime is not initialized.');
  return runtime;
}

function SessionProbe(props: {
  readonly config: CLIConfig;
  readonly onReady: (handle: AgentSessionHandle) => void;
  readonly resumeConversationId?: string;
}): React.JSX.Element {
  const session = useAgentSession({
    config: props.config,
    presentation: createTestAgentTerminalPresentation('en'),
    promptLocale: 'en',
    service: createNoopService(),
    capabilityProviders: [],
    createLocalMetadata: createMemoryLocalMetadataBinding,
    localMetadataHome: props.config.workDir,
    ...(props.resumeConversationId === undefined
      ? {}
      : { resumeConversationId: props.resumeConversationId }),
  });

  useEffect(() => {
    props.onReady(session);
  }, [props, session]);

  return React.createElement(Text, null, 'pi-runtime-probe');
}

function createNoopService(): IService {
  return {
    async chat() {
      throw new Error('Legacy IService chat must not be reached.');
    },
    async *chatStream() {
      throw new Error('Legacy IService chatStream must not be reached.');
    },
    async embed(texts: string[]) {
      return { embeddings: texts.map(() => []) };
    },
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `Timed out waiting for Pi runtime: ${runtime?.conversation.stores.agent.getState().error?.message ?? 'no diagnostic'}`,
  );
}
