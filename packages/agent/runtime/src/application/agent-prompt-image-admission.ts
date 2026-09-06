import { requireCanonicalBase64, type DshComposerImageInput } from '@neko/agent-contracts';
import type { ContentLocator } from '@neko/content-domain';

import { normalizeProviderImage } from '../provider/image-batch-transport';

const SUPPORTED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

export type AgentPromptImageMimeType = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

export interface AgentPromptReference {
  readonly label: string;
  readonly contentLocator: ContentLocator;
}

export interface AgentPromptReferenceBytePort {
  stat(
    reference: AgentPromptReference,
  ): Promise<{ readonly mimeType?: string; readonly byteLength: number }>;
  read(
    reference: AgentPromptReference,
    options: { readonly maxBytes: number },
  ): Promise<{ readonly bytes: Uint8Array; readonly mimeType?: string }>;
}

export interface AgentPromptImage {
  readonly source:
    | { readonly kind: 'reference'; readonly referenceIndex: number }
    | { readonly kind: 'inline'; readonly imageIndex: number; readonly name: string };
  readonly data: string;
  readonly mimeType: AgentPromptImageMimeType;
}

export interface AgentPromptImageAdmissionInput {
  readonly references: readonly AgentPromptReference[];
  readonly images: readonly DshComposerImageInput[];
  readonly modelSupportsImageInput: boolean;
  readonly referenceBytes: AgentPromptReferenceBytePort;
}

export interface AgentPromptImageAdmissionService {
  admit(input: AgentPromptImageAdmissionInput): Promise<readonly AgentPromptImage[]>;
}

export function createAgentPromptImageAdmissionService(options?: {
  readonly normalizeImage?: typeof normalizeProviderImage;
}): AgentPromptImageAdmissionService {
  const normalizeImage = options?.normalizeImage ?? normalizeProviderImage;
  return Object.freeze({
    async admit(input: AgentPromptImageAdmissionInput): Promise<readonly AgentPromptImage[]> {
      if (input.references.length === 0 && input.images.length === 0) return [];
      const candidates: {
        readonly source: AgentPromptImage['source'];
        readonly label: string;
        readonly mimeType: AgentPromptImageMimeType;
        readonly load: () => Promise<Uint8Array>;
      }[] = [];

      for (const [referenceIndex, reference] of input.references.entries()) {
        const stat = await input.referenceBytes.stat(reference);
        if (stat.mimeType?.startsWith('image/') !== true) continue;
        const mimeType = requireSupportedImageMimeType(stat.mimeType, reference.label);
        candidates.push({
          source: { kind: 'reference', referenceIndex },
          label: reference.label,
          mimeType,
          load: async () => {
            const loaded = await input.referenceBytes.read(reference, {
              maxBytes: stat.byteLength,
            });
            const loadedMimeType = requireSupportedImageMimeType(loaded.mimeType, reference.label);
            if (loadedMimeType !== mimeType) {
              throw new Error(
                `Agent Prompt image '${reference.label}' changed MIME while it was read.`,
              );
            }
            if (loaded.bytes.byteLength !== stat.byteLength) {
              throw new Error(
                `Agent Prompt image '${reference.label}' changed size while it was read.`,
              );
            }
            return loaded.bytes;
          },
        });
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
        throw new Error(
          'The selected Agent model does not support image input. Select an image-capable Agent model and retry.',
        );
      }

      const admitted: AgentPromptImage[] = [];
      for (const candidate of candidates) {
        const loaded = await candidate.load();
        const normalized = await normalizeImage(loaded, candidate.mimeType);
        const normalizedMimeType = requireSupportedImageMimeType(
          normalized.mimeType,
          candidate.label,
        );
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
  const canonical = requireCanonicalBase64(
    data,
    `Agent Prompt image '${label}' must use canonical base64.`,
  );
  const bytes = Buffer.from(canonical, 'base64');
  return bytes;
}

function requireSupportedImageMimeType(
  value: string | undefined,
  label: string,
): AgentPromptImageMimeType {
  if (SUPPORTED_IMAGE_MIME_TYPES.some((candidate) => candidate === value)) {
    return value as AgentPromptImageMimeType;
  }
  throw new Error(`Agent Prompt image '${label}' has unsupported MIME '${value ?? 'unknown'}'.`);
}
