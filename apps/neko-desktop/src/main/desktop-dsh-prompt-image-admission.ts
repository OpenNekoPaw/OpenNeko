import {
  AGENT_IMAGE_TRANSPORT_MAX_PAYLOADS,
  AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES,
  AGENT_IMAGE_TRANSPORT_MAX_TOTAL_BYTES,
  type AgentConversationContext,
} from '@neko/agent-contracts';
import { normalizeProviderImage } from '@neko/agent-runtime';
import {
  isWorkspaceFileContentLocator,
  type ContentLocator,
  type ContentReadService,
} from '@neko/content';

const SUPPORTED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

type SupportedImageMimeType = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

export interface DesktopDshPromptReference {
  readonly label: string;
  readonly contentLocator: ContentLocator;
}

export interface DesktopDshPromptImage {
  readonly referenceIndex: number;
  readonly data: string;
  readonly mimeType: SupportedImageMimeType;
}

export function createDesktopDshPromptImageAdmission(options: {
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
  readonly normalizeImage?: typeof normalizeProviderImage;
}) {
  const normalizeImage = options.normalizeImage ?? normalizeProviderImage;
  return Object.freeze({
    async admit(input: {
      readonly conversationId: string;
      readonly windowId: string;
      readonly references: readonly DesktopDshPromptReference[];
      readonly modelSupportsImageInput: boolean;
    }): Promise<readonly DesktopDshPromptImage[]> {
      if (input.references.length === 0) return [];
      const context = await options.contexts.readContext(input.conversationId);
      if (context === undefined) {
        throw new Error(
          `Conversation '${input.conversationId}' has no authoritative domain context.`,
        );
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
      const contentRead = options.createContentRead(authorized.workspace.workspacePath);
      const candidates: {
        readonly referenceIndex: number;
        readonly reference: DesktopDshPromptReference;
        readonly mimeType: SupportedImageMimeType;
      }[] = [];
      for (const [referenceIndex, reference] of input.references.entries()) {
        if (!isWorkspaceFileContentLocator(reference.contentLocator)) {
          throw new Error(
            `DSH Prompt reference '${reference.label}' is not an authorized Workspace file.`,
          );
        }
        const stat = await contentRead.stat(reference.contentLocator);
        if (stat.status === 'unavailable') {
          throw new Error(
            `DSH Prompt reference '${reference.label}' is unavailable: ${stat.diagnostic.code}.`,
          );
        }
        if (stat.mimeType?.startsWith('image/') !== true) continue;
        const mimeType = requireSupportedImageMimeType(stat.mimeType, reference.label);
        candidates.push({ referenceIndex, reference, mimeType });
      }
      if (candidates.length === 0) return [];
      if (!input.modelSupportsImageInput) {
        throw new Error('The selected chat model does not support image input.');
      }
      if (candidates.length > AGENT_IMAGE_TRANSPORT_MAX_PAYLOADS) {
        throw new Error(
          `DSH Prompt images exceed the limit of ${AGENT_IMAGE_TRANSPORT_MAX_PAYLOADS}.`,
        );
      }

      const admitted: DesktopDshPromptImage[] = [];
      let totalBytes = 0;
      for (const candidate of candidates) {
        const loaded = await contentRead.read(candidate.reference.contentLocator, {
          maxBytes: AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES,
        });
        if (loaded.status === 'unavailable') {
          throw new Error(
            `DSH Prompt image '${candidate.reference.label}' is unavailable: ${loaded.diagnostic.code}.`,
          );
        }
        const loadedMimeType = requireSupportedImageMimeType(
          loaded.mimeType,
          candidate.reference.label,
        );
        if (loadedMimeType !== candidate.mimeType) {
          throw new Error(
            `DSH Prompt image '${candidate.reference.label}' changed MIME while it was read.`,
          );
        }
        const normalized = await normalizeImage(loaded.bytes, loadedMimeType);
        const normalizedMimeType = requireSupportedImageMimeType(
          normalized.mimeType,
          candidate.reference.label,
        );
        totalBytes += normalized.bytes.byteLength;
        if (totalBytes > AGENT_IMAGE_TRANSPORT_MAX_TOTAL_BYTES) {
          throw new Error(
            `DSH Prompt images exceed the total payload limit of ${AGENT_IMAGE_TRANSPORT_MAX_TOTAL_BYTES} bytes.`,
          );
        }
        admitted.push({
          referenceIndex: candidate.referenceIndex,
          data: Buffer.from(normalized.bytes).toString('base64'),
          mimeType: normalizedMimeType,
        });
      }
      return admitted;
    },
  });
}

function requireSupportedImageMimeType(
  value: string | undefined,
  label: string,
): SupportedImageMimeType {
  if (SUPPORTED_IMAGE_MIME_TYPES.some((candidate) => candidate === value)) {
    return value as SupportedImageMimeType;
  }
  throw new Error(`DSH Prompt image '${label}' has unsupported MIME '${value ?? 'unknown'}'.`);
}
