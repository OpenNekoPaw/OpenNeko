import {
  createCanonicalQualityCheckTools,
  createMultimodalPerceptionEvaluator,
  createQualityGateRuntime,
  type MaterializedQualityResource,
  type MediaQualityLLMService,
  type QualityEvaluator,
  type QualityReviewRequest,
  type QualityTargetMaterializer,
} from '../capabilities/quality';
import type {
  AgentCapabilityContext,
  AgentCapabilityProvider,
  QualityTarget,
  Tool,
  ToolExecuteOptions,
  ToolPurposeModelRuntime,
} from '@neko/shared';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import {
  collectProjectQualityEvidence,
  type ProjectQualityFacadeResolver,
} from './projectQualityOrchestration';

export interface QualityCapabilityProviderDeps {
  readonly getContentAccessRuntime: () => AgentContentAccessRuntime | undefined;
  readonly projectQualityFacadeResolver: ProjectQualityFacadeResolver;
}

export function createQualityCapabilityProvider(
  deps: QualityCapabilityProviderDeps,
): AgentCapabilityProvider {
  return new QualityCapabilityProvider(deps);
}

class QualityCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-agent-media-quality';
  readonly version = '1.0.0';

  constructor(private readonly deps: QualityCapabilityProviderDeps) {}

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [
      ...createCanonicalQualityCheckTools({
        review: (request, options) => this.review(request, options),
      }),
    ];
  }

  private async review(request: QualityReviewRequest, options?: ToolExecuteOptions) {
    const existingEvidence =
      request.target.kind === 'project-artifact'
        ? await collectProjectQualityEvidence(
            request.target,
            this.deps.projectQualityFacadeResolver,
          )
        : request.existingEvidence;
    const runtime = createQualityGateRuntime({
      materializer: createExtensionQualityMaterializer(this.deps.getContentAccessRuntime),
      evaluators: this.createEvaluators(request.target, options?.purposeModel, options?.signal),
    });
    return runtime.review({ ...request, ...(existingEvidence ? { existingEvidence } : {}) });
  }

  private createEvaluators(
    target: QualityTarget,
    purposeModel: ToolPurposeModelRuntime | undefined,
    signal: AbortSignal | undefined,
  ): readonly QualityEvaluator[] {
    if (target.kind !== 'image') return [];
    if (purposeModel !== undefined && purposeModel.purpose !== 'image.understand') {
      throw new Error(
        `quality-purpose-mismatch: Expected image.understand, received ${purposeModel.purpose}.`,
      );
    }
    return purposeModel
      ? [
          createMultimodalPerceptionEvaluator({
            createService: () => createPurposeModelQualityService(purposeModel, signal),
            chatModel: {
              providerId: purposeModel.providerId,
              modelId: purposeModel.modelId,
            },
          }),
        ]
      : [];
  }
}

function createPurposeModelQualityService(
  purposeModel: ToolPurposeModelRuntime,
  signal: AbortSignal | undefined,
): MediaQualityLLMService {
  return {
    chat: async (messages, options) => {
      const request = parseQualityModelMessages(messages);
      const completion = await purposeModel.complete({
        systemPrompt: request.systemPrompt,
        prompt: request.prompt,
        images: [request.image],
        ...(options?.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
        ...(signal === undefined ? {} : { signal }),
      });
      return { message: { content: completion.text } };
    },
  };
}

function parseQualityModelMessages(messages: unknown[]): {
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly image: { readonly data: string; readonly mimeType: string };
} {
  const system = messages.find(
    (message): message is { role: 'system'; content: string } =>
      isRecord(message) && message['role'] === 'system' && typeof message['content'] === 'string',
  );
  const user = messages.find(
    (message): message is { role: 'user'; content: unknown[] } =>
      isRecord(message) && message['role'] === 'user' && Array.isArray(message['content']),
  );
  if (!system || !user) {
    throw new Error('quality-purpose-input-invalid: Expected system and multimodal user messages.');
  }
  const textPart = user.content.find(
    (part): part is { type: 'text'; text: string } =>
      isRecord(part) && part['type'] === 'text' && typeof part['text'] === 'string',
  );
  const imagePart = user.content.find(
    (part): part is { type: 'image'; imageUrl: string } =>
      isRecord(part) && part['type'] === 'image' && typeof part['imageUrl'] === 'string',
  );
  if (!textPart || !imagePart) {
    throw new Error('quality-purpose-input-invalid: Expected text and image content.');
  }
  const image = parseDataImage(imagePart.imageUrl);
  return {
    systemPrompt: system.content,
    prompt: textPart.text,
    image,
  };
}

function parseDataImage(value: string): { readonly data: string; readonly mimeType: string } {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match?.[1] || !match[2]) {
    throw new Error('quality-purpose-input-invalid: Expected a base64 data image.');
  }
  return { mimeType: match[1], data: match[2] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createExtensionQualityMaterializer(
  getContentAccessRuntime: () => AgentContentAccessRuntime | undefined,
): QualityTargetMaterializer {
  return {
    materialize: async (input): Promise<MaterializedQualityResource> => {
      if (!input.target.resourceRef) {
        throw new Error(
          'quality-materialization-unavailable: Project targets require an owning ProjectQuality facade.',
        );
      }
      const runtime = getContentAccessRuntime();
      if (!runtime) {
        throw new Error(
          'quality-materialization-unavailable: Agent content access runtime is unavailable.',
        );
      }
      if (input.representation !== 'base64') {
        throw new Error(
          'quality-materialization-unavailable: Source projection requires a capability-scoped processor port.',
        );
      }
      const loaded = await runtime.loadProviderAsset({
        source: input.target.resourceRef,
        metadata: {
          qualityTargetId: input.target.targetId,
          qualityConsumer: input.consumer,
        },
      });
      if (loaded.status !== 'ready') {
        throw new Error(
          loaded.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
            `quality-materialization-failed: ${loaded.status}`,
        );
      }
      if (!loaded.bytes || !loaded.mimeType) {
        throw new Error(
          'quality-materialization-failed: Provider materialization requires bytes and mimeType.',
        );
      }
      return {
        resourceRef: input.target.resourceRef,
        base64: Buffer.from(loaded.bytes).toString('base64'),
        mimeType: loaded.mimeType,
      };
    },
  };
}
