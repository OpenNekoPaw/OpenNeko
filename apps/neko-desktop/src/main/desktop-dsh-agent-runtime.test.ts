import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  ConversationDshSessionAcpClient,
  DshSessionCatalogAcpClient,
} from '@neko/agent-runtime/application';
import type {
  DshAcpApplicationClientHandlers,
  DshAcpApplicationClientOptions,
  DshAcpByteTransport,
} from '@neko/agent-runtime/acp';
import { DshAcpProjection } from '@neko/agent-runtime/acp';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  startDesktopDshAgentRuntime,
  type DesktopDshAgentClient,
} from './desktop-dsh-agent-runtime';
import type {
  DesktopDshSubprocessExit,
  DesktopDshSubprocessHandle,
} from './desktop-dsh-subprocess-supervisor';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop DSH Agent runtime composition', () => {
  it('connects the subprocess transport and persists an exact Conversation binding', async () => {
    const fixture = await createFixture();
    const transport = createTransport();
    const subprocess = createSubprocess(transport);
    const client = createClient(['dsh-session-a']);
    const connectClient = vi.fn(async (_options: DshAcpApplicationClientOptions) => client);
    const handlerAssembly = createHandlerAssembly();

    const runtime = await startDesktopDshAgentRuntime({
      supervisor: { start: () => subprocess },
      virtualCwd: '/virtual/workspace',
      metadataStore: fixture.store,
      createHandlers: ({ bindings }) => {
        expect(bindings).toBeDefined();
        return handlerAssembly;
      },
      connectClient,
    });
    expect(connectClient).toHaveBeenCalledWith(
      expect.objectContaining({
        transport,
        handlers: expect.any(Object),
        virtualCwd: '/virtual/workspace',
      }),
    );
    await expect(
      runtime.conversations.binding.bind({
        conversationId: fixture.conversationId,
        dshSessionId: 'dsh-session-a',
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(runtime.conversations.binding.resolve(fixture.conversationId)).resolves.toEqual({
      ok: true,
      binding: {
        conversationId: fixture.conversationId,
        dshSessionId: 'dsh-session-a',
      },
    });

    await runtime.dispose();
    expect(handlerAssembly.dispose).toHaveBeenCalledTimes(1);
    expect(subprocess.dispose).toHaveBeenCalledTimes(1);
    await fixture.store.dispose();
  });

  it('disposes the subprocess when ACP connection fails', async () => {
    const fixture = await createFixture();
    const subprocess = createSubprocess(createTransport());
    const failure = new Error('ACP handshake rejected');

    await expect(
      startDesktopDshAgentRuntime({
        supervisor: { start: () => subprocess },
        virtualCwd: '/virtual/workspace',
        metadataStore: fixture.store,
        createHandlers: () => createHandlerAssembly(),
        connectClient: async () => Promise.reject(failure),
      }),
    ).rejects.toBe(failure);
    expect(subprocess.dispose).toHaveBeenCalledTimes(1);
    await fixture.store.dispose();
  });

  it('rejects a malformed ACP frame and disposes without starting another client', async () => {
    const fixture = await createFixture();
    const subprocess = createSubprocess({
      readable: {
        async *[Symbol.asyncIterator]() {
          yield new TextEncoder().encode('not-json\n');
        },
      },
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    });
    const createHandlers = vi.fn(() => createHandlerAssembly());

    await expect(
      startDesktopDshAgentRuntime({
        supervisor: { start: () => subprocess },
        virtualCwd: '/virtual/workspace',
        metadataStore: fixture.store,
        createHandlers,
      }),
    ).rejects.toThrow();
    expect(createHandlers).toHaveBeenCalledOnce();
    expect(subprocess.dispose).toHaveBeenCalledOnce();
    await fixture.store.dispose();
  });

  it('reports both connection and disposal failures', async () => {
    const fixture = await createFixture();
    const subprocess = createSubprocess(createTransport());
    const connectionFailure = new Error('ACP handshake rejected');
    const disposalFailure = new Error('DSH process remained alive');
    subprocess.dispose.mockRejectedValueOnce(disposalFailure);

    await expect(
      startDesktopDshAgentRuntime({
        supervisor: { start: () => subprocess },
        virtualCwd: '/virtual/workspace',
        metadataStore: fixture.store,
        createHandlers: () => createHandlerAssembly(),
        connectClient: async () => Promise.reject(connectionFailure),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'AggregateError',
        errors: [connectionFailure, disposalFailure],
      }),
    );
    await fixture.store.dispose();
  });

  it('fails stable requests after crash and atomically reconnects the same binding on restart', async () => {
    const fixture = await createFixture();
    const firstClosed = deferred<DesktopDshSubprocessExit>();
    const firstSubprocess = createSubprocess(createTransport(), firstClosed.promise);
    const secondSubprocess = createSubprocess(createTransport());
    const start = vi
      .fn()
      .mockReturnValueOnce(firstSubprocess)
      .mockReturnValueOnce(secondSubprocess);
    const firstClient = createClient(['dsh-session-a']);
    const secondClient = createClient(['dsh-session-a']);
    const connectClient = vi
      .fn()
      .mockResolvedValueOnce(firstClient)
      .mockResolvedValueOnce(secondClient);
    const handlerAssembly = createHandlerAssembly();
    const runtime = await startDesktopDshAgentRuntime({
      supervisor: { start },
      virtualCwd: '/virtual/workspace',
      metadataStore: fixture.store,
      createHandlers: () => handlerAssembly,
      connectClient,
    });
    const statuses: unknown[] = [];
    const unsubscribeStatus = runtime.subscribe((status) => statuses.push(status));
    await runtime.conversations.binding.bind({
      conversationId: fixture.conversationId,
      dshSessionId: 'dsh-session-a',
    });
    runtime.client.projection.acceptSessionUpdate({
      sessionId: 'dsh-session-a',
      _meta: { opennekoSequence: 0 },
      update: {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: 'stale' },
      },
    });

    firstClosed.reject(new Error('injected crash'));
    await vi.waitFor(() => expect(handlerAssembly.reset).toHaveBeenCalledOnce());
    expect(runtime.getStatus()).toEqual({
      status: 'unavailable',
      diagnostic: {
        code: 'desktop-dsh-runtime-unavailable',
        message: 'injected crash',
      },
    });
    await expect(runtime.client.listSessions()).rejects.toThrow(/runtime is unavailable/u);
    expect(runtime.client.projection.snapshot('dsh-session-a').events).toEqual([]);

    await runtime.restart();

    expect(start).toHaveBeenCalledTimes(2);
    expect(connectClient).toHaveBeenCalledTimes(2);
    await expect(runtime.client.listSessions()).resolves.toEqual({
      sessions: [{ sessionId: 'dsh-session-a', cwd: '/workspace' }],
    });
    await expect(runtime.conversations.binding.resolve(fixture.conversationId)).resolves.toEqual({
      ok: true,
      binding: {
        conversationId: fixture.conversationId,
        dshSessionId: 'dsh-session-a',
      },
    });
    expect(firstSubprocess.dispose).toHaveBeenCalledOnce();
    expect(statuses).toEqual([
      {
        status: 'unavailable',
        diagnostic: {
          code: 'desktop-dsh-runtime-unavailable',
          message: 'injected crash',
        },
      },
      { status: 'restarting' },
      { status: 'running' },
    ]);

    unsubscribeStatus();
    await runtime.dispose();
    expect(secondSubprocess.dispose).toHaveBeenCalledOnce();
    expect(handlerAssembly.dispose).toHaveBeenCalledOnce();
    await fixture.store.dispose();
  });

  it('keeps the stable runtime unavailable when the only restart handshake fails', async () => {
    const fixture = await createFixture();
    const firstSubprocess = createSubprocess(createTransport());
    const secondSubprocess = createSubprocess(createTransport());
    const start = vi
      .fn()
      .mockReturnValueOnce(firstSubprocess)
      .mockReturnValueOnce(secondSubprocess);
    const restartFailure = new Error('restart handshake rejected');
    const connectClient = vi
      .fn()
      .mockResolvedValueOnce(createClient([]))
      .mockRejectedValueOnce(restartFailure);
    const handlerAssembly = createHandlerAssembly();
    const runtime = await startDesktopDshAgentRuntime({
      supervisor: { start },
      virtualCwd: '/virtual/workspace',
      metadataStore: fixture.store,
      createHandlers: () => handlerAssembly,
      connectClient,
    });

    await expect(runtime.restart()).rejects.toBe(restartFailure);
    expect(runtime.getStatus()).toEqual({
      status: 'unavailable',
      diagnostic: {
        code: 'desktop-dsh-runtime-restart-failed',
        message: 'restart handshake rejected',
      },
    });
    await expect(runtime.client.listSessions()).rejects.toThrow(/runtime is unavailable/u);
    expect(start).toHaveBeenCalledTimes(2);
    expect(secondSubprocess.dispose).toHaveBeenCalledOnce();

    await runtime.dispose();
    expect(handlerAssembly.dispose).toHaveBeenCalledOnce();
    await fixture.store.dispose();
  });

  it('reports crash cleanup failure during restart and final disposal', async () => {
    const fixture = await createFixture();
    const closed = deferred<DesktopDshSubprocessExit>();
    const subprocess = createSubprocess(createTransport(), closed.promise);
    const cleanupFailure = new Error('permission reset failed');
    const handlerAssembly = createHandlerAssembly();
    handlerAssembly.reset.mockRejectedValueOnce(cleanupFailure);
    const runtime = await startDesktopDshAgentRuntime({
      supervisor: { start: () => subprocess },
      virtualCwd: '/virtual/workspace',
      metadataStore: fixture.store,
      createHandlers: () => handlerAssembly,
      connectClient: async () => createClient([]),
    });

    closed.reject(new Error('injected crash'));
    await vi.waitFor(() => expect(handlerAssembly.reset).toHaveBeenCalledOnce());
    await expect(runtime.restart()).rejects.toEqual(
      expect.objectContaining({
        name: 'AggregateError',
        errors: [cleanupFailure],
      }),
    );
    await expect(runtime.dispose()).rejects.toEqual(
      expect.objectContaining({
        name: 'AggregateError',
        errors: [expect.objectContaining({ errors: [cleanupFailure] })],
      }),
    );
    expect(handlerAssembly.dispose).toHaveBeenCalledOnce();
    await fixture.store.dispose();
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-desktop-dsh-runtime-'));
  roots.push(root);
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
  return {
    store,
    conversationId: '00000000-01ARZ3NDEKTSV4RRFFQ69G5FAV',
  };
}

function createTransport(): DshAcpByteTransport {
  return {
    readable: {
      async *[Symbol.asyncIterator]() {},
    },
    write: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  };
}

function createSubprocess(
  transport: DshAcpByteTransport,
  closed: Promise<DesktopDshSubprocessExit> = new Promise<never>(() => undefined),
) {
  return {
    transport,
    closed,
    stop: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  } satisfies DesktopDshSubprocessHandle;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createClient(
  sessionIds: readonly string[],
): DesktopDshAgentClient & ConversationDshSessionAcpClient & DshSessionCatalogAcpClient {
  const unsupported = (): never => {
    throw new Error('Unexpected ACP operation in Desktop composition test.');
  };
  return {
    closed: new Promise<never>(() => undefined),
    projection: new DshAcpProjection(),
    createSession: async () => unsupported(),
    listSessions: async () => ({
      sessions: sessionIds.map((sessionId) => ({ sessionId, cwd: '/workspace' })),
    }),
    loadSession: async () => unsupported(),
    resumeSession: async () => unsupported(),
    closeSession: async () => unsupported(),
    setSessionMode: async () => unsupported(),
    setSessionConfigOption: async () => unsupported(),
    prompt: async () => unsupported(),
    cancel: async () => unsupported(),
    setSessionContext: async () => unsupported(),
    readPermissionPresets: async () => unsupported(),
    readInputCatalog: async () => unsupported(),
    executeCommand: async () => unsupported(),
    invokeSkill: async () => unsupported(),
    readExtensions: async () => unsupported(),
    readInbox: async () => unsupported(),
    replaceInboxMessage: async () => unsupported(),
    removeInboxMessage: async () => unsupported(),
  };
}

function createHandlers(): DshAcpApplicationClientHandlers {
  const unsupported = (): never => {
    throw new Error('Unexpected DSH Host callback in Desktop composition test.');
  };
  return {
    requestPermission: async () => unsupported(),
    executeGenerationTool: async () => unsupported(),
    executeCanvasTool: async () => unsupported(),
    executeCutTool: async () => unsupported(),
    executeDocumentTool: async () => unsupported(),
    executeCharacterTool: async () => unsupported(),
    onSessionUpdate: unsupported,
    onSessionEvent: unsupported,
  };
}

function createHandlerAssembly() {
  return {
    handlers: createHandlers(),
    reset: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
}
