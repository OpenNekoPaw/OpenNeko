import {
  createConversationDshSessionApplication,
  createPersistentDshConversationCatalogStore,
  createPersistentDshStaleConversationCleanup,
  createPersistentConversationDshSessionBindingStore,
  initializeAgentConversationContextAuthorityTable,
  initializeDshConversationCatalogTables,
  initializeConversationDshSessionBindingTables,
  type ConversationDshSessionApplication,
  type ConversationDshSessionBindingStore,
  type ConversationDshSessionAcpClient,
  type DshSessionCreationClient,
  type DshSessionCatalogAcpClient,
  type DshSessionArchiveAcpClient,
} from '@neko/agent-runtime/application';
import {
  DshAcpApplicationClient,
  DshAcpProjection,
  type DshAcpApplicationClientHandlers,
  type DshAcpApplicationClientOptions,
} from '@neko/agent-runtime/acp';
import type { AgentConversationContext } from '@neko/agent-contracts';
import type { LocalMetadataStore } from '@neko/local-metadata';
import type { DshRuntimeHostProjection } from '@neko/agent-contracts/dsh-runtime-host';
import type { DshAcpExtensionProjection } from '@neko/agent-contracts/dsh-acp';
import type { DshAcpProviderCapabilityProjection } from '@neko/agent-contracts/dsh-acp';
import type { DshAcpMcpServerInput } from '@neko/agent-contracts/dsh-acp';
import type {
  DshAcpSkillObservationProjection,
  DshAcpStagedSkillValidationProjection,
} from '@neko/agent-contracts/dsh-acp';
import type { DshSkillAuthoringLayout } from '@neko/agent-contracts/dsh-skill-authoring';

import type { DesktopDshSubprocessHandle } from './desktop-dsh-subprocess-supervisor';

export interface DesktopDshAgentClient
  extends
    ConversationDshSessionAcpClient,
    DshSessionCatalogAcpClient,
    DshSessionArchiveAcpClient,
    DshSessionCreationClient {
  readonly closed: Promise<void>;
  readonly projection: DshAcpProjection;
  readProviderCapabilities(): Promise<DshAcpProviderCapabilityProjection>;
  readExtensions(): Promise<DshAcpExtensionProjection>;
  setSkillEnabled(input: {
    readonly name: string;
    readonly source: string;
    readonly enabled: boolean;
  }): Promise<void>;
  removeSkill(input: { readonly name: string; readonly source: string }): Promise<void>;
  addMcp(input: DshAcpMcpServerInput): Promise<void>;
  setMcpEnabled(input: { readonly id: string; readonly enabled: boolean }): Promise<void>;
  removeMcp(id: string): Promise<void>;
  validateStagedSkill(input: {
    readonly stagingRoot: string;
    readonly layout: DshSkillAuthoringLayout;
    readonly entry: string;
  }): Promise<DshAcpStagedSkillValidationProjection>;
  observeSkill(input: {
    readonly sessionId: string;
    readonly name: string;
  }): Promise<DshAcpSkillObservationProjection>;
}

export interface DesktopDshAgentRuntime {
  readonly client: DesktopDshAgentClient;
  readonly conversations: ConversationDshSessionApplication;
  readonly bindings: ConversationDshSessionBindingStore;
  resolveSessionCwd(context: AgentConversationContext): Promise<string>;
  getStatus(): DshRuntimeHostProjection;
  subscribe(listener: (projection: DshRuntimeHostProjection) => void): () => void;
  refreshConfiguration(): Promise<'applied' | 'pending'>;
  flushPendingConfigurationRefresh(): Promise<void>;
  restart(): Promise<void>;
  dispose(): Promise<void>;
}

export interface DesktopDshAgentRuntimeOptions {
  readonly supervisor: {
    start(): DesktopDshSubprocessHandle | Promise<DesktopDshSubprocessHandle>;
  };
  readonly onGenerationConnected?: () => void;
  readonly onGenerationUnavailable?: () => void;
  readonly virtualCwd: string;
  readonly metadataStore: LocalMetadataStore;
  readonly resolveSessionCwd: (context: AgentConversationContext) => Promise<string>;
  readonly createHandlers: (input: {
    readonly bindings: ConversationDshSessionBindingStore;
    readonly skillAuthoringBridge: Pick<
      DesktopDshAgentClient,
      'validateStagedSkill' | 'observeSkill'
    >;
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
  await initializeAgentConversationContextAuthorityTable(options.metadataStore);
  await initializeConversationDshSessionBindingTables(options.metadataStore);
  await initializeDshConversationCatalogTables(options.metadataStore);
  const bindings = createPersistentConversationDshSessionBindingStore({
    metadataStore: options.metadataStore,
  });
  const catalog = createPersistentDshConversationCatalogStore({
    metadataStore: options.metadataStore,
  });
  const staleConversations = createPersistentDshStaleConversationCleanup({
    metadataStore: options.metadataStore,
  });
  const connectClient = options.connectClient ?? DshAcpApplicationClient.connect;
  const projection = new DshAcpProjection();
  let current: DesktopDshRuntimeGeneration | undefined;
  let activeWork = 0;
  let workBlocked = false;
  let configurationRefreshPending = false;
  const refreshFlushTrigger: { current?: () => Promise<void> } = {};
  const requireGenerationClient = (): DesktopDshAgentClient => {
    const client = current?.client;
    if (client === undefined) throw new Error('Desktop DSH Agent runtime is unavailable.');
    return client;
  };
  const handlerAssembly = options.createHandlers({
    bindings,
    skillAuthoringBridge: Object.freeze({
      validateStagedSkill: (input) => requireGenerationClient().validateStagedSkill(input),
      observeSkill: (input) => requireGenerationClient().observeSkill(input),
    }),
  });
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
    const subprocess = await options.supervisor.start();
    try {
      const client = await connectClient({
        transport: subprocess.transport,
        handlers: handlerAssembly.handlers,
        virtualCwd: options.virtualCwd,
        projection,
      });
      options.onGenerationConnected?.();
      return { subprocess, client };
    } catch (error) {
      return disposeSubprocessAfterConnectionFailure(subprocess, error);
    }
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
    options.onGenerationUnavailable?.();
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
  const client = createStableDesktopDshAgentClient(projection, () => current?.client, {
    isWorkBlocked: () => workBlocked,
    async trackWork<T>(operation: () => Promise<T>): Promise<T> {
      activeWork += 1;
      try {
        return await operation();
      } finally {
        activeWork -= 1;
        void refreshFlushTrigger.current?.().catch(() => undefined);
      }
    },
  });

  const conversations = createConversationDshSessionApplication({
    client,
    store: bindings,
    catalog,
    staleConversations,
    conversationIdentitySeed: options.virtualCwd,
    activity: projection,
    lookupCwd: { resolve: options.resolveSessionCwd },
  });
  await conversations.home.refresh();
  const restart = (): Promise<void> => {
    if (disposed) return Promise.reject(new Error('Desktop DSH Agent runtime is disposed.'));
    if (restartPromise !== undefined) return restartPromise;
    workBlocked = true;
    publishStatus({ status: 'restarting' });
    const previous = current;
    current = undefined;
    conversations.activation.reset();
    projection.reset();
    restartPromise = (async () => {
      await retirement;
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
      workBlocked = configurationRefreshPending;
      publishStatus({ status: 'running' });
    })()
      .catch((error: unknown) => {
        options.onGenerationUnavailable?.();
        configurationRefreshPending = false;
        workBlocked = false;
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
  };
  const flushPendingConfigurationRefresh = async (): Promise<void> => {
    if (!configurationRefreshPending || restartPromise !== undefined) return;
    if (activeWork > 0 || projection.hasActiveTurn()) return;
    configurationRefreshPending = false;
    await restart();
  };
  refreshFlushTrigger.current = flushPendingConfigurationRefresh;
  return Object.freeze({
    client,
    conversations,
    bindings,
    resolveSessionCwd: options.resolveSessionCwd,
    getStatus: () => status,
    subscribe(listener: (projection: DshRuntimeHostProjection) => void) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    async refreshConfiguration() {
      if (restartPromise !== undefined) {
        configurationRefreshPending = true;
        workBlocked = true;
        await restartPromise;
      }
      configurationRefreshPending = true;
      workBlocked = true;
      if (activeWork > 0 || projection.hasActiveTurn()) return 'pending';
      configurationRefreshPending = false;
      await restart();
      return 'applied';
    },
    flushPendingConfigurationRefresh,
    restart,
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
  activity: {
    readonly isWorkBlocked: () => boolean;
    readonly trackWork: <T>(operation: () => Promise<T>) => Promise<T>;
  },
): DesktopDshAgentClient {
  const requireClient = (): DesktopDshAgentClient => {
    const client = readClient();
    if (client === undefined) throw new Error('Desktop DSH Agent runtime is unavailable.');
    return client;
  };
  const requireWorkClient = (): DesktopDshAgentClient => {
    if (activity.isWorkBlocked()) {
      throw new Error(
        'Desktop DSH Agent runtime configuration refresh is pending; wait for the active turn to finish.',
      );
    }
    return requireClient();
  };
  const runWork = <T>(operation: (client: DesktopDshAgentClient) => Promise<T>): Promise<T> => {
    const generationClient = requireWorkClient();
    return activity.trackWork(() => operation(generationClient));
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
      return runWork((client) => client.createSession(input));
    },
    async loadSession(input) {
      return runWork((client) => client.loadSession(input));
    },
    async resumeSession(input) {
      return runWork((client) => client.resumeSession(input));
    },
    async closeSession(sessionId) {
      return requireClient().closeSession(sessionId);
    },
    async archiveSession(sessionId) {
      return requireClient().archiveSession(sessionId);
    },
    async readArchivedSessions() {
      return requireClient().readArchivedSessions();
    },
    async setSessionMode(input) {
      return runWork((client) => client.setSessionMode(input));
    },
    async setSessionConfigOption(input) {
      return runWork((client) => client.setSessionConfigOption(input));
    },
    async prompt(input) {
      return runWork((client) => client.prompt(input));
    },
    async cancel(sessionId) {
      return requireClient().cancel(sessionId);
    },
    async setSessionContext(input) {
      return runWork((client) => client.setSessionContext(input));
    },
    async readPermissionPresets(sessionId) {
      return requireClient().readPermissionPresets(sessionId);
    },
    async readInputCatalog(input) {
      return requireClient().readInputCatalog(input);
    },
    async executeCommand(input) {
      return runWork((client) => client.executeCommand(input));
    },
    async invokeSkill(input) {
      return runWork((client) => client.invokeSkill(input));
    },
    async readExtensions() {
      return requireClient().readExtensions();
    },
    async readProviderCapabilities() {
      return requireClient().readProviderCapabilities();
    },
    async setSkillEnabled(input) {
      return runWork((client) => client.setSkillEnabled(input));
    },
    async removeSkill(input) {
      return runWork((client) => client.removeSkill(input));
    },
    async addMcp(input) {
      return runWork((client) => client.addMcp(input));
    },
    async setMcpEnabled(input) {
      return runWork((client) => client.setMcpEnabled(input));
    },
    async removeMcp(id) {
      return runWork((client) => client.removeMcp(id));
    },
    async validateStagedSkill(input) {
      return runWork((client) => client.validateStagedSkill(input));
    },
    async observeSkill(input) {
      return requireClient().observeSkill(input);
    },
    async readInbox(sessionId) {
      return requireClient().readInbox(sessionId);
    },
    async readImageAttachment(input) {
      return requireClient().readImageAttachment(input);
    },
    async enqueueInboxMessage(input) {
      return requireClient().enqueueInboxMessage(input);
    },
    async replaceInboxMessage(input) {
      return requireClient().replaceInboxMessage(input);
    },
    async sendInboxMessageNow(input) {
      return requireClient().sendInboxMessageNow(input);
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
