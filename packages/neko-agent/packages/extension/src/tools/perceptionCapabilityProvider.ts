import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import {
  TOOL_NAMES_PERCEPTION,
  createTool,
  isResourceRef,
  type AgentCapabilityContext,
  type AgentCapabilityProvider,
  type PerceptionCard,
  type ResourceRef,
  type Tool,
  type ToolExecuteOptions,
  type ToolResult,
} from '@neko/shared';

export interface PerceptionCapabilityProviderDeps {
  readonly getContentAccessRuntime: () => AgentContentAccessRuntime | undefined;
  readonly now?: () => number;
}

interface ImageUnderstandingEvidence {
  readonly summary: string;
  readonly notes: readonly string[];
  readonly confidence: number;
  readonly tags: readonly string[];
}

export function createPerceptionCapabilityProvider(
  deps: PerceptionCapabilityProviderDeps,
): AgentCapabilityProvider {
  return new PerceptionCapabilityProvider(deps);
}

class PerceptionCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-agent-bounded-perception';
  readonly version = '1.0.0';

  constructor(private readonly deps: PerceptionCapabilityProviderDeps) {}

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [createImageUnderstandingTool(this.deps)];
  }
}

function createImageUnderstandingTool(deps: PerceptionCapabilityProviderDeps): Tool {
  return createTool({
    name: TOOL_NAMES_PERCEPTION.IMAGE_UNDERSTAND,
    description:
      'Inspect an image through the configured image-understanding purpose model. The input must be a stable ResourceRef; provider ids, model ids, absolute paths, and cache paths are not accepted.',
    parameters: {
      type: 'object',
      properties: {
        resourceRef: {
          type: 'object',
          description: 'Stable ResourceRef copied exactly from the producing or attachment Tool.',
        },
        focus: {
          type: 'string',
          description:
            'Optional bounded question about visible content, composition, style, or quality.',
        },
      },
      required: ['resourceRef'],
      additionalProperties: false,
    },
    category: 'analysis',
    safetyKind: 'read-only-query',
    isReadOnly: true,
    isConcurrencySafe: true,
    traits: {
      cost: 'moderate',
      reversible: true,
      locality: 'hybrid',
      impactLevel: 'none',
    },
    execute: async (args, options): Promise<ToolResult> =>
      executeImageUnderstanding(args, options, deps),
  });
}

async function executeImageUnderstanding(
  args: Record<string, unknown>,
  options: ToolExecuteOptions | undefined,
  deps: PerceptionCapabilityProviderDeps,
): Promise<ToolResult> {
  const resourceRef = requireResourceRef(args['resourceRef']);
  const focus = readOptionalString(args['focus']);
  if (args['focus'] !== undefined && focus === undefined) {
    throw new Error('image-understanding-invalid-focus: focus must be a non-empty string.');
  }
  const purposeModel = options?.purposeModel;
  if (!purposeModel || purposeModel.purpose !== 'image.understand') {
    throw new Error(
      'image-understanding-purpose-unavailable: The turn has no image.understand model runtime.',
    );
  }
  const contentAccess = deps.getContentAccessRuntime();
  if (!contentAccess) {
    throw new Error(
      'image-understanding-content-unavailable: Agent content access runtime is unavailable.',
    );
  }
  const loaded = await contentAccess.loadProviderAsset({
    source: resourceRef,
    metadata: {
      conversationId: options?.trace?.conversationId,
      runId: options?.trace?.runId,
      toolCallId: options?.trace?.toolRequestId,
    },
  });
  if (loaded.status !== 'ready' || !loaded.bytes || !loaded.mimeType) {
    throw new Error(
      loaded.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
        `image-understanding-materialization-failed: ${loaded.status}`,
    );
  }
  if (!loaded.mimeType.startsWith('image/')) {
    throw new Error(
      `image-understanding-modality-mismatch: Expected image media, received ${loaded.mimeType}.`,
    );
  }
  const startedAt = deps.now?.() ?? Date.now();
  const completion = await purposeModel.complete({
    systemPrompt: IMAGE_UNDERSTANDING_SYSTEM_PROMPT,
    prompt:
      focus ??
      'Describe the visible content and composition. Report only evidence grounded in the image.',
    images: [
      {
        data: Buffer.from(loaded.bytes).toString('base64'),
        mimeType: loaded.mimeType,
      },
    ],
    maxTokens: 1_200,
    ...(options?.signal === undefined ? {} : { signal: options.signal }),
  });
  const evidence = parseImageUnderstandingEvidence(completion.text);
  const completedAt = deps.now?.() ?? Date.now();
  const card: PerceptionCard = {
    version: 1,
    assetId: resourceRef.id,
    modality: 'image',
    ...(options?.trace?.toolRequestId ? { sourceToolCallId: options.trace.toolRequestId } : {}),
    createdAt: completedAt,
    layerStatus: { layer0: 'complete', layer1: 'complete', layer2: 'skipped' },
    structural: {
      format: formatFromMimeType(loaded.mimeType),
      mimeType: loaded.mimeType,
      byteSize: loaded.bytes.byteLength,
    },
    semantic: {
      evidences: [
        {
          kind: 'description',
          confidence: evidence.confidence,
          value: {
            schema: 'neko.image-understanding.v1',
            resourceRef,
            summary: evidence.summary,
            notes: evidence.notes,
            tags: evidence.tags,
          },
        },
      ],
    },
    cost: {
      totalMs: Math.max(0, completedAt - startedAt),
      tokenEstimate: completion.usage.totalTokens,
      gpuUsed: false,
    },
  };
  return {
    success: true,
    data: {
      schema: 'neko.image-understanding.v1',
      resourceRef,
      evidence,
      model: {
        purpose: purposeModel.purpose,
        providerId: purposeModel.providerId,
        modelId: purposeModel.modelId,
      },
      usage: completion.usage,
    },
    perceptionCards: [card],
  };
}

const IMAGE_UNDERSTANDING_SYSTEM_PROMPT = `Return only JSON with this schema:
{"summary":"grounded description","notes":["specific observation"],"confidence":0.0,"tags":["visible tag"]}
Do not infer facts that are not visible. confidence must be between 0 and 1.`;

function requireResourceRef(value: unknown): ResourceRef {
  if (!isResourceRef(value)) {
    throw new Error(
      'image-understanding-resource-required: resourceRef must be a valid stable ResourceRef.',
    );
  }
  return value;
}

function parseImageUnderstandingEvidence(text: string): ImageUnderstandingEvidence {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(text));
  } catch (error) {
    throw new Error(
      `image-understanding-invalid-response: Expected JSON evidence: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRecord(parsed)) {
    throw new Error('image-understanding-invalid-response: Evidence must be an object.');
  }
  const summary = readOptionalString(parsed['summary']);
  const notes = readStringArray(parsed['notes']);
  const tags = readStringArray(parsed['tags']);
  const confidence = parsed['confidence'];
  if (
    !summary ||
    notes.length === 0 ||
    typeof confidence !== 'number' ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new Error(
      'image-understanding-invalid-response: summary, non-empty notes, and confidence 0..1 are required.',
    );
  }
  return Object.freeze({
    summary,
    notes: Object.freeze(notes),
    confidence,
    tags: Object.freeze(tags),
  });
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match?.[1]?.trim() ?? trimmed;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const text = readOptionalString(entry);
    return text === undefined ? [] : [text];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatFromMimeType(mimeType: string): string {
  return mimeType.slice('image/'.length).split(';', 1)[0] ?? 'unknown';
}
