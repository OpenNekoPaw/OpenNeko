import {
  AGENT_IMAGE_TRANSPORT_MAX_SOURCE_IMAGES,
  AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES,
  TOOL_NAMES_PERCEPTION,
  createPerceptionEvidenceToolResult,
  type AgentCapabilityContext,
  type AgentCapabilityProvider,
  type PerceptionToolMetadata,
  type ToolCategory,
  type ToolExecuteOptions,
  type ToolParameters,
  type ToolResult,
} from '@neko/agent-contracts';
import {
  isContentRepresentationHandle,
  validateContentLocator,
  type ContentLocator,
  type ContentRepresentationHandle,
} from '@neko/content';

import { normalizeProviderImage } from '../../provider/image-batch-transport';
import { BuiltinTool } from '../base';
import {
  loadAgentImageAsset,
  type AgentImageAssetAccessRuntime,
} from '../content/image-asset-source';

const DEFAULT_FOCUS =
  'Describe the visible content accurately and include any text, layout, objects, and details relevant to the user request.';
const MAX_FOCUS_CHARS = 4_000;
const MAX_OUTPUT_TOKENS = 2_048;

export const PERCEPTION_IMAGE_UNDERSTAND_METADATA: PerceptionToolMetadata = {
  kind: 'perception',
  modality: 'image',
  outputSchema: 'perception-evidence',
  cost: 'moderate',
  requiresGpu: false,
  cacheable: false,
  idempotent: true,
};

export interface ImageUnderstandingToolDeps {
  readonly contentAccessRuntime?: AgentImageAssetAccessRuntime;
  readonly now?: () => number;
}

export class PerceptionImageUnderstandTool extends BuiltinTool {
  readonly name = TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND;
  readonly description =
    'Analyze authorized images with the Turn-bound external image understanding model and return structured perception evidence.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      images: {
        type: 'array',
        items: { type: 'object' },
        minItems: 1,
        maxItems: AGENT_IMAGE_TRANSPORT_MAX_SOURCE_IMAGES,
      },
      focus: { type: 'string', maxLength: MAX_FOCUS_CHARS },
    },
    required: ['images'],
    additionalProperties: false,
  };
  readonly category: ToolCategory = 'analysis';
  readonly kind = 'perception' as const;
  readonly perception = PERCEPTION_IMAGE_UNDERSTAND_METADATA;
  override readonly isConcurrencySafe = true;
  override readonly isReadOnly = true;
  override readonly requiresConfirmation = true;

  constructor(private readonly deps: ImageUnderstandingToolDeps) {
    super();
  }

  async execute(args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult> {
    const images = readImages(args['images']);
    if (images.length === 0) return this.error('Image understanding requires at least one image.');
    if (images.length > AGENT_IMAGE_TRANSPORT_MAX_SOURCE_IMAGES) {
      return this.error(
        `Image understanding accepts at most ${AGENT_IMAGE_TRANSPORT_MAX_SOURCE_IMAGES} images.`,
      );
    }
    const focus = readFocus(args['focus']);
    if (focus === null) {
      return this.error(`Image understanding focus must not exceed ${MAX_FOCUS_CHARS} characters.`);
    }
    const purposeModel = options?.purposeModel;
    if (!purposeModel || purposeModel.purpose !== 'image.understand') {
      return this.error('Image understanding requires the Turn-bound image.understand model.');
    }

    try {
      const loaded = await Promise.all(
        images.map(async (image) => {
          const asset = await loadAgentImageAsset({
            binding: image,
            contentAccessRuntime: this.deps.contentAccessRuntime,
            maxBytes: AGENT_IMAGE_TRANSPORT_MAX_SOURCE_BYTES,
            ...(options?.signal ? { signal: options.signal } : {}),
            operationName: 'Image understanding',
          });
          const normalized = await normalizeProviderImage(asset.bytes, asset.mimeType);
          return {
            data: Buffer.from(normalized.bytes).toString('base64'),
            mimeType: normalized.mimeType,
          };
        }),
      );
      const completion = await purposeModel.complete({
        systemPrompt:
          'You are the image perception stage for another Agent. Report only evidence grounded in the supplied images. State uncertainty explicitly and do not infer hidden context.',
        prompt: focus ?? DEFAULT_FOCUS,
        images: loaded,
        maxTokens: MAX_OUTPUT_TOKENS,
        ...(options?.signal ? { signal: options.signal } : {}),
      });
      const summary = completion.text.trim();
      if (summary.length === 0) {
        return this.error('The image.understand model returned empty perception evidence.');
      }
      const createdAt = this.deps.now?.() ?? Date.now();
      return createPerceptionEvidenceToolResult({
        id: createEvidenceId(purposeModel.providerId, purposeModel.modelId, summary, createdAt),
        source: 'tool',
        summary,
        toolName: this.name,
        modelContext: {
          providerId: purposeModel.providerId,
          modelId: purposeModel.modelId,
        },
        data: {
          kind: 'perception.image.understand',
          imageCount: images.length,
          focus: focus ?? DEFAULT_FOCUS,
          sources: images.map((image, index) => ({
            index,
            label: image.label ?? `image-${index + 1}`,
          })),
          usage: completion.usage,
        },
        createdAt,
        status: 'active',
      });
    } catch (error) {
      return this.error(
        `Image understanding failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export function createImageUnderstandingCapabilityProvider(
  deps: ImageUnderstandingToolDeps,
): AgentCapabilityProvider {
  return {
    id: 'neko-image-understanding',
    hostRequirements: [{ host: 'desktop' }],
    requirements: { contentAccess: true },
    getTools(_context: AgentCapabilityContext) {
      return [new PerceptionImageUnderstandTool(deps)];
    },
  };
}

interface ImageUnderstandingInputImage {
  readonly contentLocator?: ContentLocator;
  readonly representationHandle?: ContentRepresentationHandle;
  readonly label?: string;
}

function readImages(value: unknown): ImageUnderstandingInputImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const contentLocatorResult = validateContentLocator(entry['contentLocator']);
    const contentLocator = contentLocatorResult.ok ? contentLocatorResult.locator : undefined;
    const representationHandle = isContentRepresentationHandle(entry['representationHandle'])
      ? entry['representationHandle']
      : undefined;
    if (!contentLocator && !representationHandle) return [];
    return [
      {
        ...(contentLocator ? { contentLocator } : {}),
        ...(representationHandle ? { representationHandle } : {}),
        ...(typeof entry['label'] === 'string' && entry['label'].trim().length > 0
          ? { label: entry['label'].trim() }
          : {}),
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFocus(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;
  const focus = value.trim();
  return focus.length > 0 && focus.length <= MAX_FOCUS_CHARS ? focus : null;
}

function createEvidenceId(
  providerId: string,
  modelId: string,
  summary: string,
  createdAt: number,
): string {
  let hash = 0x811c9dc5;
  for (const character of `${providerId}\u0000${modelId}\u0000${summary}\u0000${createdAt}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `perception:evidence:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
