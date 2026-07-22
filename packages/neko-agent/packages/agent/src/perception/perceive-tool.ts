import {
  BuiltinTool,
  isResourceRef,
  parseDocumentArchiveResourceRef,
  TOOL_NAMES_PERCEPTION,
  validateContentLocator,
  type PerceiveToolInput,
  type ToolParameters,
  type ToolExecuteOptions,
  type ToolResult,
} from '@neko/shared';
import type { IPerceptionPipeline } from './contracts';

const PERCEIVE_TOOL_NAME = TOOL_NAMES_PERCEPTION.PERCEIVE;

export interface PerceiveToolConfig {
  readonly pipeline: IPerceptionPipeline;
  readonly now?: () => number;
}

export class PerceiveTool extends BuiltinTool {
  readonly name = PERCEIVE_TOOL_NAME;
  readonly description =
    'Aggregate on-demand perception tool. It analyzes a generated or referenced media asset through the runtime perception pipeline and returns an updated PerceptionCard.';
  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      assetId: {
        type: 'string',
        description: 'Stable asset id to perceive.',
      },
      depth: {
        type: 'integer',
        description: 'Perception depth: 1 for semantic evidence, 2 for derived perceptual refs.',
      },
      focus: {
        type: 'string',
        enum: ['transcript', 'visual', 'audio', 'shots', 'composition'],
        description: 'Optional analysis focus.',
      },
      ref: {
        type: 'object',
        description:
          'Optional provider-loadable media reference. Use this for local or generated assets that are not resolvable by assetId alone.',
        properties: {
          assetId: { type: 'string' },
          uri: { type: 'string' },
          mimeType: { type: 'string' },
          resourceRef: {
            type: 'object',
            description:
              'Optional stable unified ResourceRef copied exactly from the producing tool. Omit it when only a file path or generated asset id is known.',
          },
          documentResourceRef: {
            type: 'object',
            description:
              'Stable document-entry resource ref copied exactly from the producing tool.',
          },
          contentLocator: {
            type: 'object',
            description: 'Stable canonical content locator copied exactly from the producing tool.',
          },
          label: { type: 'string' },
          timestampMs: { type: 'number' },
        },
        required: ['assetId', 'uri', 'mimeType'],
      },
      options: {
        type: 'object',
        description: 'Optional analysis options such as language, time range, or frame density.',
      },
    },
    required: ['assetId', 'depth'],
  };
  readonly category = 'analysis' as const;
  readonly kind = 'perception' as const;
  override readonly isConcurrencySafe = true;
  override readonly isReadOnly = true;

  private readonly pipeline: IPerceptionPipeline;
  private readonly now: () => number;

  constructor(config: PerceiveToolConfig) {
    super();
    this.pipeline = config.pipeline;
    this.now = config.now ?? (() => Date.now());
  }

  async execute(args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(validation.error ?? 'Invalid arguments');
    }

    const input = readPerceiveToolInput(args);
    if (!input) {
      return this.error('`assetId` must be a non-empty string and `depth` must be 1 or 2');
    }

    if (
      containsUnderstandingModelOverride(input.options) ||
      options?.metadata?.understandingModels
    ) {
      throw new Error(
        'legacy-perception-model-override-rejected: Perception model routing is owned by the immutable turn purpose policy.',
      );
    }
    const result = await this.pipeline.perceive({
      asset: { assetId: input.assetId, ...(input.ref ? { ref: input.ref } : {}) },
      focus: input.focus,
      options: input.options,
      policy: {
        timing: 'on-demand',
        layers: input.depth === 2 ? [0, 1, 2] : [0, 1],
        reason: 'aggregate PerceiveTool request',
      },
    });

    return {
      success: true,
      data: {
        perceptionCard: result.card,
        perceivedAt: this.now(),
      },
      perceptionCards: [result.card],
    };
  }
}

function containsUnderstandingModelOverride(
  options: PerceiveToolInput['options'] | undefined,
): boolean {
  return isRecord(options) && options['understandingModels'] !== undefined;
}

function readPerceiveToolInput(args: Record<string, unknown>): PerceiveToolInput | undefined {
  const assetId = readNonEmptyString(args['assetId']);
  const depth = args['depth'];
  if (!assetId || (depth !== 1 && depth !== 2)) {
    return undefined;
  }

  const focus = readFocus(args['focus']);
  const rawRef = args['ref'];
  const ref = readPerceptualAssetRef(rawRef);
  if ((rawRef !== undefined && !ref) || (ref && ref.assetId !== assetId)) {
    return undefined;
  }
  return {
    assetId,
    ...(ref ? { ref } : {}),
    depth,
    ...(focus ? { focus } : {}),
    ...(isRecord(args['options'])
      ? { options: args['options'] as PerceiveToolInput['options'] }
      : {}),
  };
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readPerceptualAssetRef(value: unknown): PerceiveToolInput['ref'] | undefined {
  if (!isRecord(value)) return undefined;
  const assetId = readNonEmptyString(value['assetId']);
  const uri = readNonEmptyString(value['uri']);
  const mimeType = readNonEmptyString(value['mimeType']);
  if (!assetId || !uri || !mimeType) {
    return undefined;
  }
  const resourceRefValue = value['resourceRef'];
  const resourceRef = isResourceRef(resourceRefValue) ? resourceRefValue : undefined;
  const contentLocatorValue = value['contentLocator'];
  const contentLocatorResult = validateContentLocator(contentLocatorValue);
  const contentLocator = contentLocatorResult.ok ? contentLocatorResult.locator : undefined;
  if (contentLocatorValue !== undefined && !contentLocator) {
    return undefined;
  }
  const documentResourceRefValue = value['documentResourceRef'];
  const documentResourceRef = parseDocumentArchiveResourceRef(documentResourceRefValue);
  if (documentResourceRefValue !== undefined && !documentResourceRef) {
    return undefined;
  }
  const label = readNonEmptyString(value['label']);
  const timestampMs = typeof value['timestampMs'] === 'number' ? value['timestampMs'] : undefined;
  return {
    assetId,
    uri,
    mimeType,
    ...(contentLocator ? { contentLocator } : {}),
    ...(resourceRef ? { resourceRef } : {}),
    ...(documentResourceRef ? { documentResourceRef } : {}),
    ...(label ? { label } : {}),
    ...(timestampMs !== undefined ? { timestampMs } : {}),
  };
}

function readFocus(value: unknown): PerceiveToolInput['focus'] | undefined {
  if (
    value === 'transcript' ||
    value === 'visual' ||
    value === 'audio' ||
    value === 'shots' ||
    value === 'composition'
  ) {
    return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
