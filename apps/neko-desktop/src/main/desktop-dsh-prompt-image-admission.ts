import {
  AGENT_IMAGE_TRANSPORT_MAX_PAYLOADS,
  AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES,
  AGENT_IMAGE_TRANSPORT_MAX_TOTAL_BYTES,
  type AgentConversationContext,
  type DshComposerImageInput,
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
  readonly source:
    | { readonly kind: 'reference'; readonly referenceIndex: number }
    | { readonly kind: 'inline'; readonly imageIndex: number; readonly name: string };
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
      readonly images: readonly DshComposerImageInput[];
      readonly modelSupportsImageInput: boolean;
    }): Promise<readonly DesktopDshPromptImage[]> {
      if (input.references.length === 0 && input.images.length === 0) return [];
      const candidates: {
        readonly source: DesktopDshPromptImage['source'];
        readonly label: string;
        readonly mimeType: SupportedImageMimeType;
        readonly load: () => Promise<Uint8Array>;
      }[] = [];
      if (input.references.length > 0) {
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
          candidates.push({
            source: { kind: 'reference', referenceIndex },
            label: reference.label,
            mimeType,
            load: async () => {
              const loaded = await contentRead.read(reference.contentLocator, {
                maxBytes: AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES,
              });
              if (loaded.status === 'unavailable') {
                throw new Error(
                  `DSH Prompt image '${reference.label}' is unavailable: ${loaded.diagnostic.code}.`,
                );
              }
              const loadedMimeType = requireSupportedImageMimeType(
                loaded.mimeType,
                reference.label,
              );
              if (loadedMimeType !== mimeType) {
                throw new Error(
                  `DSH Prompt image '${reference.label}' changed MIME while it was read.`,
                );
              }
              return loaded.bytes;
            },
          });
        }
      }
      for (const [imageIndex, image] of input.images.entries()) {
        const mimeType = requireSupportedImageMimeType(image.mimeType, image.name);
        candidates.push({
          source: { kind: 'inline', imageIndex, name: image.name },
          label: image.name,
          mimeType,
          load: async () => decodeCanonicalBase64Image(image.data, image.name),
        });
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
        const loaded = await candidate.load();
        const normalized = await normalizeImage(loaded, candidate.mimeType);
        const normalizedMimeType = requireSupportedImageMimeType(
          normalized.mimeType,
          candidate.label,
        );
        totalBytes += normalized.bytes.byteLength;
        if (totalBytes > AGENT_IMAGE_TRANSPORT_MAX_TOTAL_BYTES) {
          throw new Error(
            `DSH Prompt images exceed the total payload limit of ${AGENT_IMAGE_TRANSPORT_MAX_TOTAL_BYTES} bytes.`,
          );
        }
        admitted.push({
          source: candidate.source,
          data: Buffer.from(normalized.bytes).toString('base64'),
          mimeType: normalizedMimeType,
        });
      }
      return admitted;
    },
  });
}

function decodeCanonicalBase64Image(data: string, label: string): Uint8Array {
  if (data.length === 0 || data.length % 4 !== 0) {
    throw new Error(`DSH Prompt image '${label}' must use canonical base64.`);
  }
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length === 0 || bytes.toString('base64') !== data) {
    throw new Error(`DSH Prompt image '${label}' must use canonical base64.`);
  }
  if (bytes.byteLength > AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES) {
    throw new Error(
      `DSH Prompt image '${label}' exceeds ${AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES} source bytes.`,
    );
  }
  return bytes;
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
