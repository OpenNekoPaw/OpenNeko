import {
  createConversationDshSessionApplication,
  createPersistentDshConversationCatalogStore,
  createPersistentConversationDshSessionBindingStore,
  initializeAgentConversationLifecycleTables,
  initializeDshConversationCatalogTables,
  initializeConversationDshSessionBindingTables,
  type ConversationDshSessionApplication,
  type ConversationDshSessionBindingStore,
  type ConversationDshSessionAcpClient,
  type DshSessionCreationClient,
  type DshSessionCatalogAcpClient,
} from '@neko/agent-runtime/application';
import {
  DshAcpApplicationClient,
  DshAcpProjection,
  type DshAcpApplicationClientHandlers,
  type DshAcpApplicationClientOptions,
} from '@neko/agent-runtime/acp';
import type { LocalMetadataStore } from '@neko/local-metadata';
import type { DshRuntimeHostProjection } from '@neko/agent-contracts/dsh-runtime-host';

import type {
  DesktopDshSubprocessHandle,
  DesktopDshSubprocessSupervisor,
} from './desktop-dsh-subprocess-supervisor';

export interface DesktopDshAgentClient
  extends ConversationDshSessionAcpClient, DshSessionCatalogAcpClient, DshSessionCreationClient {
  readonly closed: Promise<void>;
  readonly projection: DshAcpProjection;
}

export interface DesktopDshAgentRuntime {
  readonly client: DesktopDshAgentClient;
  readonly conversations: ConversationDshSessionApplication;
  readonly bindings: ConversationDshSessionBindingStore;
  getStatus(): DshRuntimeHostProjection;
  subscribe(listener: (projection: DshRuntimeHostProjection) => void): () => void;
  restart(): Promise<void>;
  dispose(): Promise<void>;
}

export interface DesktopDshAgentRuntimeOptions {
  readonly supervisor: Pick<DesktopDshSubprocessSupervisor, 'start'>;
  readonly virtualCwd: string;
  readonly metadataStore: LocalMetadataStore;
  readonly createHandlers: (input: {
    readonly bindings: ConversationDshSessionBindingStore;
  }) => DesktopDshAgentHandlerAssembly;
  readonly connectClient?: (
    options: DshAcpApplicationClientOptions,
  ) => Promise<DesktopDshAgentClient>;
}

export interface DesktopDshAgentHandlerAssembly {
  readonly handlers: DshAcpApplicationClientHandlers;
  reset(): Promise<void>;
  dispose(): Promise<void>;
}

export async function startDesktopDshAgentRuntime(
  options: DesktopDshAgentRuntimeOptions,
): Promise<DesktopDshAgentRuntime> {
  await initializeAgentConversationLifecycleTables(options.metadataStore);
  await initializeConversationDshSessionBindingTables(options.metadataStore);
  await initializeDshConversationCatalogTables(options.metadataStore);
  const bindings = createPersistentConversationDshSessionBindingStore({
    metadataStore: options.metadataStore,
  });
  const catalog = createPersistentDshConversationCatalogStore({
    metadataStore: options.metadataStore,
  });
  const handlerAssembly = options.createHandlers({ bindings });
  const connectClient = options.connectClient ?? DshAcpApplicationClient.connect;
  const projection = new DshAcpProjection();
  let current: DesktopDshRuntimeGeneration | undefined;
  let retirement = Promise.resolve();
  let restartPromise: Promise<void> | undefined;
  let disposed = false;
  let status: DshRuntimeHostProjection = Object.freeze({ status: 'running' });
  const statusListeners = new Set<(projection: DshRuntimeHostProjection) => void>();
  const publishStatus = (projection: DshRuntimeHostProjection): void => {
    status = Object.freeze(projection);
    for (const listener of statusListeners) listener(status);
  };
  const connectGeneration = async (): Promise<DesktopDshRuntimeGeneration> => {
    const subprocess = options.supervisor.start();
    const client = await connectClient({
      transport: subprocess.transport,
      handlers: handlerAssembly.handlers,
      virtualCwd: options.virtualCwd,
      projection,
    }).catch((error: unknown) => disposeSubprocessAfterConnectionFailure(subprocess, error));
    return { subprocess, client };
  };
  const watchGeneration = (generation: DesktopDshRuntimeGeneration): void => {
    void Promise.race([generation.subprocess.closed, generation.client.closed])
      .then(
        () =>
          retireAfterUnexpectedClose(
            generation,
            new Error('Desktop DSH connection closed unexpectedly.'),
          ),
        (error: unknown) => retireAfterUnexpectedClose(generation, error),
      )
      .catch(() => undefined);
  };
  const retireAfterUnexpectedClose = (
    generation: DesktopDshRuntimeGeneration,
    closeError: unknown,
  ): Promise<void> => {
    if (current !== generation || disposed) return Promise.resolve();
    current = undefined;
    conversations.activation.reset();
    projection.reset();
    publishStatus({
      status: 'unavailable',
      diagnostic: {
        code: 'desktop-dsh-runtime-unavailable',
        message: describeRuntimeFailure(closeError),
      },
    });
    retirement = Promise.allSettled([
      handlerAssembly.reset(),
      generation.subprocess.dispose(),
    ]).then((results) => {
      const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason);
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Desktop DSH crashed runtime cleanup failed.');
      }
    });
    retirement.catch(() => undefined);
    return retirement;
  };
  current = await connectGeneration().catch(async (error: unknown) => {
    await handlerAssembly.dispose();
    throw error;
  });
  watchGeneration(current);
  const client = createStableDesktopDshAgentClient(projection, () => current?.client);

  const conversations = createConversationDshSessionApplication({
    client,
    store: bindings,
    catalog,
    conversationIdentitySeed: options.virtualCwd,
  });
  await conversations.home.refresh();
  return Object.freeze({
    client,
    conversations,
    bindings,
    getStatus: () => status,
    subscribe(listener: (projection: DshRuntimeHostProjection) => void) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    restart() {
      if (disposed) return Promise.reject(new Error('Desktop DSH Agent runtime is disposed.'));
      if (restartPromise !== undefined) return restartPromise;
      publishStatus({ status: 'restarting' });
      restartPromise = (async () => {
        await retirement;
        const previous = current;
        current = undefined;
        conversations.activation.reset();
        projection.reset();
        if (previous !== undefined) {
          await handlerAssembly.reset();
          await previous.subprocess.dispose();
        }
        const next = await connectGeneration();
        if (disposed) {
          await next.subprocess.dispose();
          throw new Error('Desktop DSH Agent runtime was disposed during restart.');
        }
        current = next;
        watchGeneration(next);
        publishStatus({ status: 'running' });
      })()
        .catch((error: unknown) => {
          publishStatus({
            status: 'unavailable',
            diagnostic: {
              code: 'desktop-dsh-runtime-restart-failed',
              message: describeRuntimeFailure(error),
            },
          });
          throw error;
        })
        .finally(() => {
          restartPromise = undefined;
        });
      return restartPromise;
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      statusListeners.clear();
      let previous = current;
      current = undefined;
      conversations.activation.reset();
      projection.reset();
      const failures: unknown[] = [];
      try {
        await restartPromise;
      } catch (error) {
        failures.push(error);
      }
      try {
        await retirement;
      } catch (error) {
        failures.push(error);
      }
      previous ??= current;
      current = undefined;
      failures.push(...(await disposeHandlerThenSubprocess(handlerAssembly, previous?.subprocess)));
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Desktop DSH Agent runtime disposal failed.');
      }
    },
  });
}

function describeRuntimeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface DesktopDshRuntimeGeneration {
  readonly subprocess: DesktopDshSubprocessHandle;
  readonly client: DesktopDshAgentClient;
}

function createStableDesktopDshAgentClient(
  projection: DshAcpProjection,
  readClient: () => DesktopDshAgentClient | undefined,
): DesktopDshAgentClient {
  const requireClient = (): DesktopDshAgentClient => {
    const client = readClient();
    if (client === undefined) throw new Error('Desktop DSH Agent runtime is unavailable.');
    return client;
  };
  const client: DesktopDshAgentClient = {
    projection,
    get closed() {
      return requireClient().closed;
    },
    async listSessions(input) {
      return requireClient().listSessions(input);
    },
    async createSession(input) {
      return requireClient().createSession(input);
    },
    async loadSession(input) {
      return requireClient().loadSession(input);
    },
    async resumeSession(input) {
      return requireClient().resumeSession(input);
    },
    async closeSession(sessionId) {
      return requireClient().closeSession(sessionId);
    },
    async setSessionMode(input) {
      return requireClient().setSessionMode(input);
    },
    async setSessionConfigOption(input) {
      return requireClient().setSessionConfigOption(input);
    },
    async prompt(input) {
      return requireClient().prompt(input);
    },
    async cancel(sessionId) {
      return requireClient().cancel(sessionId);
    },
    async setSessionContext(input) {
      return requireClient().setSessionContext(input);
    },
    async readInbox(sessionId) {
      return requireClient().readInbox(sessionId);
    },
    async replaceInboxMessage(input) {
      return requireClient().replaceInboxMessage(input);
    },
    async removeInboxMessage(input) {
      return requireClient().removeInboxMessage(input);
    },
  };
  return Object.freeze(client);
}

async function disposeSubprocessAfterConnectionFailure(
  subprocess: DesktopDshSubprocessHandle,
  connectionError: unknown,
): Promise<never> {
  const failures: unknown[] = [];
  try {
    await subprocess.dispose();
  } catch (error) {
    failures.push(error);
  }
  if (failures.length !== 0) {
    throw new AggregateError(
      [connectionError, ...failures],
      'Desktop DSH ACP connection failed and its subprocess could not be disposed.',
    );
  }
  throw connectionError;
}

async function disposeHandlerThenSubprocess(
  handlers: DesktopDshAgentHandlerAssembly,
  subprocess: DesktopDshSubprocessHandle | undefined,
): Promise<unknown[]> {
  const failures: unknown[] = [];
  try {
    await handlers.dispose();
  } catch (error) {
    failures.push(error);
  }
  if (subprocess !== undefined) {
    try {
      await subprocess.dispose();
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}
