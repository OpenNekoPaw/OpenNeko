import { randomUUID } from 'node:crypto';
import {
  createAgentLaunchApplicationService,
  projectAgentLaunchBaseCatalog,
  type AgentAppHost,
  type AgentLaunchApplicationService,
} from '@neko/agent-runtime/application';
import type { ConfigManager } from '@neko/host/settings';
import type {
  AgentAuthorityScopeProjection,
  AgentLaunchCatalogProjection,
  AgentLaunchConnectionIdentity,
  AgentLaunchResourceKind,
  AgentConversationContext,
} from '@neko/agent-contracts';

export interface DesktopAgentLaunchNativeSelection {
  readonly label: string;
  readonly hostResource?: string;
}

interface DesktopAgentResourceGrant {
  readonly connectionId: string;
  readonly resourceKind: AgentLaunchResourceKind;
  scope: AgentAuthorityScopeProjection;
  readonly label: string;
  readonly hostResource?: string;
  conversationId?: string;
}

export interface DesktopAgentLaunchRuntime {
  attach(input: {
    readonly applicationInstanceId: string;
    readonly windowId: string;
    readonly viewId: string;
    readonly rendererEpoch: number;
    readonly scope: AgentAuthorityScopeProjection;
  }): Promise<AgentLaunchCatalogProjection>;
  readCatalog(connection: AgentLaunchConnectionIdentity): AgentLaunchCatalogProjection;
  authorizeResource(
    connection: AgentLaunchConnectionIdentity,
    resourceKind: AgentLaunchResourceKind,
  ): Promise<AgentLaunchCatalogProjection | undefined>;
  bindAssistantResourceGrants(
    connection: AgentLaunchConnectionIdentity,
    assistantSpaceId: string,
    resourceGrantIds: readonly string[],
  ): Promise<void>;
  detach(connection: AgentLaunchConnectionIdentity): Promise<void>;
  validateResourceGrants(
    context: AgentConversationContext,
    resourceGrantIds: readonly string[],
  ): Promise<void>;
  commitResourceGrants(
    connection: AgentLaunchConnectionIdentity,
    conversationId: string,
    resourceGrantIds: readonly string[],
  ): Promise<void>;
  readConversationResourceGrants(conversationId: string): readonly {
    readonly resourceGrantId: string;
    readonly resourceKind: AgentLaunchResourceKind;
    readonly label: string;
  }[];
  resolveResourceContexts(
    context: AgentConversationContext,
    resourceGrantIds: readonly string[],
  ): Promise<readonly import('@neko/agent-contracts').AgentContextPayload[]>;
  detachWindow(windowId: string): Promise<void>;
  dispose(): Promise<void>;
}

export function createDesktopAgentLaunchRuntime(input: {
  readonly agent: Pick<AgentAppHost, 'readGlobalSkillCatalog'>;
  readonly config: Pick<ConfigManager, 'getAssistantConfigState'>;
  readonly selectResource: (input: {
    readonly windowId: string;
    readonly resourceKind: AgentLaunchResourceKind;
  }) => Promise<DesktopAgentLaunchNativeSelection | undefined>;
  readonly createIdentity?: () => string;
  readonly readTextResource: (hostResource: string) => Promise<string>;
}): DesktopAgentLaunchRuntime {
  const createIdentity = input.createIdentity ?? randomUUID;
  const grants = new Map<string, DesktopAgentResourceGrant>();
  const service: AgentLaunchApplicationService = createAgentLaunchApplicationService({
    createIdentity,
    catalog: {
      readCatalog: async () =>
        projectAgentLaunchBaseCatalog({
          config: input.config.getAssistantConfigState(),
          skills: await input.agent.readGlobalSkillCatalog(),
        }),
    },
    authorization: {
      authorize: async ({ connection, resourceKind }) => {
        const selected = await input.selectResource({
          windowId: connection.windowId,
          resourceKind,
        });
        if (!selected) return { status: 'cancelled' };
        const resourceGrantId = createIdentity();
        grants.set(resourceGrantId, {
          connectionId: connection.connectionId,
          resourceKind,
          scope: connection.scope,
          label: selected.label,
          ...(selected.hostResource === undefined ? {} : { hostResource: selected.hostResource }),
        });
        return {
          status: 'authorized',
          resource: {
            kind: 'resource',
            id: `resource:${resourceGrantId}`,
            label: selected.label,
            scopeRequirement: connection.scope.kind === 'unbound' ? 'any' : connection.scope.kind,
            resourceGrantId,
            resourceKind,
          },
        };
      },
      releaseConnection: async (connection) => {
        for (const [grantId, grant] of grants) {
          if (grant.connectionId === connection.connectionId && !grant.conversationId) {
            grants.delete(grantId);
          }
        }
      },
    },
  });
  return {
    attach: (attachInput) => service.attach(attachInput),
    readCatalog: (connection) => service.readCatalog(connection),
    authorizeResource: (connection, resourceKind) =>
      service.authorizeResource(connection, resourceKind),
    async bindAssistantResourceGrants(connection, assistantSpaceId, resourceGrantIds) {
      if (connection.scope.kind !== 'unbound') {
        throw new Error('Assistant Resource grant binding requires an unbound launch connection.');
      }
      const targetScope = { kind: 'assistant' as const, assistantSpaceId };
      const pending: DesktopAgentResourceGrant[] = [];
      for (const resourceGrantId of resourceGrantIds) {
        const grant = grants.get(resourceGrantId);
        if (!grant || grant.connectionId !== connection.connectionId) {
          throw new Error(
            `Agent Resource grant '${resourceGrantId}' does not belong to its launch connection.`,
          );
        }
        if (
          grant.scope.kind === 'assistant' &&
          grant.scope.assistantSpaceId === assistantSpaceId
        ) {
          continue;
        }
        if (
          grant.scope.kind !== 'unbound' ||
          grant.scope.draftId !== connection.scope.draftId ||
          grant.conversationId
        ) {
          throw new Error(`Agent Resource grant '${resourceGrantId}' belongs to another scope.`);
        }
        pending.push(grant);
      }
      for (const grant of pending) grant.scope = targetScope;
    },
    detach: (connection) => service.detach(connection),
    detachWindow: (windowId) => service.detachWindow(windowId),
    dispose: () => service.dispose(),
    async validateResourceGrants(context, resourceGrantIds) {
      for (const resourceGrantId of resourceGrantIds) {
        const grant = grants.get(resourceGrantId);
        if (!grant) throw new Error(`Agent Resource grant '${resourceGrantId}' is not present.`);
        const scopeMatches =
          context.kind === 'assistant'
            ? grant.scope.kind === 'assistant' &&
              grant.scope.assistantSpaceId === context.assistantSpaceId
            : grant.scope.kind === 'workspace' &&
              grant.scope.workspaceId === context.workspaceId &&
              grant.scope.workspaceGrantId === context.workspaceGrantId;
        if (!scopeMatches) {
          throw new Error(`Agent Resource grant '${resourceGrantId}' belongs to another scope.`);
        }
      }
    },
    async commitResourceGrants(connection, conversationId, resourceGrantIds) {
      for (const resourceGrantId of resourceGrantIds) {
        const grant = grants.get(resourceGrantId);
        if (!grant || grant.connectionId !== connection.connectionId) {
          throw new Error(
            `Agent Resource grant '${resourceGrantId}' does not belong to its launch connection.`,
          );
        }
        if (grant.conversationId && grant.conversationId !== conversationId) {
          throw new Error(
            `Agent Resource grant '${resourceGrantId}' is already bound to another Conversation.`,
          );
        }
        grant.conversationId = conversationId;
      }
    },
    async resolveResourceContexts(context, resourceGrantIds) {
      await this.validateResourceGrants(context, resourceGrantIds);
      return Promise.all(
        resourceGrantIds.map(async (resourceGrantId) => {
          const grant = grants.get(resourceGrantId);
          if (!grant) throw new Error(`Agent Resource grant '${resourceGrantId}' is not present.`);
          if (grant.resourceKind !== 'file' || !grant.hostResource) {
            throw new Error(
              `Agent Resource grant '${resourceGrantId}' cannot be projected into provider context.`,
            );
          }
          const text = await input.readTextResource(grant.hostResource);
          if (text.includes('\u0000')) {
            throw new Error(`Agent Resource grant '${resourceGrantId}' is not a text file.`);
          }
          if (text.length > MAX_AGENT_AUTHORIZED_TEXT_CHARS) {
            throw new Error(
              `Agent Resource grant '${resourceGrantId}' exceeds the provider context limit.`,
            );
          }
          return {
            type: 'file' as const,
            id: resourceGrantId,
            label: grant.label,
            summary: `Authorized file: ${grant.label}`,
            data: { text },
          };
        }),
      );
    },
    readConversationResourceGrants(conversationId) {
      return [...grants.entries()]
        .filter(([, grant]) => grant.conversationId === conversationId)
        .map(([resourceGrantId, grant]) => ({
          resourceGrantId,
          resourceKind: grant.resourceKind,
          label: grant.label,
        }));
    },
  };
}

const MAX_AGENT_AUTHORIZED_TEXT_CHARS = 256 * 1024;
