import type {
  Client,
  InitializeResponse,
  RequestPermissionResponse,
} from '@agentclientprotocol/sdk';
import { describe, expect, it, vi } from 'vitest';

import type {
  DshAcpDomainToolRequest,
  DshAcpDomainToolResponse,
} from '@neko/agent-contracts/dsh-acp';

import {
  DshAcpApplicationClient,
  type DshAcpApplicationClientHandlers,
  type DshAcpByteTransport,
  type DshAcpConnection,
} from './dsh-acp-application-client';
import { DshAcpProjection } from './dsh-acp-projection';

const unusedTransport = {} as DshAcpByteTransport;

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createHandlers(): DshAcpApplicationClientHandlers {
  return {
    requestPermission: vi.fn<() => Promise<RequestPermissionResponse>>(),
    executeDomainTool: vi.fn(async (_request: DshAcpDomainToolRequest, _signal: AbortSignal) => ({
      outcome: 'success' as const,
      result: {},
    })),
    onSessionUpdate: vi.fn(),
    onSessionEvent: vi.fn(),
    onContextPressure: vi.fn(),
  };
}

function createFixture(initializeResponse: InitializeResponse) {
  const abortController = new AbortController();
  let protocolClient: Client | undefined;
  const connection: DshAcpConnection = {
    signal: abortController.signal,
    closed: Promise.resolve(),
    initialize: vi.fn(async () => initializeResponse),
    newSession: vi.fn(async () => ({ sessionId: 'session-new' })),
    listSessions: vi.fn(async () => ({ sessions: [] })),
    loadSession: vi.fn(async () => ({})),
    resumeSession: vi.fn(async () => ({})),
    closeSession: vi.fn(async () => ({})),
    setSessionMode: vi.fn(async () => ({})),
    setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
    prompt: vi.fn(async () => ({ stopReason: 'end_turn' })),
    cancel: vi.fn(async () => undefined),
    extMethod: vi.fn(async () => ({ nextTurn: [], nextStep: [] })),
  };
  const createConnection = (client: Client): DshAcpConnection => {
    protocolClient = client;
    return connection;
  };
  return {
    connection,
    createConnection,
    readProtocolClient: (): Client => {
      if (protocolClient === undefined) throw new Error('Protocol client is not connected.');
      return protocolClient;
    },
  };
}

describe('DshAcpApplicationClient', () => {
  it('reads the DSH-owned Provider capability projection', async () => {
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    fixture.connection.extMethod = vi.fn(async () => ({
      providers: [
        {
          providerId: 'openai',
          displayName: 'OpenAI',
          settingsNamespace: 'llm-pi-ai',
          settingsPath: ['providers', 'openai'],
          source: 'catalog',
        },
      ],
      protocols: ['openai-completions'],
      diagnostics: [],
    }));
    const client = await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers: createHandlers(),
      createConnection: fixture.createConnection,
    });

    await expect(client.readProviderCapabilities()).resolves.toMatchObject({
      providers: [{ providerId: 'openai' }],
      protocols: ['openai-completions'],
    });
    expect(fixture.connection.extMethod).toHaveBeenCalledWith(
      'openneko/providers/capabilities/read',
      {},
    );
  });

  it('dispatches exact Skill and MCP lifecycle extension methods', async () => {
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    fixture.connection.extMethod = vi.fn(async () => ({}));
    const client = await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers: createHandlers(),
      createConnection: fixture.createConnection,
    });

    await client.setSkillEnabled({ name: 'review', source: 'user-dsh', enabled: false });
    await client.removeSkill({ name: 'review', source: 'user-dsh' });
    await client.addMcp({
      serverName: 'filesystem',
      description: 'Approved files',
      transport: 'stdio',
      command: 'mcp-filesystem',
      args: ['--readonly'],
    });
    await client.setMcpEnabled({ id: 'openneko-mcp-filesystem', enabled: false });
    await client.removeMcp('openneko-mcp-filesystem');

    expect(fixture.connection.extMethod).toHaveBeenNthCalledWith(
      1,
      'openneko/extensions/skill/enabled/set',
      { name: 'review', source: 'user-dsh', enabled: false },
    );
    expect(fixture.connection.extMethod).toHaveBeenNthCalledWith(
      2,
      'openneko/extensions/skill/remove',
      { name: 'review', source: 'user-dsh' },
    );
    expect(fixture.connection.extMethod).toHaveBeenNthCalledWith(3, 'openneko/extensions/mcp/add', {
      serverName: 'filesystem',
      description: 'Approved files',
      transport: 'stdio',
      command: 'mcp-filesystem',
      args: ['--readonly'],
    });
    expect(fixture.connection.extMethod).toHaveBeenNthCalledWith(
      4,
      'openneko/extensions/mcp/enabled/set',
      { id: 'openneko-mcp-filesystem', enabled: false },
    );
    expect(fixture.connection.extMethod).toHaveBeenNthCalledWith(
      5,
      'openneko/extensions/mcp/remove',
      { id: 'openneko-mcp-filesystem' },
    );
  });

  it('reads one exact Skill body and fingerprint on demand', async () => {
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    fixture.connection.extMethod = vi.fn(async () => ({
      name: 'review',
      description: 'Review drafts.',
      source: 'user-dsh',
      provider: 'filesystem',
      userInvocable: true,
      modelInvocable: true,
      content: '# Review',
      fingerprint: `sha256:${'b'.repeat(64)}`,
    }));
    const client = await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers: createHandlers(),
      createConnection: fixture.createConnection,
    });

    await expect(
      client.readSkillDetail({ name: 'review', source: 'user-dsh' }),
    ).resolves.toMatchObject({ content: '# Review' });
    expect(fixture.connection.extMethod).toHaveBeenCalledWith(
      'openneko/extensions/skill/detail/read',
      { name: 'review', source: 'user-dsh' },
    );
  });

  it('uses private extension methods for isolated staged validation and exact scoped observation', async () => {
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    fixture.connection.extMethod = vi.fn(async (method) => {
      if (method === 'openneko/skill-authoring/staged/validate') {
        return { name: 'created-skill' };
      }
      if (method === 'openneko/skill-authoring/observe') {
        return {
          complete: true,
          skill: {
            name: 'created-skill',
            source: 'project-agents',
            provider: 'local',
            userInvocable: true,
            modelInvocable: true,
          },
        };
      }
      throw new Error(`Unexpected extension method ${method}.`);
    });
    const client = await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers: createHandlers(),
      createConnection: fixture.createConnection,
    });

    await expect(
      client.validateStagedSkill({
        stagingRoot: '/private/staging',
        layout: 'directory',
        entry: 'candidate/SKILL.md',
      }),
    ).resolves.toEqual({ name: 'created-skill' });
    await expect(
      client.observeSkill({ sessionId: 'session-1', name: 'created-skill' }),
    ).resolves.toMatchObject({ complete: true, skill: { source: 'project-agents' } });
    expect(fixture.connection.extMethod).toHaveBeenNthCalledWith(
      1,
      'openneko/skill-authoring/staged/validate',
      {
        stagingRoot: '/private/staging',
        layout: 'directory',
        entry: 'candidate/SKILL.md',
      },
    );
    expect(fixture.connection.extMethod).toHaveBeenNthCalledWith(
      2,
      'openneko/skill-authoring/observe',
      { sessionId: 'session-1', name: 'created-skill' },
    );
  });

  it('archives one exact Session and reads the strict DSH archive projection', async () => {
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    fixture.connection.extMethod = vi.fn(async (method) => {
      if (method === 'openneko/session/archive') return { sessionIds: ['session-1'] };
      if (method === 'openneko/session/archive/read') return { sessionIds: ['session-1'] };
      throw new Error(`Unexpected extension method ${method}.`);
    });
    const client = await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers: createHandlers(),
      createConnection: fixture.createConnection,
    });

    await expect(client.archiveSession('session-1')).resolves.toEqual({
      sessionIds: ['session-1'],
    });
    await expect(client.readArchivedSessions()).resolves.toEqual({
      sessionIds: ['session-1'],
    });
    expect(fixture.connection.extMethod).toHaveBeenNthCalledWith(1, 'openneko/session/archive', {
      sessionId: 'session-1',
    });
    expect(fixture.connection.extMethod).toHaveBeenNthCalledWith(
      2,
      'openneko/session/archive/read',
      {},
    );
  });

  it('reads the canonical input catalog with and without an exact Session identity', async () => {
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    fixture.connection.extMethod = vi.fn(async (method) => {
      if (method !== 'openneko/session/input-catalog/read') {
        throw new Error(`Unexpected extension method ${method}.`);
      }
      return { commands: [], skills: [], skillsComplete: true };
    });
    const client = await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers: createHandlers(),
      createConnection: fixture.createConnection,
    });

    await expect(client.readInputCatalog({ cwd: '/workspace/draft' })).resolves.toEqual({
      commands: [],
      skills: [],
      skillsComplete: true,
    });
    await expect(client.readInputCatalog({ sessionId: 'session-1' })).resolves.toEqual({
      commands: [],
      skills: [],
      skillsComplete: true,
    });
    expect(fixture.connection.extMethod).toHaveBeenNthCalledWith(
      1,
      'openneko/session/input-catalog/read',
      { cwd: '/workspace/draft' },
    );
    expect(fixture.connection.extMethod).toHaveBeenNthCalledWith(
      2,
      'openneko/session/input-catalog/read',
      { sessionId: 'session-1' },
    );
  });

  it('sends one exact inbox enqueue extension request and decodes its DSH snapshot', async () => {
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    const client = await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers: createHandlers(),
      createConnection: fixture.createConnection,
    });

    await expect(
      client.enqueueInboxMessage({
        sessionId: 'session-1',
        prompt: [{ type: 'text', text: 'next' }],
        displayContent: [{ type: 'text', text: 'next' }],
        contextText: 'workspace context',
        configuration: {
          model: '["openai","gpt-5",8192]',
          permissionPresetId: 'workspace-write',
        },
      }),
    ).resolves.toEqual({ nextTurn: [], nextStep: [] });
    expect(fixture.connection.extMethod).toHaveBeenCalledWith('openneko/session/inbox/enqueue', {
      sessionId: 'session-1',
      prompt: [{ type: 'text', text: 'next' }],
      displayContent: [{ type: 'text', text: 'next' }],
      contextText: 'workspace context',
      configuration: {
        model: '["openai","gpt-5",8192]',
        permissionPresetId: 'workspace-write',
      },
    });
  });

  it('sends one exact inbox send-now extension request and decodes its DSH snapshot', async () => {
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    const client = await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers: createHandlers(),
      createConnection: fixture.createConnection,
    });

    await expect(
      client.sendInboxMessageNow({ sessionId: 'session-1', messageId: 'message-1' }),
    ).resolves.toEqual({ nextTurn: [], nextStep: [] });
    expect(fixture.connection.extMethod).toHaveBeenCalledWith('openneko/session/inbox/send-now', {
      sessionId: 'session-1',
      messageId: 'message-1',
    });
  });

  it('reads one exact native image attachment through the bounded ACP extension', async () => {
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    fixture.connection.extMethod = vi.fn(async () => ({
      attachment: {
        attachmentId: 'attachment-1',
        mediaType: 'image/png',
        bytes: 4,
        width: 1,
        height: 1,
      },
      data: 'YWJjZA==',
    }));
    const client = await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers: createHandlers(),
      createConnection: fixture.createConnection,
    });

    await expect(
      client.readImageAttachment({ sessionId: 'session-1', attachmentId: 'attachment-1' }),
    ).resolves.toMatchObject({ attachment: { bytes: 4 }, data: 'YWJjZA==' });
    expect(fixture.connection.extMethod).toHaveBeenCalledWith(
      'openneko/session/attachment/image/read',
      { sessionId: 'session-1', attachmentId: 'attachment-1' },
    );
  });

  it('blocks session recovery when the exact ACP capability is absent', async () => {
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    await expect(
      DshAcpApplicationClient.connect({
        transport: unusedTransport,
        virtualCwd: 'workspace',
        handlers: createHandlers(),
        createConnection: fixture.createConnection,
      }),
    ).rejects.toThrow(/virtual cwd must be absolute/u);
    expect(fixture.connection.initialize).not.toHaveBeenCalled();
    const client = await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers: createHandlers(),
      createConnection: fixture.createConnection,
    });

    await expect(client.listSessions()).rejects.toThrow(/did not advertise.*session\/list/);
    await expect(client.loadSession({ sessionId: 'session-1', mcpServers: [] })).rejects.toThrow(
      /did not advertise.*session\/load/,
    );
    expect(fixture.connection.listSessions).not.toHaveBeenCalled();
    expect(fixture.connection.loadSession).not.toHaveBeenCalled();
  });

  it('uses standard ACP session methods when the bridge advertises them', async () => {
    const fixture = createFixture({
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        sessionCapabilities: { list: {}, resume: {}, close: {} },
      },
    });
    const client = await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers: createHandlers(),
      createConnection: fixture.createConnection,
    });

    await client.listSessions();
    await client.createSession({ mcpServers: [], cwd: '/virtual/workspace' });
    await client.loadSession({
      sessionId: 'session-1',
      mcpServers: [],
      cwd: '/virtual/workspace',
    });
    await client.resumeSession({
      sessionId: 'session-1',
      mcpServers: [],
      cwd: '/virtual/workspace',
    });
    await client.closeSession('session-1');
    await client.setSessionMode({ sessionId: 'session-1', modeId: 'auto' });
    await client.setSessionConfigOption({
      sessionId: 'session-1',
      configId: 'model',
      value: '["deepseek-official","deepseek-v4",8192]',
    });
    const sessionCwd = '/Users/private/real-workspace';
    await client.createSession({ mcpServers: [], cwd: sessionCwd });
    await client.listSessions({ cwd: sessionCwd } as never);
    await client.loadSession({ sessionId: 'session-1', mcpServers: [], cwd: sessionCwd });
    await client.resumeSession({
      sessionId: 'session-1',
      mcpServers: [],
      cwd: sessionCwd,
    });

    expect(fixture.connection.newSession).toHaveBeenCalledWith({
      cwd: '/virtual/workspace',
      mcpServers: [],
    });
    expect(fixture.connection.listSessions).toHaveBeenCalledWith({ cwd: '/virtual/workspace' });
    expect(fixture.connection.loadSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      cwd: '/virtual/workspace',
      mcpServers: [],
    });
    expect(fixture.connection.resumeSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      cwd: '/virtual/workspace',
      mcpServers: [],
    });
    expect(fixture.connection.closeSession).toHaveBeenCalledWith({ sessionId: 'session-1' });
    expect(fixture.connection.setSessionMode).toHaveBeenCalledWith({
      sessionId: 'session-1',
      modeId: 'auto',
    });
    expect(fixture.connection.setSessionConfigOption).toHaveBeenCalledWith({
      sessionId: 'session-1',
      configId: 'model',
      value: '["deepseek-official","deepseek-v4",8192]',
    });
    expect(fixture.connection.newSession).toHaveBeenLastCalledWith({
      mcpServers: [],
      cwd: sessionCwd,
    });
    expect(fixture.connection.loadSession).toHaveBeenLastCalledWith({
      sessionId: 'session-1',
      mcpServers: [],
      cwd: sessionCwd,
    });
    expect(fixture.connection.resumeSession).toHaveBeenLastCalledWith({
      sessionId: 'session-1',
      mcpServers: [],
      cwd: sessionCwd,
    });
    expect(fixture.connection.listSessions).toHaveBeenLastCalledWith({
      cwd: '/virtual/workspace',
    });
  });

  it('delegates domain tools without interpreting domain identities and routes one notification', async () => {
    const handlers = createHandlers();
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers,
      createConnection: fixture.createConnection,
    });
    const protocolClient = fixture.readProtocolClient();

    await protocolClient.extMethod?.('openneko/domain-tool/execute', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-generation',
      sandboxMode: 'workspace-write',
      tool: 'openneko_generation',
      operation: 'submit',
      input: {},
    });
    await protocolClient.extMethod?.('openneko/domain-tool/execute', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-skill-authoring',
      sandboxMode: 'workspace-write',
      tool: 'CreateSkill',
      operation: 'create',
      input: { layout: 'directory', skillMarkdown: '# Skill', resources: [] },
    });
    await protocolClient.extMethod?.('openneko/domain-tool/execute', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-content-image',
      sandboxMode: 'read-only',
      tool: 'openneko_read_image',
      operation: 'read-chunk',
      input: {
        source: {
          file: { authority: 'workspace', path: 'story.epub' },
          selector: { kind: 'entry', path: 'OEBPS/page.png' },
        },
        offset: 0,
      },
    });
    await protocolClient.extMethod?.('openneko/domain-tool/execute', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-canvas',
      sandboxMode: 'read-only',
      tool: 'openneko_canvas',
      operation: 'query',
      input: {},
    });
    await protocolClient.extMethod?.('openneko/domain-tool/execute', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-cut',
      sandboxMode: 'read-only',
      tool: 'openneko_cut',
      operation: 'query',
      input: {},
    });
    await protocolClient.extNotification?.('openneko/session/event', {
      sessionId: 'session-1',
      sequence: 4,
      time: 1_004,
      type: 'tool/call',
      data: {},
      replay: false,
    });

    expect(handlers.executeDomainTool).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', toolCallId: 'call-generation' }),
      expect.any(AbortSignal),
    );
    expect(handlers.executeDomainTool).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', toolCallId: 'call-canvas' }),
      expect.any(AbortSignal),
    );
    expect(handlers.executeDomainTool).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', toolCallId: 'call-cut' }),
      expect.any(AbortSignal),
    );
    expect(handlers.executeDomainTool).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', toolCallId: 'call-content-image' }),
      expect.any(AbortSignal),
    );
    expect(handlers.executeDomainTool).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', toolCallId: 'call-skill-authoring' }),
      expect.any(AbortSignal),
    );
    expect(handlers.onSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', sequence: 4, replay: false }),
    );
    await expect(
      protocolClient.extMethod?.('openneko/domain-tool/execute', {
        sessionId: 'session-1',
        turn: 0,
        toolCallId: 'call-domain-extension',
        sandboxMode: 'read-only',
        tool: 'openneko_domain_extension',
        operation: 'query',
        input: {},
      }),
    ).resolves.toEqual({ outcome: 'success', result: {} });
    expect(handlers.executeDomainTool).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'openneko_domain_extension' }),
      expect.any(AbortSignal),
    );
    await expect(protocolClient.extMethod?.('unknown/execute', {})).rejects.toThrow(
      /unsupported Host extension method/,
    );
  });

  it('feeds the package-owned projection from session updates, events, and permissions', async () => {
    const projection = new DshAcpProjection();
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    const handlers = createHandlers();
    await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers,
      projection,
      createConnection: fixture.createConnection,
    });
    const protocolClient = fixture.readProtocolClient();

    await protocolClient.extNotification?.('openneko/session/context-pressure', {
      sessionId: 's1',
      sourceSequence: 0,
      pressure: { pressureTokens: 20_000, projectedTokens: 22_000, contextWindow: 256_000 },
    });
    expect(handlers.onContextPressure).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', sourceSequence: 0 }),
    );
    expect(projection.snapshot('s1').contextPressure).toEqual({
      pressureTokens: 20_000,
      projectedTokens: 22_000,
      contextWindow: 256_000,
    });

    await protocolClient.extNotification?.('openneko/session/event', {
      sessionId: 's1',
      sequence: 0,
      time: 1_000,
      type: 'turn/start',
      data: { turn: 0 },
      replay: false,
    });
    await protocolClient.sessionUpdate?.({
      sessionId: 's1',
      _meta: { opennekoSequence: 1, opennekoTurn: 0, opennekoReplay: false },
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'call-1',
        title: 'tool-call-1',
        status: 'pending',
      },
    });
    await protocolClient.requestPermission?.({
      sessionId: 's1',
      toolCall: { toolCallId: 'call-1', title: 'tool-call-1' },
      options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
    });
    expect(handlers.requestPermission).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1' }),
      { sessionId: 's1', turn: 0, toolCallId: 'call-1' },
    );
    await protocolClient.sessionUpdate?.({
      sessionId: 's1',
      _meta: { opennekoSequence: 2, opennekoTurn: 0, opennekoReplay: false },
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call-1',
        status: 'completed',
      },
    });

    expect(projection.snapshot('s1').tools).toEqual([
      expect.objectContaining({ toolCallId: 'call-1', turn: 0, status: 'completed' }),
    ]);
    const projected = projection
      .snapshot('s1')
      .events.filter((event) => event.kind === 'tool' || event.kind === 'permission');
    expect(projected).toHaveLength(3);
    expect(projected[1]).toMatchObject({
      kind: 'permission',
      sessionId: 's1',
      toolCallId: 'call-1',
      turn: 0,
    });
    expect(projected[2]).toMatchObject({ kind: 'tool', status: 'completed', turn: 0 });
    expect(handlers.onSessionUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ sessionId: 's1' }),
      { replay: false },
    );
  });

  it('forwards explicit replay identity and rejects an unclassified standard update', async () => {
    const handlers = createHandlers();
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers,
      createConnection: fixture.createConnection,
    });
    const protocolClient = fixture.readProtocolClient();

    await protocolClient.sessionUpdate?.({
      sessionId: 's1',
      _meta: { opennekoSequence: 0, opennekoReplay: true },
      update: {
        sessionUpdate: 'user_message_chunk',
        messageId: 'message-1',
        content: { type: 'text', text: 'Replayed.' },
      },
    });
    expect(handlers.onSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1' }),
      { replay: true },
    );

    await protocolClient.extNotification?.('openneko/session/event', {
      sessionId: 's1',
      sequence: 1,
      time: 1_001,
      type: 'turn/start',
      data: { turn: 0 },
      replay: true,
    });
    expect(handlers.onSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', replay: true }),
    );

    await expect(
      protocolClient.sessionUpdate?.({
        sessionId: 's1',
        _meta: { opennekoSequence: 2 },
        update: {
          sessionUpdate: 'user_message_chunk',
          messageId: 'message-2',
          content: { type: 'text', text: 'Unclassified.' },
        },
      }),
    ).rejects.toThrow(/opennekoReplay must be a boolean/u);
    expect(handlers.onSessionUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not forward a permission request that the projection cannot correlate', async () => {
    const handlers = createHandlers();
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers,
      createConnection: fixture.createConnection,
    });
    const protocolClient = fixture.readProtocolClient();

    await expect(
      protocolClient.requestPermission?.({
        sessionId: 's1',
        toolCall: { toolCallId: 'call-unknown', title: 'unknown' },
        options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
      }),
    ).rejects.toThrow(/projection rejected permission/);
    expect(handlers.requestPermission).not.toHaveBeenCalled();
  });

  it('does not forward a session update that the projection rejects', async () => {
    const handlers = createHandlers();
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers,
      createConnection: fixture.createConnection,
    });
    const protocolClient = fixture.readProtocolClient();

    await expect(
      protocolClient.sessionUpdate?.({
        sessionId: 's1',
        _meta: { opennekoSequence: 1, opennekoTurn: -1, opennekoReplay: false },
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'call-1',
          title: 'bad',
          status: 'pending',
        },
      }),
    ).rejects.toThrow(/projection rejected session update/);
    expect(handlers.onSessionUpdate).not.toHaveBeenCalled();
  });

  it('does not forward a session event that the projection rejects', async () => {
    const handlers = createHandlers();
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers,
      createConnection: fixture.createConnection,
    });
    const protocolClient = fixture.readProtocolClient();

    await expect(
      protocolClient.extNotification?.('openneko/session/event', {
        sessionId: 's1',
        sequence: 0,
        time: 1_000,
        type: 'turn/start',
        data: { turn: 1.5 },
        replay: false,
      }),
    ).rejects.toThrow(/projection rejected session event/);
    expect(handlers.onSessionEvent).not.toHaveBeenCalled();
  });

  it('forwards an accepted terminal event before reporting its projection diagnostic', async () => {
    const handlers = createHandlers();
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers,
      createConnection: fixture.createConnection,
    });
    const protocolClient = fixture.readProtocolClient();

    await protocolClient.extNotification?.('openneko/session/event', {
      sessionId: 's1',
      sequence: 0,
      time: 1_000,
      type: 'turn/start',
      data: { turn: 0 },
      replay: false,
    });
    await protocolClient.extNotification?.('openneko/session/event', {
      sessionId: 's1',
      sequence: 1,
      time: 1_001,
      type: 'step/start',
      data: { turn: 0, step: 0 },
      replay: false,
    });
    await protocolClient.sessionUpdate?.({
      sessionId: 's1',
      _meta: {
        opennekoSequence: 2,
        opennekoTurn: 0,
        opennekoStep: 0,
        opennekoBlockIndex: 0,
        opennekoMessagePhase: 'delta',
        opennekoReplay: false,
      },
      update: {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'dsh:0:0:text',
        content: { type: 'text', text: 'Partial' },
      },
    });
    await protocolClient.extNotification?.('openneko/session/event', {
      sessionId: 's1',
      sequence: 3,
      time: 1_003,
      type: 'step/end',
      data: { turn: 0, step: 0 },
      replay: false,
    });
    vi.mocked(handlers.onSessionEvent).mockClear();

    const terminal = {
      sessionId: 's1',
      sequence: 4,
      time: 1_004,
      type: 'turn/end',
      data: { turn: 0, reason: { kind: 'completed' } },
      replay: false,
    } as const;
    await expect(
      protocolClient.extNotification?.('openneko/session/event', terminal),
    ).rejects.toThrow(/ACP_PROJECTION_UNSETTLED_ASSISTANT_STREAM/u);
    expect(handlers.onSessionEvent).toHaveBeenCalledOnce();
    expect(handlers.onSessionEvent).toHaveBeenCalledWith(terminal);
  });

  it('cancels the exact inflight Host Tool and rejects a late success', async () => {
    const generation = deferred<DshAcpDomainToolResponse>();
    const handlers = createHandlers();
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers,
      createConnection: fixture.createConnection,
    });
    const protocolClient = fixture.readProtocolClient();
    let handlerSignal: AbortSignal | undefined;
    vi.mocked(handlers.executeDomainTool).mockImplementation((_request, signal) => {
      handlerSignal = signal;
      return generation.promise;
    });

    const execution = protocolClient.extMethod?.('openneko/domain-tool/execute', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-cancel',
      sandboxMode: 'workspace-write',
      tool: 'openneko_generation',
      operation: 'submit',
      input: {},
    });
    await protocolClient.extMethod?.('openneko/domain-tool/cancel', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-cancel',
    });

    expect(handlerSignal?.aborted).toBe(true);
    await expect(execution).rejects.toThrow(/cancelled during execution/);
    generation.resolve({ outcome: 'success', result: { late: true } });
  });

  it('rejects a stale cancel identity without aborting a sibling call', async () => {
    const canvas = deferred<DshAcpDomainToolResponse>();
    const handlers = createHandlers();
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers,
      createConnection: fixture.createConnection,
    });
    const protocolClient = fixture.readProtocolClient();
    let canvasSignal: AbortSignal | undefined;
    vi.mocked(handlers.executeDomainTool).mockImplementation((_request, signal) => {
      canvasSignal = signal;
      return canvas.promise;
    });

    const execution = protocolClient.extMethod?.('openneko/domain-tool/execute', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-canvas',
      sandboxMode: 'read-only',
      tool: 'openneko_canvas',
      operation: 'query',
      input: {},
    });
    await expect(
      protocolClient.extMethod?.('openneko/domain-tool/cancel', {
        sessionId: 'session-1',
        turn: 0,
        toolCallId: 'call-missing',
      }),
    ).rejects.toThrow(/unknown or stale/);
    expect(canvasSignal?.aborted).toBe(false);

    canvas.resolve({ outcome: 'success', result: {} });
    await expect(execution).resolves.toEqual({ outcome: 'success', result: {} });
  });

  it('rejects duplicate identity and applies bounded fair admission across Sessions', async () => {
    const generation = deferred<DshAcpDomainToolResponse>();
    const handlers = createHandlers();
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers,
      createConnection: fixture.createConnection,
    });
    const protocolClient = fixture.readProtocolClient();
    vi.mocked(handlers.executeDomainTool).mockImplementation(() => generation.promise);

    const first = protocolClient.extMethod?.('openneko/domain-tool/execute', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-duplicate',
      sandboxMode: 'workspace-write',
      tool: 'openneko_generation',
      operation: 'submit',
      input: {},
    });
    await expect(
      protocolClient.extMethod?.('openneko/domain-tool/execute', {
        sessionId: 'session-1',
        turn: 0,
        toolCallId: 'call-duplicate',
        sandboxMode: 'workspace-write',
        tool: 'openneko_generation',
        operation: 'submit',
        input: {},
      }),
    ).rejects.toThrow(/already in flight/);
    expect(handlers.executeDomainTool).toHaveBeenCalledTimes(1);

    generation.resolve({ outcome: 'success', result: {} });
    await expect(first).resolves.toEqual({ outcome: 'success', result: {} });

    const pending = new Map<string, Deferred<DshAcpDomainToolResponse>>();
    const started: string[] = [];
    vi.mocked(handlers.executeDomainTool).mockImplementation(async (request) => {
      started.push(request.toolCallId);
      const completion = deferred<DshAcpDomainToolResponse>();
      pending.set(request.toolCallId, completion);
      return completion.promise;
    });
    const execute = (sessionId: string, toolCallId: string) =>
      protocolClient.extMethod?.('openneko/domain-tool/execute', {
        sessionId,
        turn: 0,
        toolCallId,
        sandboxMode: 'workspace-write',
        tool: 'openneko_generation',
        operation: 'submit',
        input: {},
      });

    const firstA = execute('session-a', 'call-a1');
    const firstB = execute('session-b', 'call-b1');
    const secondA = execute('session-a', 'call-a2');
    const firstC = execute('session-c', 'call-c1');
    expect(started).toEqual(['call-a1', 'call-b1']);

    pending.get('call-b1')?.resolve({ outcome: 'success', result: {} });
    await firstB;
    expect(started).toEqual(['call-a1', 'call-b1', 'call-c1']);

    pending.get('call-a1')?.resolve({ outcome: 'success', result: {} });
    await firstA;
    expect(started).toEqual(['call-a1', 'call-b1', 'call-c1', 'call-a2']);

    pending.get('call-c1')?.resolve({ outcome: 'success', result: {} });
    pending.get('call-a2')?.resolve({ outcome: 'success', result: {} });
    await Promise.all([firstC, secondA]);

    const active = deferred<DshAcpDomainToolResponse>();
    vi.mocked(handlers.executeDomainTool).mockImplementation(() => active.promise);

    const activeA = execute('session-a', 'call-a0');
    const activeB = execute('session-b', 'call-b0');
    const queuedA = Array.from({ length: 8 }, (_, index) =>
      execute('session-a', `call-a${index + 1}`),
    );
    await expect(execute('session-a', 'call-a9')).rejects.toThrow(
      /queue limit exceeded.*session-a/,
    );
    const sibling = execute('session-c', 'call-c0');

    fixture.connection.signal.dispatchEvent(new Event('abort'));
    active.resolve({ outcome: 'success', result: {} });
    const settled = await Promise.allSettled([activeA, activeB, ...queuedA, sibling]);
    expect(settled).toHaveLength(11);
    expect(settled.every((result) => result.status === 'rejected')).toBe(true);
  });

  it('aborts all inflight Host Tools when the ACP connection closes', async () => {
    const generation = deferred<DshAcpDomainToolResponse>();
    const handlers = createHandlers();
    const fixture = createFixture({ protocolVersion: 1, agentCapabilities: {} });
    await DshAcpApplicationClient.connect({
      transport: unusedTransport,
      virtualCwd: '/virtual/workspace',
      handlers,
      createConnection: fixture.createConnection,
    });
    const protocolClient = fixture.readProtocolClient();
    let handlerSignal: AbortSignal | undefined;
    vi.mocked(handlers.executeDomainTool).mockImplementation((_request, signal) => {
      handlerSignal = signal;
      return generation.promise;
    });
    const execution = protocolClient.extMethod?.('openneko/domain-tool/execute', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-connection-close',
      sandboxMode: 'workspace-write',
      tool: 'openneko_generation',
      operation: 'submit',
      input: {},
    });

    fixture.connection.signal.dispatchEvent(new Event('abort'));
    expect(handlerSignal?.aborted).toBe(true);
    await expect(execution).rejects.toThrow(/cancelled during execution/);
    await expect(
      protocolClient.extMethod?.('openneko/domain-tool/cancel', {
        sessionId: 'session-1',
        turn: 0,
        toolCallId: 'call-connection-close',
      }),
    ).rejects.toThrow(/unknown or stale/);
    generation.resolve({ outcome: 'success', result: {} });
  });

  it('rejects an unsupported negotiated ACP protocol', async () => {
    const fixture = createFixture({ protocolVersion: 2, agentCapabilities: {} });
    await expect(
      DshAcpApplicationClient.connect({
        transport: unusedTransport,
        virtualCwd: '/virtual/workspace',
        handlers: createHandlers(),
        createConnection: fixture.createConnection,
      }),
    ).rejects.toThrow(/negotiated unsupported protocol/);
  });
});
