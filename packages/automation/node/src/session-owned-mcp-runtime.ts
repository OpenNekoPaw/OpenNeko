import {
  sameAutomationTarget,
  type AutomationMode,
  type AutomationTarget,
} from '@neko/automation-contracts';
import type {
  AutomationMcpCallResult,
  AutomationMcpRuntimePort,
  AutomationMcpToolDefinition,
} from './mcp-provider';

export interface AutomationMcpClientPort {
  connect(input: { readonly signal?: AbortSignal }): Promise<void>;
  disconnect(): Promise<void>;
  listTools(input: {
    readonly signal?: AbortSignal;
  }): Promise<readonly AutomationMcpToolDefinition[]>;
  callTool(input: {
    readonly name: string;
    readonly arguments: Readonly<Record<string, unknown>>;
    readonly signal?: AbortSignal;
  }): Promise<AutomationMcpCallResult>;
}

export interface AutomationMcpClientFactoryPort {
  createQualificationClient(): AutomationMcpClientPort;
  createSessionClient(input: {
    readonly sessionId: string;
    readonly target: AutomationTarget;
    readonly mode: AutomationMode;
    readonly timeoutMs: number;
  }): AutomationMcpClientPort;
}

export interface AutomationTargetRevalidationPort {
  revalidate(input: {
    readonly target: AutomationTarget;
    readonly signal?: AbortSignal;
  }): Promise<AutomationTarget>;
}

export interface SessionOwnedAutomationMcpRuntime extends AutomationMcpRuntimePort {
  dispose(): Promise<void>;
}

interface OwnedMcpSession {
  readonly target: AutomationTarget;
  readonly client: AutomationMcpClientPort;
}

export function createSessionOwnedAutomationMcpRuntime(options: {
  readonly clients: AutomationMcpClientFactoryPort;
  readonly targets: AutomationTargetRevalidationPort;
}): SessionOwnedAutomationMcpRuntime {
  const sessions = new Map<string, OwnedMcpSession>();
  const claimedClients = new Set<AutomationMcpClientPort>();

  return {
    async inspectTools(input) {
      const client = options.clients.createQualificationClient();
      claimExclusiveClient(claimedClients, client);
      try {
        await client.connect(input);
        return await client.listTools(input);
      } finally {
        await client.disconnect();
      }
    },

    async openSession(input) {
      if (sessions.has(input.sessionId)) {
        throw new Error(`Automation MCP session '${input.sessionId}' already exists.`);
      }
      const client = options.clients.createSessionClient({
        sessionId: input.sessionId,
        target: input.target,
        mode: input.mode,
        timeoutMs: input.timeoutMs,
      });
      claimExclusiveClient(claimedClients, client);
      try {
        await client.connect({ ...(input.signal === undefined ? {} : { signal: input.signal }) });
      } catch (error) {
        await client.disconnect();
        throw error;
      }
      sessions.set(input.sessionId, { target: input.target, client });
      return { providerSessionId: input.sessionId };
    },

    async revalidateTarget(input) {
      const session = requireSession(sessions, input.providerSessionId);
      if (!sameAutomationTarget(session.target, input.expected)) {
        throw new Error('Automation MCP target does not belong to the provider session.');
      }
      return options.targets.revalidate({
        target: session.target,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
    },

    async callTool(input) {
      const session = requireSession(sessions, input.providerSessionId);
      return await session.client.callTool({
        name: input.name,
        arguments: input.arguments,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
    },

    async closeSession(providerSessionId) {
      const session = requireSession(sessions, providerSessionId);
      sessions.delete(providerSessionId);
      await session.client.disconnect();
    },

    async dispose() {
      const owned = [...sessions.values()];
      sessions.clear();
      await Promise.all(owned.map((session) => session.client.disconnect()));
    },
  };
}

function claimExclusiveClient(
  claimedClients: Set<AutomationMcpClientPort>,
  client: AutomationMcpClientPort,
): void {
  if (claimedClients.has(client)) {
    throw new Error('Automation MCP client is already owned by another qualification or session.');
  }
  claimedClients.add(client);
}

function requireSession(
  sessions: ReadonlyMap<string, OwnedMcpSession>,
  providerSessionId: string,
): OwnedMcpSession {
  const session = sessions.get(providerSessionId);
  if (!session) {
    throw new Error(`Automation MCP session '${providerSessionId}' is unavailable.`);
  }
  return session;
}
