import { randomUUID } from 'node:crypto';
import {
  createAgentLaunchApplicationService,
  AGENT_LAUNCH_BUILTIN_COMMAND_HANDLER_IDS,
  projectAgentLaunchBaseCatalog,
  type AgentAppHost,
  type AgentLaunchApplicationService,
  type AgentLaunchWorkspaceMentionSearchPort,
} from '@neko/agent-runtime/application';
import type { ConfigManager } from '@neko/host/settings';
import { DESKTOP_DEFAULT_ASSISTANT_SPACE_ID } from '@neko/host/desktop-shell-state';
import { AGENT_AUTHORIZED_CONTENT_REFERENCE_KIND } from '@neko/agent-contracts';
import type {
  AgentBoundDomainBinding,
  AgentDomainBinding,
  AgentDraftInteractionProjection,
  AgentDraftMentionSearchProjection,
  AgentDraftSubmitInput,
  AgentConfigurationRequest,
  AgentConfigurationPolicyProjection,
  AgentInputReferenceReceipt,
  AgentContextPayload,
  AgentFileReference,
  AgentLaunchCatalogProjection,
  AgentLaunchConnectionIdentity,
  AgentLaunchResourceKind,
  MessageContextReference,
  ProjectFileMentionInfo,
  ProjectMentionExtra,
} from '@neko/agent-contracts';

export interface DesktopAgentConversationReferenceResolver {
  resolve(input: {
    readonly conversationId: string;
    readonly context: AgentBoundDomainBinding;
    readonly references: readonly AgentFileReference[];
  }): Promise<readonly AgentContextPayload[]>;
  resolveWorkspaceReferences(input: {
    readonly context: Extract<AgentBoundDomainBinding, { readonly kind: 'workspace' }>;
    readonly references: readonly AgentFileReference[];
  }): Promise<readonly AgentContextPayload[]>;
}

export function createDesktopAgentConversationReferenceResolver(input: {
  readonly authorizeWorkspace: (
    binding: Extract<AgentBoundDomainBinding, { readonly kind: 'workspace' }>,
  ) => Promise<void>;
}): DesktopAgentConversationReferenceResolver {
  const resolveWorkspaceReferences: DesktopAgentConversationReferenceResolver['resolveWorkspaceReferences'] =
    async ({ context, references }) => {
      await input.authorizeWorkspace(context);
      return references.map(resolveReference);
    };
  return {
    async resolve({ context, references }) {
      if (context.kind !== 'workspace') {
        throw new Error(
          `Agent ${context.kind} Conversation does not authorize Workspace file locators.`,
        );
      }
      return resolveWorkspaceReferences({ context, references });
    },
    resolveWorkspaceReferences,
  };

  function resolveReference(reference: AgentFileReference): AgentContextPayload {
    const locator = reference.contentLocator;
    if (locator.kind !== 'workspace-file') {
      throw new Error(`Agent reference '${reference.label}' is not a Workspace file locator.`);
    }
    return {
      type: 'file',
      id: reference.id,
      label: reference.label,
      summary: `Workspace content: ${reference.label} (ContentLocator: workspace-file:${locator.path})`,
      data: {
        kind: AGENT_AUTHORIZED_CONTENT_REFERENCE_KIND,
        locator,
        ...(reference.mediaType === undefined ? {} : { mediaType: reference.mediaType }),
        ...(reference.source === undefined ? {} : { source: reference.source }),
      },
    };
  }
}

export interface DesktopAgentLaunchNativeSelection {
  readonly label: string;
  readonly hostResource?: string;
}

interface DesktopAgentResourceGrant {
  readonly connectionId: string;
  readonly resourceKind: AgentLaunchResourceKind;
  binding: AgentDomainBinding;
  readonly label: string;
  readonly hostResource?: string;
  conversationId?: string;
}

export type DesktopAgentWorkspaceReference =
  | { readonly kind: 'file'; readonly file: ProjectFileMentionInfo }
  | { readonly kind: 'entity'; readonly entity: ProjectMentionExtra };

interface DesktopAgentReferenceGrant {
  readonly connectionId: string;
  readonly binding: Extract<AgentDomainBinding, { readonly kind: 'workspace' }>;
  readonly reference: DesktopAgentWorkspaceReference;
  conversationId?: string;
}

export interface DesktopAgentLaunchRuntime {
  attach(input: {
    readonly applicationInstanceId: string;
    readonly windowId: string;
    readonly workbenchInstanceId: string;
    readonly agentSurfaceId: string;
    readonly viewId: string;
    readonly draft: AgentDraftInteractionProjection;
  }): Promise<AgentLaunchCatalogProjection>;
  readCatalog(connection: AgentLaunchConnectionIdentity): AgentLaunchCatalogProjection;
  authorizeResource(
    connection: AgentLaunchConnectionIdentity,
    resourceKind: AgentLaunchResourceKind,
  ): Promise<AgentLaunchCatalogProjection | undefined>;
  bindTarget(
    connection: AgentLaunchConnectionIdentity,
    binding: AgentDomainBinding,
  ): Promise<AgentLaunchCatalogProjection>;
  updateConfiguration(
    connection: AgentLaunchConnectionIdentity,
    configuration: AgentConfigurationRequest,
  ): AgentLaunchCatalogProjection;
  searchWorkspaceMentions(
    connection: AgentLaunchConnectionIdentity,
    bindingReceiptId: string,
    filter: string,
  ): Promise<AgentDraftMentionSearchProjection>;
  validateDraftSubmit(
    connection: AgentLaunchConnectionIdentity,
    input: AgentDraftSubmitInput,
  ): AgentConfigurationPolicyProjection;
  detach(connection: AgentLaunchConnectionIdentity): Promise<void>;
  validateResourceGrants(
    context: AgentBoundDomainBinding,
    resourceGrantIds: readonly string[],
  ): Promise<void>;
  commitResourceGrants(
    connection: AgentLaunchConnectionIdentity,
    conversationId: string,
    resourceGrantIds: readonly string[],
  ): Promise<void>;
  validateResourceGrantCommit(
    connection: AgentLaunchConnectionIdentity,
    conversationId: string | undefined,
    resourceGrantIds: readonly string[],
  ): void;
  validateReferenceCommit(
    connection: AgentLaunchConnectionIdentity,
    conversationId: string | undefined,
    references: readonly AgentInputReferenceReceipt[],
  ): void;
  projectReferenceMessageContexts(
    connection: AgentLaunchConnectionIdentity,
    conversationId: string | undefined,
    references: readonly AgentInputReferenceReceipt[],
  ): readonly MessageContextReference[];
  commitReferences(
    connection: AgentLaunchConnectionIdentity,
    conversationId: string,
    references: readonly AgentInputReferenceReceipt[],
  ): void;
  readConversationResourceGrants(conversationId: string): readonly {
    readonly resourceGrantId: string;
    readonly resourceKind: AgentLaunchResourceKind;
    readonly label: string;
  }[];
  resolveResourceContexts(
    context: AgentBoundDomainBinding,
    resourceGrantIds: readonly string[],
  ): Promise<readonly import('@neko/agent-contracts').AgentContextPayload[]>;
  resolveReferenceContexts(
    conversationId: string,
    context: AgentBoundDomainBinding,
    references: readonly AgentInputReferenceReceipt[],
  ): Promise<readonly AgentContextPayload[]>;
  detachWindow(windowId: string): Promise<void>;
  dispose(): Promise<void>;
}

export function createDesktopAgentLaunchRuntime(input: {
  readonly agent: Pick<AgentAppHost, 'readGlobalSkillCatalog'>;
  readonly config: Pick<
    ConfigManager,
    'getAssistantConfigState' | 'getAssistantRuntimeSettingsSnapshot'
  >;
  readonly selectResource: (input: {
    readonly windowId: string;
    readonly resourceKind: AgentLaunchResourceKind;
  }) => Promise<DesktopAgentLaunchNativeSelection | undefined>;
  readonly createIdentity?: () => string;
  readonly readTextResource: (hostResource: string) => Promise<string>;
  readonly workspaceMentions: AgentLaunchWorkspaceMentionSearchPort;
  readonly readWorkspaceSkillCatalog: (
    binding: Extract<AgentDomainBinding, { readonly kind: 'workspace' }>,
  ) => Promise<Awaited<ReturnType<AgentAppHost['readGlobalSkillCatalog']>>>;
  readonly resolveWorkspaceReferenceContext: (input: {
    readonly binding: Extract<AgentDomainBinding, { readonly kind: 'workspace' }>;
    readonly reference: DesktopAgentWorkspaceReference;
  }) => Promise<AgentContextPayload>;
}): DesktopAgentLaunchRuntime {
  const createIdentity = input.createIdentity ?? randomUUID;
  const grants = new Map<string, DesktopAgentResourceGrant>();
  const references = new Map<string, DesktopAgentReferenceGrant>();
  const service: AgentLaunchApplicationService = createAgentLaunchApplicationService({
    createIdentity,
    catalog: {
      readCatalog: async (interaction) => {
        const skills =
          interaction.binding.kind === 'workspace'
            ? await input.readWorkspaceSkillCatalog(interaction.binding)
            : await input.agent.readGlobalSkillCatalog();
        return projectAgentLaunchBaseCatalog({
          config: input.config.getAssistantConfigState(),
          thinkingBudget: input.config.getAssistantRuntimeSettingsSnapshot().thinkingBudget,
          skills,
          interaction,
          personalSkillOwnerId: DESKTOP_DEFAULT_ASSISTANT_SPACE_ID,
          launchCommandHandlerIds: AGENT_LAUNCH_BUILTIN_COMMAND_HANDLER_IDS,
        });
      },
    },
    authorization: {
      authorize: async ({ connection, interaction, resourceKind }) => {
        const selected = await input.selectResource({
          windowId: connection.windowId,
          resourceKind,
        });
        if (!selected) return { status: 'cancelled' };
        const resourceGrantId = createIdentity();
        grants.set(resourceGrantId, {
          connectionId: connection.connectionId,
          resourceKind,
          binding: interaction.binding,
          label: selected.label,
          ...(selected.hostResource === undefined ? {} : { hostResource: selected.hostResource }),
        });
        return {
          status: 'authorized',
          entry: {
            id: `mention:resource:${resourceGrantId}`,
            name: selected.label,
            description: `Authorized ${resourceKind}: ${selected.label}`,
            trigger: 'mention',
            prefix: '@',
            phaseRequirement: 'draft',
            bindingRequirement:
              interaction.binding.kind === 'unbound' ? 'assistant' : interaction.binding.kind,
            source: {
              kind: 'personal',
              ownerId: bindingOwnerId(interaction.binding),
              sourceId: resourceGrantId,
            },
            availability: { status: 'available' },
            executable: {
              kind: 'reference',
              referenceId: resourceGrantId,
              ownerKind:
                interaction.binding.kind === 'unbound' ? 'assistant' : interaction.binding.kind,
              ownerId: bindingOwnerId(interaction.binding),
            },
          },
        };
      },
      releaseConnection: async (connection) => {
        for (const [grantId, grant] of grants) {
          if (grant.connectionId === connection.connectionId && !grant.conversationId) {
            grants.delete(grantId);
          }
        }
        for (const [referenceId, reference] of references) {
          if (reference.connectionId === connection.connectionId && !reference.conversationId) {
            references.delete(referenceId);
          }
        }
      },
    },
    workspaceMentions: input.workspaceMentions,
  });
  return {
    attach: (attachInput) => service.attach(attachInput),
    readCatalog: (connection) => service.readCatalog(connection),
    authorizeResource: (connection, resourceKind) =>
      service.authorizeResource(connection, resourceKind),
    bindTarget: (connection, binding) => service.replaceBinding(connection, binding),
    updateConfiguration: (connection, configuration) =>
      service.updateConfiguration(connection, configuration),
    searchWorkspaceMentions: async (connection, bindingReceiptId, filter) => {
      const projection = await service.searchWorkspaceMentions(
        connection,
        bindingReceiptId,
        filter,
      );
      const interaction = service.readCatalog(connection).interaction;
      if (interaction.binding.kind !== 'workspace') {
        throw new Error('Agent Workspace mention search resolved outside a Workspace binding.');
      }
      for (const file of projection.files) {
        references.set(file.referenceReceipt.referenceId, {
          connectionId: connection.connectionId,
          binding: interaction.binding,
          reference: { kind: 'file', file },
        });
      }
      for (const entity of projection.mentionExtras) {
        references.set(entity.referenceReceipt.referenceId, {
          connectionId: connection.connectionId,
          binding: interaction.binding,
          reference: { kind: 'entity', entity },
        });
      }
      return projection;
    },
    validateDraftSubmit: (connection, draftInput) =>
      service.validateDraftSubmit(connection, draftInput),
    detach: (connection) => service.detach(connection),
    detachWindow: (windowId) => service.detachWindow(windowId),
    dispose: () => service.dispose(),
    async validateResourceGrants(context, resourceGrantIds) {
      for (const resourceGrantId of resourceGrantIds) {
        const grant = grants.get(resourceGrantId);
        if (!grant) throw new Error(`Agent Resource grant '${resourceGrantId}' is not present.`);
        const scopeMatches =
          context.kind === 'assistant'
            ? grant.binding.kind === 'assistant' &&
              grant.binding.assistantSpaceId === context.assistantSpaceId
            : context.kind === 'workspace' &&
              grant.binding.kind === 'workspace' &&
              grant.binding.workspaceId === context.workspaceId &&
              grant.binding.workspaceGrantId === context.workspaceGrantId;
        if (!scopeMatches) {
          throw new Error(`Agent Resource grant '${resourceGrantId}' belongs to another scope.`);
        }
      }
    },
    validateResourceGrantCommit(connection, conversationId, resourceGrantIds) {
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
      }
    },
    async commitResourceGrants(connection, conversationId, resourceGrantIds) {
      this.validateResourceGrantCommit(connection, conversationId, resourceGrantIds);
      for (const resourceGrantId of resourceGrantIds) {
        const grant = grants.get(resourceGrantId);
        if (!grant) throw new Error(`Agent Resource grant '${resourceGrantId}' is not present.`);
        grant.conversationId = conversationId;
      }
    },
    validateReferenceCommit(connection, conversationId, receipts) {
      for (const receipt of receipts) {
        const reference = references.get(receipt.referenceId);
        if (
          !reference ||
          reference.connectionId !== connection.connectionId ||
          receipt.ownerKind !== 'workspace' ||
          receipt.ownerId !== reference.binding.workspaceId
        ) {
          throw new Error(
            `Agent reference '${receipt.referenceId}' does not belong to its launch connection.`,
          );
        }
        if (reference.conversationId && reference.conversationId !== conversationId) {
          throw new Error(
            `Agent reference '${receipt.referenceId}' is already bound to another Conversation.`,
          );
        }
      }
    },
    projectReferenceMessageContexts(connection, conversationId, receipts) {
      this.validateReferenceCommit(connection, conversationId, receipts);
      return receipts.map((receipt) => {
        const granted = references.get(receipt.referenceId);
        if (!granted) throw new Error(`Agent reference '${receipt.referenceId}' is not present.`);
        return projectReferenceMessageContext(receipt.referenceId, granted.reference);
      });
    },
    commitReferences(connection, conversationId, receipts) {
      this.validateReferenceCommit(connection, conversationId, receipts);
      for (const receipt of receipts) {
        const reference = references.get(receipt.referenceId);
        if (!reference) throw new Error(`Agent reference '${receipt.referenceId}' is not present.`);
        reference.conversationId = conversationId;
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
    async resolveReferenceContexts(conversationId, context, receipts) {
      return Promise.all(
        receipts.map(async (receipt) => {
          const reference = references.get(receipt.referenceId);
          if (!reference || reference.conversationId !== conversationId) {
            throw new Error(
              `Agent reference '${receipt.referenceId}' is not committed to Conversation '${conversationId}'.`,
            );
          }
          if (
            context.kind !== 'workspace' ||
            reference.binding.workspaceId !== context.workspaceId ||
            reference.binding.workspaceGrantId !== context.workspaceGrantId
          ) {
            throw new Error(`Agent reference '${receipt.referenceId}' belongs to another scope.`);
          }
          return input.resolveWorkspaceReferenceContext({
            binding: reference.binding,
            reference: reference.reference,
          });
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

function projectReferenceMessageContext(
  referenceId: string,
  reference: DesktopAgentWorkspaceReference,
): MessageContextReference {
  if (reference.kind === 'file') {
    const file = reference.file;
    return {
      type: referenceMessageContextType(file.mediaType, file.source),
      id: referenceId,
      label: file.name,
      summary: file.locator.path,
      ...(file.mediaType === undefined ? {} : { mediaType: file.mediaType }),
      contentLocator: file.locator,
    };
  }
  const entity = reference.entity;
  return {
    type: entity.type,
    id: entity.id,
    label: entity.label,
    summary: entity.summary,
    ...(entity.thumbnailUri === undefined ? {} : { thumbnailUri: entity.thumbnailUri }),
    ...(entity.mediaType === undefined ? {} : { mediaType: entity.mediaType }),
    ...(entity.contentLocator === undefined ? {} : { contentLocator: entity.contentLocator }),
  };
}

function referenceMessageContextType(
  mediaType: ProjectFileMentionInfo['mediaType'],
  source: ProjectFileMentionInfo['source'],
): MessageContextReference['type'] {
  if (mediaType === 'image') return 'image';
  if (mediaType === 'audio') return 'audio-clip';
  if (mediaType === 'video' || mediaType === 'sequence' || source === 'media-library') {
    return 'media';
  }
  return 'file';
}

function bindingOwnerId(binding: AgentDomainBinding): string {
  switch (binding.kind) {
    case 'unbound':
      return DESKTOP_DEFAULT_ASSISTANT_SPACE_ID;
    case 'assistant':
      return binding.assistantSpaceId;
    case 'workspace':
      return binding.workspaceId;
    case 'character':
      return binding.characterRunId ?? binding.characterVersionId;
    case 'room':
      return binding.roomRunId;
    case 'world':
      return binding.worldRunId ?? binding.worldExperienceVersionId;
  }
}
