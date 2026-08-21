import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type Agent,
  type Client,
  type InitializeResponse,
  type ListSessionsRequest,
  type ListSessionsResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type ResumeSessionRequest,
  type ResumeSessionResponse,
  type SessionNotification,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
} from '@agentclientprotocol/sdk';
import {
  DSH_ACP_EXTENSION_METHODS,
  decodeDshAcpContextPressureNotification,
  decodeDshAcpArchivedSessionsProjection,
  DSH_ACP_EXTENSION_NOTIFICATIONS,
  decodeDshAcpDomainToolCancelRequest,
  decodeDshAcpCommandExecuteProjection,
  decodeDshAcpCommandExecuteRequest,
  decodeDshAcpDomainToolRequest,
  decodeDshAcpDomainToolResponse,
  decodeDshAcpExtensionProjection,
  decodeDshAcpInboxEnqueueRequest,
  decodeDshAcpInboxSnapshot,
  decodeDshAcpInputCatalogProjection,
  decodeDshAcpPermissionPresetProjection,
  decodeDshAcpSessionContextSetRequest,
  decodeDshAcpSessionArchiveRequest,
  decodeDshAcpSessionEventNotification,
  decodeDshAcpSkillInvokeProjection,
  decodeDshAcpSkillInvokeRequest,
  type DshAcpContentBlock,
  type DshAcpDomainToolRequest,
  type DshAcpDomainToolResponse,
  type DshAcpInboxSnapshot,
  type DshAcpInboxEnqueueRequest,
  type DshAcpInputCatalogProjection,
  type DshAcpPermissionPresetProjection,
  type DshAcpCommandExecuteProjection,
  type DshAcpSkillInvokeProjection,
  type DshAcpExtensionProjection,
  type DshAcpArchivedSessionsProjection,
} from '@neko/agent-contracts/dsh-acp';
import { CANVAS_DSH_TOOL_NAME } from '@neko/canvas-domain';
import { CUT_DSH_TOOL_NAME } from '@neko/cut-domain';
import { GENERATION_DSH_TOOL_NAME } from '@neko/generation';
import { DOCUMENT_DSH_TOOL_NAME } from '@neko/content/document';
import { CONTENT_IMAGE_DSH_TOOL_NAME } from '@neko/content';
import { CHARACTER_DSH_TOOL_NAME } from '@neko/chara/application';
import { WORLD_DSH_TOOL_NAME } from '@neko/world/application';
import { DshAcpProjection } from './dsh-acp-projection';

export interface DshAcpApplicationClientHandlers {
  readonly requestPermission: (
    request: RequestPermissionRequest,
    identity: {
      readonly sessionId: string;
      readonly turn: number;
      readonly toolCallId: string;
    },
  ) => Promise<RequestPermissionResponse>;
  readonly executeGenerationTool: (
    request: DshAcpDomainToolRequest,
    signal: AbortSignal,
  ) => Promise<DshAcpDomainToolResponse>;
  readonly executeCanvasTool: (
    request: DshAcpDomainToolRequest,
    signal: AbortSignal,
  ) => Promise<DshAcpDomainToolResponse>;
  readonly executeCutTool: (
    request: DshAcpDomainToolRequest,
    signal: AbortSignal,
  ) => Promise<DshAcpDomainToolResponse>;
  readonly executeDocumentTool: (
    request: DshAcpDomainToolRequest,
    signal: AbortSignal,
  ) => Promise<DshAcpDomainToolResponse>;
  readonly executeContentImageTool?: (
    request: DshAcpDomainToolRequest,
    signal: AbortSignal,
  ) => Promise<DshAcpDomainToolResponse>;
  readonly executeCharacterTool: (
    request: DshAcpDomainToolRequest,
    signal: AbortSignal,
  ) => Promise<DshAcpDomainToolResponse>;
  readonly executeWorldTool?: (
    request: DshAcpDomainToolRequest,
    signal: AbortSignal,
  ) => Promise<DshAcpDomainToolResponse>;
  readonly onSessionUpdate: (notification: SessionNotification) => Promise<void> | void;
  readonly onSessionEvent: (
    notification: ReturnType<typeof decodeDshAcpSessionEventNotification>,
  ) => Promise<void> | void;
  readonly onContextPressure: (
    notification: ReturnType<typeof decodeDshAcpContextPressureNotification>,
  ) => Promise<void> | void;
}

export interface DshAcpConnection {
  readonly signal: AbortSignal;
  readonly closed: Promise<void>;
  initialize(input: Parameters<Agent['initialize']>[0]): ReturnType<Agent['initialize']>;
  newSession(input: NewSessionRequest): Promise<NewSessionResponse>;
  listSessions(input: ListSessionsRequest): Promise<ListSessionsResponse>;
  loadSession(input: LoadSessionRequest): Promise<LoadSessionResponse>;
  resumeSession(input: ResumeSessionRequest): Promise<ResumeSessionResponse>;
  closeSession(input: { readonly sessionId: string }): Promise<Record<string, unknown>>;
  setSessionMode(input: SetSessionModeRequest): Promise<SetSessionModeResponse>;
  setSessionConfigOption(
    input: SetSessionConfigOptionRequest,
  ): Promise<SetSessionConfigOptionResponse>;
  prompt(input: PromptRequest): Promise<PromptResponse>;
  cancel(input: { readonly sessionId: string }): Promise<void>;
  extMethod(method: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export interface DshAcpByteTransport {
  readonly readable: AsyncIterable<Uint8Array>;
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface DshAcpApplicationClientOptions {
  readonly transport: DshAcpByteTransport;
  readonly handlers: DshAcpApplicationClientHandlers;
  readonly virtualCwd: string;
  readonly projection?: DshAcpProjection;
  readonly createConnection?: (client: Client) => DshAcpConnection;
}

const MAX_ACTIVE_HOST_TOOL_CALLS = 2;
const MAX_QUEUED_HOST_TOOL_CALLS_PER_SESSION = 8;
const MAX_QUEUED_HOST_TOOL_SESSIONS = 32;

interface HostToolCallRecord {
  readonly request: DshAcpDomainToolRequest;
  readonly controller: AbortController;
  readonly identity: string;
  readonly handler: DshAcpApplicationClientHandlers['executeGenerationTool'];
  readonly completion: HostToolCompletion;
  cancelled: boolean;
}

interface HostToolCompletion {
  readonly promise: Promise<DshAcpDomainToolResponse>;
  readonly resolve: (value: DshAcpDomainToolResponse) => void;
  readonly reject: (reason: unknown) => void;
}

export class DshAcpApplicationClient {
  readonly projection: DshAcpProjection;

  private constructor(
    private readonly connection: DshAcpConnection,
    readonly initializeResponse: InitializeResponse,
    projection: DshAcpProjection,
    private readonly virtualCwd: string,
  ) {
    this.projection = projection;
  }

  static async connect(options: DshAcpApplicationClientOptions): Promise<DshAcpApplicationClient> {
    const virtualCwd = requireAbsoluteVirtualCwd(options.virtualCwd);
    const admission = new HostToolAdmission(options.handlers);
    const projection = options.projection ?? new DshAcpProjection();
    const protocolClient = createProtocolClient(options.handlers, admission, projection);
    const createConnection =
      options.createConnection ??
      ((client: Client): DshAcpConnection =>
        new ClientSideConnection(() => client, createProtocolStream(options.transport)));
    const connection = createConnection(protocolClient);
    if (connection.signal.aborted) {
      admission.close();
    } else {
      connection.signal.addEventListener('abort', () => admission.close(), { once: true });
    }
    const initializeResponse = await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: { name: 'OpenNeko', version: 'development' },
    });
    if (initializeResponse.protocolVersion !== PROTOCOL_VERSION) {
      throw new Error(
        `DSH ACP negotiated unsupported protocol ${String(initializeResponse.protocolVersion)}.`,
      );
    }
    return new DshAcpApplicationClient(connection, initializeResponse, projection, virtualCwd);
  }

  get signal(): AbortSignal {
    return this.connection.signal;
  }

  get closed(): Promise<void> {
    return this.connection.closed;
  }

  createSession(input: Omit<NewSessionRequest, 'cwd'>): Promise<NewSessionResponse> {
    return this.connection.newSession({ ...input, cwd: this.virtualCwd });
  }

  async listSessions(input: Omit<ListSessionsRequest, 'cwd'> = {}): Promise<ListSessionsResponse> {
    this.requireCapability(
      this.initializeResponse.agentCapabilities?.sessionCapabilities?.list !== undefined &&
        this.initializeResponse.agentCapabilities.sessionCapabilities.list !== null,
      'session/list',
    );
    return this.connection.listSessions({ ...input, cwd: this.virtualCwd });
  }

  async loadSession(input: Omit<LoadSessionRequest, 'cwd'>): Promise<LoadSessionResponse> {
    this.requireCapability(
      this.initializeResponse.agentCapabilities?.loadSession === true,
      'session/load',
    );
    return this.connection.loadSession({ ...input, cwd: this.virtualCwd });
  }

  async resumeSession(input: Omit<ResumeSessionRequest, 'cwd'>): Promise<ResumeSessionResponse> {
    this.requireCapability(
      this.initializeResponse.agentCapabilities?.sessionCapabilities?.resume !== undefined &&
        this.initializeResponse.agentCapabilities.sessionCapabilities.resume !== null,
      'session/resume',
    );
    return this.connection.resumeSession({ ...input, cwd: this.virtualCwd });
  }

  async closeSession(sessionId: string): Promise<void> {
    this.requireCapability(
      this.initializeResponse.agentCapabilities?.sessionCapabilities?.close !== undefined &&
        this.initializeResponse.agentCapabilities.sessionCapabilities.close !== null,
      'session/close',
    );
    await this.connection.closeSession({ sessionId });
  }

  setSessionMode(input: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    return this.connection.setSessionMode(input);
  }

  setSessionConfigOption(
    input: SetSessionConfigOptionRequest,
  ): Promise<SetSessionConfigOptionResponse> {
    return this.connection.setSessionConfigOption(input);
  }

  prompt(input: PromptRequest): Promise<PromptResponse> {
    return this.connection.prompt(input);
  }

  cancel(sessionId: string): Promise<void> {
    return this.connection.cancel({ sessionId });
  }

  async setSessionContext(input: {
    readonly sessionId: string;
    readonly text: string;
  }): Promise<void> {
    const request = decodeDshAcpSessionContextSetRequest({ ...input });
    await this.connection.extMethod(DSH_ACP_EXTENSION_METHODS.setSessionContext, { ...request });
  }

  async archiveSession(sessionId: string): Promise<DshAcpArchivedSessionsProjection> {
    const request = decodeDshAcpSessionArchiveRequest({ sessionId });
    const response = await this.connection.extMethod(DSH_ACP_EXTENSION_METHODS.archiveSession, {
      ...request,
    });
    return decodeDshAcpArchivedSessionsProjection(response);
  }

  async readArchivedSessions(): Promise<DshAcpArchivedSessionsProjection> {
    const response = await this.connection.extMethod(
      DSH_ACP_EXTENSION_METHODS.readArchivedSessions,
      {},
    );
    return decodeDshAcpArchivedSessionsProjection(response);
  }

  async readPermissionPresets(sessionId?: string): Promise<DshAcpPermissionPresetProjection> {
    const response = await this.connection.extMethod(
      DSH_ACP_EXTENSION_METHODS.readPermissionPresets,
      {
        ...(sessionId === undefined ? {} : { sessionId }),
      },
    );
    return decodeDshAcpPermissionPresetProjection(response);
  }

  async readInputCatalog(sessionId: string): Promise<DshAcpInputCatalogProjection> {
    const response = await this.connection.extMethod(DSH_ACP_EXTENSION_METHODS.readInputCatalog, {
      sessionId,
    });
    return decodeDshAcpInputCatalogProjection(response);
  }

  async executeCommand(input: {
    readonly sessionId: string;
    readonly line: string;
  }): Promise<DshAcpCommandExecuteProjection> {
    const request = decodeDshAcpCommandExecuteRequest({ ...input });
    const response = await this.connection.extMethod(DSH_ACP_EXTENSION_METHODS.executeCommand, {
      ...request,
    });
    return decodeDshAcpCommandExecuteProjection(response);
  }

  async invokeSkill(input: {
    readonly sessionId: string;
    readonly skillName: string;
    readonly displayText: string;
    readonly args?: string;
  }): Promise<DshAcpSkillInvokeProjection> {
    const request = decodeDshAcpSkillInvokeRequest({ ...input });
    const response = await this.connection.extMethod(DSH_ACP_EXTENSION_METHODS.invokeSkill, {
      ...request,
    });
    return decodeDshAcpSkillInvokeProjection(response);
  }

  async readExtensions(): Promise<DshAcpExtensionProjection> {
    const response = await this.connection.extMethod(DSH_ACP_EXTENSION_METHODS.readExtensions, {});
    return decodeDshAcpExtensionProjection(response);
  }

  async readInbox(sessionId: string): Promise<DshAcpInboxSnapshot> {
    const response = await this.connection.extMethod(DSH_ACP_EXTENSION_METHODS.readInbox, {
      sessionId,
    });
    return decodeDshAcpInboxSnapshot(response);
  }

  async enqueueInboxMessage(input: DshAcpInboxEnqueueRequest): Promise<DshAcpInboxSnapshot> {
    const request = decodeDshAcpInboxEnqueueRequest({
      ...input,
      prompt: [...input.prompt],
      displayContent: [...input.displayContent],
    });
    const response = await this.connection.extMethod(
      DSH_ACP_EXTENSION_METHODS.enqueueInboxMessage,
      { ...request, prompt: [...request.prompt], displayContent: [...request.displayContent] },
    );
    return decodeDshAcpInboxSnapshot(response);
  }

  async replaceInboxMessage(input: {
    readonly sessionId: string;
    readonly messageId: string;
    readonly content: readonly DshAcpContentBlock[];
  }): Promise<DshAcpInboxSnapshot> {
    const response = await this.connection.extMethod(
      DSH_ACP_EXTENSION_METHODS.replaceInboxMessage,
      { ...input, content: [...input.content] },
    );
    return decodeDshAcpInboxSnapshot(response);
  }

  async removeInboxMessage(input: {
    readonly sessionId: string;
    readonly messageId: string;
  }): Promise<DshAcpInboxSnapshot> {
    const response = await this.connection.extMethod(
      DSH_ACP_EXTENSION_METHODS.removeInboxMessage,
      input,
    );
    return decodeDshAcpInboxSnapshot(response);
  }

  private requireCapability(available: boolean, method: string): void {
    if (!available) throw new Error(`DSH ACP did not advertise required capability ${method}.`);
  }
}

function requireAbsoluteVirtualCwd(value: string): string {
  if (!value.startsWith('/')) throw new Error('DSH ACP virtual cwd must be absolute.');
  return value;
}

function createProtocolStream(transport: DshAcpByteTransport) {
  const input = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of transport.readable) controller.enqueue(chunk);
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  const output = new WritableStream<Uint8Array>({
    write: (chunk) => transport.write(chunk),
    close: () => transport.close(),
    abort: () => transport.close(),
  });
  return ndJsonStream(output, input);
}

function createProtocolClient(
  handlers: DshAcpApplicationClientHandlers,
  admission: HostToolAdmission,
  projection: DshAcpProjection,
): Client {
  return {
    async requestPermission(request) {
      const projected = projection.acceptPermission(request);
      const diagnosticEvent = projected.find((event) => event.kind === 'diagnostic');
      if (diagnosticEvent !== undefined && diagnosticEvent.kind === 'diagnostic') {
        throw new Error(
          `DSH ACP projection rejected permission: ${diagnosticEvent.code}: ${diagnosticEvent.message}`,
        );
      }
      const permissionEvent = projected.find((event) => event.kind === 'permission');
      if (permissionEvent === undefined || permissionEvent.kind !== 'permission') {
        throw new Error('DSH ACP projection did not produce an exact permission identity.');
      }
      return handlers.requestPermission(request, {
        sessionId: permissionEvent.sessionId,
        turn: permissionEvent.turn,
        toolCallId: permissionEvent.toolCallId,
      });
    },
    async sessionUpdate(notification) {
      const projected = projection.acceptSessionUpdate(notification);
      const diagnosticEvent = projected.find((event) => event.kind === 'diagnostic');
      if (diagnosticEvent !== undefined && diagnosticEvent.kind === 'diagnostic') {
        throw new Error(
          `DSH ACP projection rejected session update: ${diagnosticEvent.code}: ${diagnosticEvent.message}`,
        );
      }
      await handlers.onSessionUpdate(notification);
    },
    async extMethod(method, input) {
      if (method === DSH_ACP_EXTENSION_METHODS.executeDomainTool) {
        return admission.execute(decodeDshAcpDomainToolRequest(input));
      }
      if (method === DSH_ACP_EXTENSION_METHODS.cancelDomainTool) {
        admission.cancel(decodeDshAcpDomainToolCancelRequest(input));
        return {};
      }
      throw new Error(`DSH ACP requested unsupported Host extension method ${method}.`);
    },
    async extNotification(method, input) {
      if (method === DSH_ACP_EXTENSION_NOTIFICATIONS.contextPressure) {
        const pressure = decodeDshAcpContextPressureNotification(input);
        const projected = projection.acceptContextPressure(pressure);
        const diagnosticEvent = projected.find(
          (projectedEvent) => projectedEvent.kind === 'diagnostic',
        );
        if (diagnosticEvent !== undefined && diagnosticEvent.kind === 'diagnostic') {
          throw new Error(
            `DSH ACP projection rejected context pressure: ${diagnosticEvent.code}: ${diagnosticEvent.message}`,
          );
        }
        await handlers.onContextPressure(pressure);
        return;
      }
      if (method !== DSH_ACP_EXTENSION_NOTIFICATIONS.sessionEvent) {
        throw new Error(`DSH ACP sent unsupported Host extension notification ${method}.`);
      }
      const event = decodeDshAcpSessionEventNotification(input);
      const projected = projection.acceptSessionEvent(event);
      const diagnosticEvent = projected.find(
        (projectedEvent) => projectedEvent.kind === 'diagnostic',
      );
      if (diagnosticEvent !== undefined && diagnosticEvent.kind === 'diagnostic') {
        throw new Error(
          `DSH ACP projection rejected session event: ${diagnosticEvent.code}: ${diagnosticEvent.message}`,
        );
      }
      await handlers.onSessionEvent(event);
    },
  };
}

class HostToolAdmission {
  private readonly active = new Map<string, HostToolCallRecord>();
  private readonly queued = new Map<string, HostToolCallRecord>();
  private readonly queuesBySession = new Map<string, HostToolCallRecord[]>();
  private readonly readySessions: string[] = [];
  private closed = false;

  constructor(private readonly handlers: DshAcpApplicationClientHandlers) {}

  execute(request: DshAcpDomainToolRequest): Promise<DshAcpDomainToolResponse> {
    if (this.closed) throw new Error('DSH ACP Host Tool admission is closed.');
    const identity = hostToolIdentity(request);
    if (this.active.has(identity) || this.queued.has(identity)) {
      throw new Error(`DSH ACP Host Tool ${identity} is already in flight.`);
    }
    const record: HostToolCallRecord = {
      request,
      identity,
      controller: new AbortController(),
      handler: this.resolveHandler(request.tool),
      completion: createHostToolCompletion(),
      cancelled: false,
    };
    if (this.canStart(request.sessionId)) {
      this.start(record);
    } else {
      this.enqueue(record);
    }
    return record.completion.promise;
  }

  cancel(cancel: {
    readonly sessionId: string;
    readonly turn: number;
    readonly toolCallId: string;
  }): void {
    const identity = hostToolIdentity(cancel);
    const active = this.active.get(identity);
    if (active !== undefined) {
      active.cancelled = true;
      active.controller.abort();
      active.completion.reject(
        new Error(`DSH ACP Host Tool ${identity} was cancelled during execution.`),
      );
      return;
    }
    const queued = this.queued.get(identity);
    if (queued !== undefined) {
      queued.cancelled = true;
      this.removeQueued(queued);
      queued.completion.reject(
        new Error(`DSH ACP Host Tool ${identity} was cancelled before execution.`),
      );
      this.schedule();
      return;
    }
    throw new Error(`DSH ACP cancel identity is unknown or stale: ${identity}`);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const record of this.active.values()) {
      record.cancelled = true;
      record.controller.abort();
      record.completion.reject(
        new Error(`DSH ACP Host Tool ${record.identity} was cancelled during execution.`),
      );
    }
    this.active.clear();
    for (const record of this.queued.values()) {
      record.cancelled = true;
      record.completion.reject(
        new Error(`DSH ACP Host Tool ${record.identity} was cancelled before execution.`),
      );
    }
    this.queued.clear();
    this.queuesBySession.clear();
    this.readySessions.length = 0;
  }

  private canStart(sessionId: string): boolean {
    return this.active.size < MAX_ACTIVE_HOST_TOOL_CALLS && !this.hasActiveSession(sessionId);
  }

  private enqueue(record: HostToolCallRecord): void {
    const sessionId = record.request.sessionId;
    const queue = this.queuesBySession.get(sessionId);
    if (queue === undefined) {
      if (this.queuesBySession.size >= MAX_QUEUED_HOST_TOOL_SESSIONS) {
        throw new Error('DSH ACP Host Tool queued Session limit exceeded.');
      }
      this.queuesBySession.set(sessionId, [record]);
      if (!this.hasActiveSession(sessionId)) this.readySessions.push(sessionId);
    } else {
      if (queue.length >= MAX_QUEUED_HOST_TOOL_CALLS_PER_SESSION) {
        throw new Error(`DSH ACP Host Tool queue limit exceeded for Session ${sessionId}.`);
      }
      queue.push(record);
    }
    this.queued.set(record.identity, record);
  }

  private start(record: HostToolCallRecord): void {
    this.active.set(record.identity, record);
    void this.run(record);
  }

  private async run(record: HostToolCallRecord): Promise<void> {
    try {
      if (record.controller.signal.aborted) {
        throw new Error(`DSH ACP Host Tool ${record.identity} was cancelled before execution.`);
      }
      const response = await record.handler(record.request, record.controller.signal);
      if (record.cancelled || record.controller.signal.aborted) {
        throw new Error(`DSH ACP Host Tool ${record.identity} was cancelled after execution.`);
      }
      record.completion.resolve(
        decodeDshAcpDomainToolResponse(response as unknown as Record<string, unknown>),
      );
    } catch (error) {
      record.completion.reject(error);
    } finally {
      this.active.delete(record.identity);
      const sessionQueue = this.queuesBySession.get(record.request.sessionId);
      if (!this.closed && sessionQueue !== undefined && sessionQueue.length > 0) {
        this.readySessions.push(record.request.sessionId);
      }
      this.schedule();
    }
  }

  private schedule(): void {
    if (this.closed) return;
    while (this.active.size < MAX_ACTIVE_HOST_TOOL_CALLS && this.readySessions.length > 0) {
      const sessionId = this.readySessions.shift();
      if (sessionId === undefined || this.hasActiveSession(sessionId)) continue;
      const queue = this.queuesBySession.get(sessionId);
      const record = queue?.shift();
      if (queue === undefined || record === undefined) continue;
      if (queue.length === 0) this.queuesBySession.delete(sessionId);
      this.queued.delete(record.identity);
      this.start(record);
    }
  }

  private removeQueued(record: HostToolCallRecord): void {
    const queue = this.queuesBySession.get(record.request.sessionId);
    if (queue === undefined) throw new Error('Queued Host Tool lost its Session queue.');
    const index = queue.indexOf(record);
    if (index < 0) throw new Error('Queued Host Tool lost its exact queue identity.');
    queue.splice(index, 1);
    this.queued.delete(record.identity);
    if (queue.length === 0) {
      this.queuesBySession.delete(record.request.sessionId);
      const readyIndex = this.readySessions.indexOf(record.request.sessionId);
      if (readyIndex >= 0) this.readySessions.splice(readyIndex, 1);
    }
  }

  private hasActiveSession(sessionId: string): boolean {
    for (const record of this.active.values()) {
      if (record.request.sessionId === sessionId) return true;
    }
    return false;
  }

  private resolveHandler(tool: string): DshAcpApplicationClientHandlers['executeGenerationTool'] {
    if (tool === GENERATION_DSH_TOOL_NAME) return this.handlers.executeGenerationTool;
    if (tool === CANVAS_DSH_TOOL_NAME) return this.handlers.executeCanvasTool;
    if (tool === CUT_DSH_TOOL_NAME) return this.handlers.executeCutTool;
    if (tool === DOCUMENT_DSH_TOOL_NAME) return this.handlers.executeDocumentTool;
    if (tool === CONTENT_IMAGE_DSH_TOOL_NAME) {
      if (this.handlers.executeContentImageTool === undefined) {
        throw new Error('DSH ACP Content image Tool handler is unavailable.');
      }
      return this.handlers.executeContentImageTool;
    }
    if (tool === CHARACTER_DSH_TOOL_NAME) return this.handlers.executeCharacterTool;
    if (tool === WORLD_DSH_TOOL_NAME) {
      if (this.handlers.executeWorldTool === undefined)
        throw new Error('DSH ACP World Tool handler is unavailable.');
      return this.handlers.executeWorldTool;
    }
    throw new Error(`DSH ACP requested unsupported domain tool ${tool}.`);
  }
}

function hostToolIdentity(input: {
  readonly sessionId: string;
  readonly turn: number;
  readonly toolCallId: string;
}): string {
  return `${input.sessionId}\u0000${input.turn}\u0000${input.toolCallId}`;
}

function createHostToolCompletion(): HostToolCompletion {
  let resolve!: (value: DshAcpDomainToolResponse) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<DshAcpDomainToolResponse>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}
