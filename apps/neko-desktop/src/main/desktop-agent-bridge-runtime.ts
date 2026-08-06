import { randomUUID } from 'node:crypto';
import {
  createAgentHostMessageController,
  type AgentHostMessageController,
} from '@neko/agent-runtime/runtime/host-controller';
import type {
  AgentControllerComposition,
  AgentControllerEffects,
  AgentWorkspaceRuntime,
} from '@neko/agent-runtime/application';
import {
  ELECTRON_AGENT_HOST_ROUTE_COVERAGE,
  createAgentHostRouteCoverageDiagnostics,
  createElectronAgentHostRouteUnavailableDiagnostic,
  type DesktopAgentConnectionIdentity,
  type AgentContextPayload,
  type Message,
  type ProjectionAttachmentKey,
} from '@neko/agent-contracts';
import {
  DESKTOP_AGENT_RUNTIME_REQUIREMENTS,
  DesktopAgentContractError,
  type DesktopAgentBootstrapProjection,
  type DesktopAgentMessageEvent,
  type DesktopAgentMessageRequest,
  type DesktopAgentMessageResult,
  type DesktopAgentUnavailableDiagnostic,
} from '../shared/agent-contract';
import type { DesktopAgentNeutralFacts } from '@neko/agent-contracts';

export interface DesktopAgentStartupAudit {
  readonly ready: boolean;
  readonly diagnostic?: DesktopAgentUnavailableDiagnostic;
}

export interface DesktopAgentConnectionGrant {
  readonly applicationInstanceId: string;
  readonly windowId: string;
  readonly workbenchInstanceId: string;
  readonly agentSurfaceId: string;
  readonly workspaceId: string;
  readonly viewId: string;
  readonly projectId: string;
}

export interface DesktopAssistantAgentConnectionGrant {
  readonly applicationInstanceId: string;
  readonly windowId: string;
  readonly workbenchInstanceId: string;
  readonly agentSurfaceId: string;
  readonly workspaceId: string;
  readonly viewId: string;
  readonly assistantSpaceId: string;
}

export type DesktopAnyAgentConnectionGrant =
  DesktopAgentConnectionGrant | DesktopAssistantAgentConnectionGrant;

export interface DesktopAgentProjectionSenderGrant {
  readonly applicationInstanceId: string;
  readonly windowId: string;
}

export interface DesktopAgentBridgeRuntime {
  readonly startup: DesktopAgentStartupAudit;
  createBootstrap(input: {
    readonly requestId: string;
    readonly grant: DesktopAnyAgentConnectionGrant;
    readonly workspace: AgentWorkspaceRuntime | undefined;
    readonly initialConversationId?: string;
    readonly initialConversationMessage?: Message;
    readonly publish: (event: DesktopAgentMessageEvent) => void;
  }): DesktopAgentBootstrapProjection;
  send(
    request: DesktopAgentMessageRequest,
    grant: DesktopAnyAgentConnectionGrant,
  ): Promise<DesktopAgentMessageResult>;
  sendProjectionControl(
    request: DesktopAgentMessageRequest,
    grant: DesktopAgentProjectionSenderGrant,
  ): Promise<DesktopAgentMessageResult>;
  injectContext(input: {
    readonly windowId: string;
    readonly projectId: string;
    readonly workspaceId: string;
    readonly payload: AgentContextPayload;
  }): Promise<void>;
  waitForIdle(
    connection: DesktopAgentConnectionIdentity,
    grant: DesktopAnyAgentConnectionGrant,
    conversationId: string,
    timeoutMs: number,
    afterIdentity?: { readonly turnId: string; readonly runId: string },
  ): Promise<{ readonly conversationId: string; readonly turnId: string; readonly runId: string }>;
  readFacts(
    connection: DesktopAgentConnectionIdentity,
    grant: DesktopAnyAgentConnectionGrant,
    identity: { readonly conversationId: string; readonly turnId: string; readonly runId: string },
  ): DesktopAgentNeutralFacts;
  disposeConnectionAndReadFacts(
    connection: DesktopAgentConnectionIdentity,
    grant: DesktopAnyAgentConnectionGrant,
  ): Promise<DesktopAgentNeutralFacts>;
  detachSurface(windowId: string, workbenchInstanceId: string, agentSurfaceId: string): void;
  detachWorkbench(windowId: string, workbenchInstanceId: string): void;
  detachConversation(windowId: string, conversationId: string): void;
  detachWindow(windowId: string): void;
  dispose(): void;
}

export function auditDesktopAgentStartup(
  composition?: AgentControllerComposition,
  piRuntimeAvailable = true,
): DesktopAgentStartupAudit {
  const routeDiagnostics = createAgentHostRouteCoverageDiagnostics({
    hostKind: 'electron',
    routes: ELECTRON_AGENT_HOST_ROUTE_COVERAGE,
  });
  if (routeDiagnostics.length > 0) {
    throw new Error(routeDiagnostics.map((diagnostic) => diagnostic.message).join(' '));
  }
  const missingRequirements = DESKTOP_AGENT_RUNTIME_REQUIREMENTS.filter((requirement) =>
    requirement === 'pi-runtime' ? !piRuntimeAvailable : !composition?.requirements[requirement],
  );
  if (missingRequirements.length === 0 && composition) {
    return { ready: true };
  }
  const diagnostic: DesktopAgentUnavailableDiagnostic = {
    code: 'desktop-agent-capability-unavailable',
    severity: 'error',
    missingRequirements,
    message:
      missingRequirements.length === 0
        ? 'Desktop Agent controller composition is unavailable.'
        : `Desktop Agent is unavailable because required composition is missing: ${missingRequirements.join(', ')}.`,
  };
  return {
    ready: false,
    diagnostic,
  };
}

export function createDesktopAgentBridgeRuntime(input: {
  readonly controllerComposition?: AgentControllerComposition;
  readonly createIdentity?: () => string;
}): DesktopAgentBridgeRuntime {
  return new DefaultDesktopAgentBridgeRuntime(input);
}

interface DesktopAgentConnection {
  readonly identity: DesktopAgentConnectionIdentity;
  readonly initialConversationId?: string;
  readonly controller: AgentHostMessageController;
  publish: (event: DesktopAgentMessageEvent) => void;
  readonly effects: AgentControllerEffects;
  readonly projectionAttachments: Map<string, ProjectionAttachmentKey>;
  lastFactsIdentity?: {
    readonly conversationId: string;
    readonly turnId: string;
    readonly runId: string;
  };
  sequence: number;
}

class DefaultDesktopAgentBridgeRuntime implements DesktopAgentBridgeRuntime {
  readonly startup: DesktopAgentStartupAudit;
  private readonly connections = new Map<string, DesktopAgentConnection>();
  private disposed = false;

  constructor(
    private readonly input: {
      readonly controllerComposition?: AgentControllerComposition;
      readonly createIdentity?: () => string;
    },
  ) {
    this.startup = auditDesktopAgentStartup(input.controllerComposition);
  }

  createBootstrap(input: {
    readonly requestId: string;
    readonly grant: DesktopAnyAgentConnectionGrant;
    readonly workspace: AgentWorkspaceRuntime | undefined;
    readonly initialConversationId?: string;
    readonly initialConversationMessage?: Message;
    readonly publish: (event: DesktopAgentMessageEvent) => void;
  }): DesktopAgentBootstrapProjection {
    this.requireActive();
    if (!this.startup.ready) {
      const diagnostic = this.startup.diagnostic;
      if (!diagnostic) {
        throw new Error('Desktop Agent startup audit is unavailable without a diagnostic.');
      }
      return {
        requestId: input.requestId,
        status: 'unavailable',
        diagnostic,
      };
    }
    const composition = this.input.controllerComposition;
    if (!composition) {
      throw new Error('Desktop Agent startup audit is ready without a controller composition.');
    }
    if (!input.workspace || input.workspace.workspaceId !== input.grant.workspaceId) {
      throw new DesktopAgentContractError(
        'desktop-agent-identity-mismatch',
        `Desktop Agent Workspace '${input.grant.workspaceId}' is not attached to AppHost.`,
      );
    }
    for (const connection of this.connections.values()) {
      if (!isSameConnectionGrant(connection.identity, input.grant)) continue;
      if (connection.initialConversationId !== input.initialConversationId) continue;
      connection.publish = input.publish;
      return {
        requestId: input.requestId,
        status: 'ready',
        connection: connection.identity,
      };
    }
    const identity: DesktopAgentConnectionIdentity = Object.freeze({
      ...input.grant,
      connectionId: this.input.createIdentity?.() ?? randomUUID(),
    });
    for (const [connectionId, connection] of this.connections) {
      if (
        connection.identity.windowId === identity.windowId &&
        connection.identity.workbenchInstanceId === identity.workbenchInstanceId &&
        connection.identity.agentSurfaceId === identity.agentSurfaceId
      ) {
        this.disposeConnection(connectionId, connection);
      }
    }
    const effects = composition.createEffects({
      workspace: input.workspace,
      identity,
      ...(input.initialConversationId === undefined
        ? {}
        : { initialConversationId: input.initialConversationId }),
      ...(input.initialConversationMessage === undefined
        ? {}
        : { initialConversationMessage: input.initialConversationMessage }),
    });
    const connection: DesktopAgentConnection = {
      identity,
      ...(input.initialConversationId === undefined
        ? {}
        : { initialConversationId: input.initialConversationId }),
      controller: createAgentHostMessageController(effects, {
        identity: {
          hostKind: 'electron',
          applicationId: 'neko-desktop',
          windowId: identity.windowId,
          viewId: identity.viewId,
          workspaceId: identity.workspaceId,
          connectionId: identity.connectionId,
        },
        post: (message) => {
          connection.sequence += 1;
          connection.publish({
            connection: connection.identity,
            sequence: connection.sequence,
            message,
          });
        },
      }),
      publish: input.publish,
      effects,
      projectionAttachments: new Map(),
      sequence: 0,
    };
    this.connections.set(identity.connectionId, connection);
    return {
      requestId: input.requestId,
      status: 'ready',
      connection: identity,
    };
  }

  async send(
    request: DesktopAgentMessageRequest,
    grant: DesktopAnyAgentConnectionGrant,
  ): Promise<DesktopAgentMessageResult> {
    this.requireActive();
    assertConnectionIdentity(request.connection, grant);
    const connection = this.connections.get(request.connection.connectionId);
    if (!connection) {
      throw new DesktopAgentContractError(
        'desktop-agent-identity-mismatch',
        `Unknown Desktop Agent connection '${request.connection.connectionId}'.`,
      );
    }
    assertConnectionIdentity(request.connection, connection.identity);
    const unavailable = createElectronAgentHostRouteUnavailableDiagnostic(request.message.type);
    if (unavailable) {
      return {
        requestId: request.requestId,
        status: 'unavailable',
        diagnostic: unavailable,
      };
    }
    const operation = connection.controller.tryHandle(request.message);
    if (!operation) {
      throw new Error(
        `Electron Agent route '${request.message.type}' is classified implemented but has no shared controller handler.`,
      );
    }
    await operation;
    return {
      requestId: request.requestId,
      status: 'accepted',
    };
  }

  async sendProjectionControl(
    request: DesktopAgentMessageRequest,
    grant: DesktopAgentProjectionSenderGrant,
  ): Promise<DesktopAgentMessageResult> {
    this.requireActive();
    assertProjectionSender(request.connection, grant);
    const connection = this.connections.get(request.connection.connectionId);
    if (connection) {
      assertConnectionIdentity(request.connection, connection.identity);
      if (!isProjectionControlMessage(request.message.type)) {
        throw new DesktopAgentContractError(
          'desktop-agent-identity-mismatch',
          `Desktop Agent route '${request.message.type}' is not connection-owned projection control.`,
        );
      }
      const operation = connection.controller.tryHandle(request.message);
      if (!operation) {
        throw new Error(
          `Desktop Agent projection route '${request.message.type}' has no shared controller handler.`,
        );
      }
      await operation;
      trackProjectionAttachment(connection, request.message);
      return acceptedAgentMessageResult(request.requestId);
    }
    throw new DesktopAgentContractError(
      'desktop-agent-identity-mismatch',
      `Unknown Desktop Agent projection connection '${request.connection.connectionId}'.`,
    );
  }

  async injectContext(input: {
    readonly windowId: string;
    readonly projectId: string;
    readonly workspaceId: string;
    readonly payload: AgentContextPayload;
  }): Promise<void> {
    this.requireActive();
    const matches = [...this.connections.values()].filter(
      (connection) =>
        connection.identity.windowId === input.windowId &&
        'projectId' in connection.identity &&
        connection.identity.projectId === input.projectId &&
        connection.identity.workspaceId === input.workspaceId,
    );
    const target = matches[0];
    if (matches.length !== 1 || target === undefined) {
      throw new Error(
        `Desktop Agent context target requires exactly one bound connection; found ${matches.length}.`,
      );
    }
    await target.effects.injectContext(input.payload);
  }

  waitForIdle(
    connectionIdentity: DesktopAgentConnectionIdentity,
    grant: DesktopAnyAgentConnectionGrant,
    conversationId: string,
    timeoutMs: number,
    afterIdentity?: { readonly turnId: string; readonly runId: string },
  ): Promise<{ readonly conversationId: string; readonly turnId: string; readonly runId: string }> {
    const connection = this.requireAutomationConnection(connectionIdentity, grant);
    const automation = requireAutomationEffects(connection);
    return automation.waitForIdle(conversationId, timeoutMs, afterIdentity);
  }

  readFacts(
    connectionIdentity: DesktopAgentConnectionIdentity,
    grant: DesktopAnyAgentConnectionGrant,
    identity: { readonly conversationId: string; readonly turnId: string; readonly runId: string },
  ): DesktopAgentNeutralFacts {
    const connection = this.requireAutomationConnection(connectionIdentity, grant);
    const facts = requireAutomationEffects(connection).readFacts(identity);
    connection.lastFactsIdentity = identity;
    return facts;
  }

  async disposeConnectionAndReadFacts(
    connectionIdentity: DesktopAgentConnectionIdentity,
    grant: DesktopAnyAgentConnectionGrant,
  ): Promise<DesktopAgentNeutralFacts> {
    const connection = this.requireAutomationConnection(connectionIdentity, grant);
    const identity = connection.lastFactsIdentity;
    if (!identity) {
      throw new Error('Desktop Agent automation close requires facts to be read first.');
    }
    this.connections.delete(connection.identity.connectionId);
    return requireAutomationEffects(connection).disposeAndReadFacts(identity);
  }

  detachSurface(windowId: string, workbenchInstanceId: string, agentSurfaceId: string): void {
    this.requireActive();
    this.disposeMatchingConnections(
      (connection) =>
        connection.identity.windowId === windowId &&
        connection.identity.workbenchInstanceId === workbenchInstanceId &&
        connection.identity.agentSurfaceId === agentSurfaceId,
      `Failed to detach Desktop Agent Surface '${agentSurfaceId}'.`,
    );
  }

  detachWorkbench(windowId: string, workbenchInstanceId: string): void {
    this.requireActive();
    this.disposeMatchingConnections(
      (connection) =>
        connection.identity.windowId === windowId &&
        connection.identity.workbenchInstanceId === workbenchInstanceId,
      `Failed to detach Desktop Agent Workbench '${workbenchInstanceId}'.`,
    );
  }

  detachConversation(windowId: string, conversationId: string): void {
    this.requireActive();
    this.disposeMatchingConnections(
      (connection) =>
        connection.identity.windowId === windowId &&
        connection.initialConversationId === conversationId,
      `Failed to detach Desktop Agent Conversation '${conversationId}'.`,
    );
  }

  detachWindow(windowId: string): void {
    this.requireActive();
    this.disposeMatchingConnections(
      (connection) => connection.identity.windowId === windowId,
      `Failed to detach Desktop Agent Window '${windowId}'.`,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeMatchingConnections(
      () => true,
      'Failed to dispose Desktop Agent connections.',
    );
  }

  private disposeMatchingConnections(
    matches: (connection: DesktopAgentConnection) => boolean,
    aggregateMessage: string,
  ): void {
    const errors: unknown[] = [];
    for (const [connectionId, connection] of this.connections) {
      if (!matches(connection)) continue;
      try {
        this.disposeConnection(connectionId, connection);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, aggregateMessage);
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Agent bridge runtime is disposed.');
  }

  private requireAutomationConnection(
    connectionIdentity: DesktopAgentConnectionIdentity,
    grant: DesktopAnyAgentConnectionGrant,
  ): DesktopAgentConnection {
    this.requireActive();
    assertConnectionIdentity(connectionIdentity, grant);
    const connection = this.connections.get(connectionIdentity.connectionId);
    if (!connection) {
      throw new DesktopAgentContractError(
        'desktop-agent-identity-mismatch',
        `Unknown Desktop Agent connection '${connectionIdentity.connectionId}'.`,
      );
    }
    assertConnectionIdentity(connectionIdentity, connection.identity);
    return connection;
  }

  private disposeConnection(connectionId: string, connection: DesktopAgentConnection): void {
    if (this.connections.get(connectionId) !== connection) return;
    this.connections.delete(connectionId);
    connection.effects.dispose();
  }
}

function trackProjectionAttachment(
  connection: DesktopAgentConnection,
  message: DesktopAgentMessageRequest['message'],
): void {
  if (message.type === 'projectionAttach') {
    connection.projectionAttachments.set(projectionAttachmentIdentity(message.key), message.key);
    return;
  }
  if (message.type === 'projectionDetach') {
    connection.projectionAttachments.delete(projectionAttachmentIdentity(message.key));
  }
}

function projectionAttachmentIdentity(key: ProjectionAttachmentKey): string {
  return JSON.stringify([key.attachmentId, key.tabId, key.conversationId]);
}

function acceptedAgentMessageResult(requestId: string): DesktopAgentMessageResult {
  return {
    requestId,
    status: 'accepted',
  };
}

function isProjectionControlMessage(type: string): boolean {
  return (
    type === 'projectionEndpointDiscover' ||
    type === 'projectionAttach' ||
    type === 'projectionSnapshotAck' ||
    type === 'projectionDetach'
  );
}

function assertProjectionSender(
  connection: DesktopAgentConnectionIdentity,
  grant: DesktopAgentProjectionSenderGrant,
): void {
  if (
    connection.applicationInstanceId !== grant.applicationInstanceId ||
    connection.windowId !== grant.windowId
  ) {
    throw new DesktopAgentContractError(
      'desktop-agent-identity-mismatch',
      `Desktop Agent connection '${connection.connectionId}' does not match its sender-derived Window.`,
    );
  }
}

function isSameExactConnection(
  left: DesktopAgentConnectionIdentity,
  right: DesktopAgentConnectionIdentity,
): boolean {
  return isSameConnectionGrant(left, right) && left.connectionId === right.connectionId;
}

function requireAutomationEffects(
  connection: DesktopAgentConnection,
): NonNullable<AgentControllerEffects['automation']> {
  if (!connection.effects.automation) {
    throw new Error('Desktop Agent complete-session automation facts are unavailable.');
  }
  return connection.effects.automation;
}

function isSameConnectionGrant(
  actual: DesktopAnyAgentConnectionGrant,
  expected: DesktopAnyAgentConnectionGrant,
): boolean {
  return (
    actual.applicationInstanceId === expected.applicationInstanceId &&
    actual.windowId === expected.windowId &&
    actual.workbenchInstanceId === expected.workbenchInstanceId &&
    actual.agentSurfaceId === expected.agentSurfaceId &&
    sameConnectionOwner(actual, expected) &&
    actual.workspaceId === expected.workspaceId &&
    actual.viewId === expected.viewId
  );
}

function assertConnectionIdentity(
  actual: DesktopAgentConnectionIdentity,
  expected: DesktopAnyAgentConnectionGrant,
): void {
  if (
    actual.applicationInstanceId !== expected.applicationInstanceId ||
    actual.windowId !== expected.windowId ||
    actual.workbenchInstanceId !== expected.workbenchInstanceId ||
    actual.agentSurfaceId !== expected.agentSurfaceId ||
    !sameConnectionOwner(actual, expected) ||
    actual.workspaceId !== expected.workspaceId ||
    actual.viewId !== expected.viewId
  ) {
    throw new DesktopAgentContractError(
      'desktop-agent-identity-mismatch',
      `Desktop Agent connection '${actual.connectionId}' does not match its sender-derived owner grant.`,
    );
  }
}

function sameConnectionOwner(
  actual: DesktopAgentConnectionIdentity | DesktopAnyAgentConnectionGrant,
  expected: DesktopAnyAgentConnectionGrant,
): boolean {
  return 'assistantSpaceId' in actual
    ? 'assistantSpaceId' in expected && actual.assistantSpaceId === expected.assistantSpaceId
    : 'projectId' in expected && actual.projectId === expected.projectId;
}
