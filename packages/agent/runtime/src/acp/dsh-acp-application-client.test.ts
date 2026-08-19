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
    executeGenerationTool: vi.fn(
      async (_request: DshAcpDomainToolRequest, _signal: AbortSignal) => ({
        outcome: 'success' as const,
        result: {},
      }),
    ),
    executeCanvasTool: vi.fn(async (_request: DshAcpDomainToolRequest, _signal: AbortSignal) => ({
      outcome: 'success' as const,
      result: {},
    })),
    executeCutTool: vi.fn(async (_request: DshAcpDomainToolRequest, _signal: AbortSignal) => ({
      outcome: 'success' as const,
      result: {},
    })),
    executeDocumentTool: vi.fn(async (_request: DshAcpDomainToolRequest, _signal: AbortSignal) => ({
      outcome: 'success' as const,
      result: {},
    })),
    executeCharacterTool: vi.fn(
      async (_request: DshAcpDomainToolRequest, _signal: AbortSignal) => ({
        outcome: 'success' as const,
        result: {},
      }),
    ),
    onSessionUpdate: vi.fn(),
    onSessionEvent: vi.fn(),
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
    await client.createSession({ mcpServers: [] });
    await client.loadSession({ sessionId: 'session-1', mcpServers: [] });
    await client.resumeSession({ sessionId: 'session-1', mcpServers: [] });
    await client.closeSession('session-1');
    await client.setSessionMode({ sessionId: 'session-1', modeId: 'auto' });
    await client.setSessionConfigOption({
      sessionId: 'session-1',
      configId: 'model',
      value: '["deepseek-official","deepseek-v4",8192]',
    });
    const leakedCwd = '/Users/private/real-workspace';
    await client.createSession({ mcpServers: [], cwd: leakedCwd } as never);
    await client.listSessions({ cwd: leakedCwd } as never);
    await client.loadSession({ sessionId: 'session-1', mcpServers: [], cwd: leakedCwd } as never);
    await client.resumeSession({
      sessionId: 'session-1',
      mcpServers: [],
      cwd: leakedCwd,
    } as never);

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
    for (const request of [
      fixture.connection.newSession,
      fixture.connection.listSessions,
      fixture.connection.loadSession,
      fixture.connection.resumeSession,
    ]) {
      expect(request).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/virtual/workspace' }));
      expect(JSON.stringify(request.mock.calls)).not.toContain(leakedCwd);
    }
  });

  it('routes only the two frozen exact domain tools and one notification', async () => {
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
      tool: 'openneko.generation',
      operation: 'submit',
      input: {},
    });
    await protocolClient.extMethod?.('openneko/domain-tool/execute', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-canvas',
      tool: 'openneko.canvas',
      operation: 'query',
      input: {},
    });
    await protocolClient.extMethod?.('openneko/domain-tool/execute', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-cut',
      tool: 'openneko.cut',
      operation: 'query',
      input: {},
    });
    await protocolClient.extNotification?.('openneko/session/event', {
      sessionId: 'session-1',
      sequence: 4,
      time: 1_004,
      type: 'tool/call',
      data: {},
    });

    expect(handlers.executeGenerationTool).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', toolCallId: 'call-generation' }),
      expect.any(AbortSignal),
    );
    expect(handlers.executeCanvasTool).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', toolCallId: 'call-canvas' }),
      expect.any(AbortSignal),
    );
    expect(handlers.executeCutTool).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', toolCallId: 'call-cut' }),
      expect.any(AbortSignal),
    );
    expect(handlers.onSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', sequence: 4 }),
    );
    await expect(
      protocolClient.extMethod?.('openneko/domain-tool/execute', {
        sessionId: 'session-1',
        turn: 0,
        toolCallId: 'call-unknown',
        tool: 'openneko.unknown',
        operation: 'run',
        input: {},
      }),
    ).rejects.toThrow(/unsupported domain tool/);
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

    await protocolClient.extNotification?.('openneko/session/event', {
      sessionId: 's1',
      sequence: 0,
      time: 1_000,
      type: 'turn/start',
      data: { turn: 0 },
    });
    await protocolClient.sessionUpdate?.({
      sessionId: 's1',
      _meta: { opennekoSequence: 1, opennekoTurn: 0 },
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
      _meta: { opennekoSequence: 2, opennekoTurn: 0 },
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
        _meta: { opennekoSequence: 1, opennekoTurn: -1 },
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
      }),
    ).rejects.toThrow(/projection rejected session event/);
    expect(handlers.onSessionEvent).not.toHaveBeenCalled();
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
    vi.mocked(handlers.executeGenerationTool).mockImplementation((_request, signal) => {
      handlerSignal = signal;
      return generation.promise;
    });

    const execution = protocolClient.extMethod?.('openneko/domain-tool/execute', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-cancel',
      tool: 'openneko.generation',
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
    vi.mocked(handlers.executeCanvasTool).mockImplementation((_request, signal) => {
      canvasSignal = signal;
      return canvas.promise;
    });

    const execution = protocolClient.extMethod?.('openneko/domain-tool/execute', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-canvas',
      tool: 'openneko.canvas',
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
    vi.mocked(handlers.executeGenerationTool).mockImplementation(() => generation.promise);

    const first = protocolClient.extMethod?.('openneko/domain-tool/execute', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-duplicate',
      tool: 'openneko.generation',
      operation: 'submit',
      input: {},
    });
    await expect(
      protocolClient.extMethod?.('openneko/domain-tool/execute', {
        sessionId: 'session-1',
        turn: 0,
        toolCallId: 'call-duplicate',
        tool: 'openneko.generation',
        operation: 'submit',
        input: {},
      }),
    ).rejects.toThrow(/already in flight/);
    expect(handlers.executeGenerationTool).toHaveBeenCalledTimes(1);

    generation.resolve({ outcome: 'success', result: {} });
    await expect(first).resolves.toEqual({ outcome: 'success', result: {} });

    const pending = new Map<string, Deferred<DshAcpDomainToolResponse>>();
    const started: string[] = [];
    vi.mocked(handlers.executeGenerationTool).mockImplementation(async (request) => {
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
        tool: 'openneko.generation',
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
    vi.mocked(handlers.executeGenerationTool).mockImplementation(() => active.promise);

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
    vi.mocked(handlers.executeGenerationTool).mockImplementation((_request, signal) => {
      handlerSignal = signal;
      return generation.promise;
    });
    const execution = protocolClient.extMethod?.('openneko/domain-tool/execute', {
      sessionId: 'session-1',
      turn: 0,
      toolCallId: 'call-connection-close',
      tool: 'openneko.generation',
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
