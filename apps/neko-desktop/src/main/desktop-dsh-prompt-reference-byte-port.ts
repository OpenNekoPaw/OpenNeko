import type { AgentConversationContext } from '@neko/agent-contracts';
import type {
  AgentPromptReference,
  AgentPromptReferenceBytePort,
} from '@neko/agent-runtime/application';
import { isWorkspaceFileContentLocator, type ContentReadService } from '@neko/content-domain';

export function createDesktopDshPromptReferenceBytePort(options: {
  readonly contexts: {
    readContext(conversationId: string): Promise<AgentConversationContext | undefined>;
  };
  readonly workspaceGrants: {
    restore(
      windowId: string,
      workspaceGrantId: string,
      workspaceId: string,
    ): Promise<{
      readonly workspace: {
        readonly workspaceId: string;
        readonly workspacePath: string;
      };
    }>;
  };
  readonly createContentRead: (workspacePath: string) => ContentReadService;
}) {
  return Object.freeze({
    authorize(input: {
      readonly conversationId: string;
      readonly windowId: string;
    }): AgentPromptReferenceBytePort {
      let contentRead: Promise<ContentReadService> | undefined;
      const resolveContentRead = () => {
        contentRead ??= authorizeContentRead(options, input);
        return contentRead;
      };
      return Object.freeze({
        async stat(reference: AgentPromptReference) {
          requireWorkspaceFileReference(reference);
          const result = await (await resolveContentRead()).stat(reference.contentLocator);
          if (result.status === 'unavailable') {
            throw new Error(
              `DSH Prompt reference '${reference.label}' is unavailable: ${result.diagnostic.code}.`,
            );
          }
          return { ...(result.mimeType === undefined ? {} : { mimeType: result.mimeType }) };
        },
        async read(reference: AgentPromptReference, readOptions: { readonly maxBytes: number }) {
          requireWorkspaceFileReference(reference);
          const result = await (
            await resolveContentRead()
          ).read(reference.contentLocator, readOptions);
          if (result.status === 'unavailable') {
            throw new Error(
              `DSH Prompt image '${reference.label}' is unavailable: ${result.diagnostic.code}.`,
            );
          }
          return {
            bytes: result.bytes,
            ...(result.mimeType === undefined ? {} : { mimeType: result.mimeType }),
          };
        },
      });
    },
  });
}

async function authorizeContentRead(
  options: Parameters<typeof createDesktopDshPromptReferenceBytePort>[0],
  input: { readonly conversationId: string; readonly windowId: string },
): Promise<ContentReadService> {
  const context = await options.contexts.readContext(input.conversationId);
  if (context === undefined) {
    throw new Error(`Conversation '${input.conversationId}' has no authoritative domain context.`);
  }
  if (context.kind !== 'workspace' && context.kind !== 'authoring') {
    throw new Error('DSH Prompt references require an exact Workspace-bound Conversation.');
  }
  const authorized = await options.workspaceGrants.restore(
    input.windowId,
    context.workspaceGrantId,
    context.workspaceId,
  );
  if (authorized.workspace.workspaceId !== context.workspaceId) {
    throw new Error(
      `Conversation Workspace '${context.workspaceId}' resolved to another Workspace.`,
    );
  }
  return options.createContentRead(authorized.workspace.workspacePath);
}

function requireWorkspaceFileReference(reference: AgentPromptReference): void {
  if (!isWorkspaceFileContentLocator(reference.contentLocator)) {
    throw new Error(
      `DSH Prompt reference '${reference.label}' is not an authorized Workspace file.`,
    );
  }
}
