import {
  parseAssistantResourceIdentity,
  parseAssistantResourceProjection,
  type AgentResourceGrantKind,
  type AgentConversationContext,
  type AgentScratchArtifactRef,
  type AssistantResourceIdentity,
  type AssistantResourceProjection,
} from '@neko/agent-contracts';
import type { AuthorizedPreviewSessionProjection } from '@neko/preview-domain/authorized-session';
import type {
  AgentConversationLifecycleRecord,
  AgentConversationLifecycleService,
} from './agent-conversation-lifecycle-service';

type AssistantConversationContext = Extract<
  AgentConversationContext,
  { readonly kind: 'assistant' }
>;
type AssistantConversationRecord = Omit<AgentConversationLifecycleRecord, 'context'> & {
  readonly context: AssistantConversationContext;
};

export interface AssistantResourcePreviewPort {
  authorize(input: {
    readonly identity: AssistantResourceIdentity;
    readonly artifact: AgentScratchArtifactRef;
  }): Promise<AuthorizedPreviewSessionProjection>;
  read(input: {
    readonly identity: AssistantResourceIdentity;
    readonly previewSessionId: string;
  }): AuthorizedPreviewSessionProjection;
  release(input: {
    readonly identity: AssistantResourceIdentity;
    readonly previewSessionId: string;
  }): void;
}

export interface AssistantResourceService {
  snapshot(identity: AssistantResourceIdentity): Promise<AssistantResourceProjection>;
  authorizePreview(input: {
    readonly identity: AssistantResourceIdentity;
    readonly scratchArtifactId: string;
  }): Promise<AuthorizedPreviewSessionProjection>;
  readPreview(input: {
    readonly identity: AssistantResourceIdentity;
    readonly previewSessionId: string;
  }): AuthorizedPreviewSessionProjection;
  releasePreview(input: {
    readonly identity: AssistantResourceIdentity;
    readonly previewSessionId: string;
  }): void;
}

export function createAssistantResourceService(options: {
  readonly lifecycle: Pick<AgentConversationLifecycleService, 'readConversation'>;
  readonly grants: {
    readConversationResourceGrants(conversationId: string): readonly {
      readonly resourceGrantId: string;
      readonly resourceKind: AgentResourceGrantKind;
      readonly label: string;
    }[];
  };
  readonly preview: AssistantResourcePreviewPort;
}): AssistantResourceService {
  const readOwnedRecord = async (
    identityValue: AssistantResourceIdentity,
  ): Promise<{
    readonly identity: AssistantResourceIdentity;
    readonly record: AssistantConversationRecord;
  }> => {
    const identity = parseAssistantResourceIdentity(identityValue);
    const record = await options.lifecycle.readConversation(identity.conversationId);
    if (
      record.context.kind !== 'assistant' ||
      record.context.assistantSpaceId !== identity.assistantSpaceId
    ) {
      throw new Error('Assistant Resource identity does not match its Conversation context.');
    }
    return { identity, record: { ...record, context: record.context } };
  };

  const service: AssistantResourceService = {
    async snapshot(identityValue) {
      const { identity, record } = await readOwnedRecord(identityValue);
      const grants = options.grants.readConversationResourceGrants(identity.conversationId);
      const grantsById = new Map(grants.map((grant) => [grant.resourceGrantId, grant]));
      const baseGrants = record.context.baseGrantIds.map((resourceGrantId) => {
        const grant = grantsById.get(resourceGrantId);
        if (!grant) {
          throw new Error(
            `Assistant Resource grant '${resourceGrantId}' is missing from its Conversation authority.`,
          );
        }
        return {
          resourceGrantId,
          assistantSpaceId: identity.assistantSpaceId,
          kind: grant.resourceKind,
          label: grant.label,
        };
      });
      return parseAssistantResourceProjection({
        identity,
        baseGrants,
        scratchArtifacts: record.scratchArtifacts,
      });
    },
    async authorizePreview(input) {
      const { identity, record } = await readOwnedRecord(input.identity);
      const artifact = record.scratchArtifacts.find(
        (candidate) => candidate.scratchArtifactId === input.scratchArtifactId,
      );
      if (!artifact) {
        throw new Error(
          `Assistant Scratch artifact '${input.scratchArtifactId}' does not belong to Conversation '${identity.conversationId}'.`,
        );
      }
      return options.preview.authorize({ identity, artifact });
    },
    readPreview(input) {
      return options.preview.read({
        ...input,
        identity: parseAssistantResourceIdentity(input.identity),
      });
    },
    releasePreview(input) {
      options.preview.release({
        ...input,
        identity: parseAssistantResourceIdentity(input.identity),
      });
    },
  };
  return Object.freeze(service);
}
