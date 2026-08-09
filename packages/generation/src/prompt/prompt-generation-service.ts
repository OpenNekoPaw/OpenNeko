import type { ModelConfig, ProviderConfig } from '@neko/ai-contracts';
import type {
  PromptGenerationExecutionPort,
  PromptGenerationRequest,
  PromptGenerationResult,
} from '../execution';

export interface PromptGenerationConfigPort {
  getProvider(id: string): ProviderConfig | undefined;
  getModel(id: string): ModelConfig | undefined;
}

export interface PromptCompletionPort {
  complete(input: {
    readonly provider: ProviderConfig;
    readonly model: ModelConfig;
    readonly prompt: string;
    readonly temperature?: number;
    readonly maxOutputTokens?: number;
    readonly signal?: AbortSignal;
  }): Promise<{ readonly text: string }>;
}

export class PromptGenerationService implements PromptGenerationExecutionPort {
  constructor(
    private readonly config: PromptGenerationConfigPort,
    private readonly completion: PromptCompletionPort,
  ) {}

  async generatePrompt(
    request: PromptGenerationRequest & {
      readonly providerId: string;
      readonly modelId: string;
    },
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<PromptGenerationResult> {
    const provider = this.config.getProvider(request.providerId);
    if (!provider || provider.enabled === false) {
      throw new Error(`Prompt Generation provider '${request.providerId}' is unavailable.`);
    }
    const model = this.config.getModel(request.modelId);
    if (!model || model.enabled === false || model.providerId !== provider.id) {
      throw new Error(
        `Prompt Generation model '${request.modelId}' is unavailable from provider '${provider.id}'.`,
      );
    }
    if (
      model.type !== 'llm' ||
      !model.capabilities.some((capability) => capability === 'llm.chat' || capability === 'chat')
    ) {
      throw new Error(`Prompt Generation model '${model.id}' does not support canvas.prompt.`);
    }
    const context = request.context?.map((item) => item.text.trim()).filter(Boolean) ?? [];
    const prompt =
      context.length > 0
        ? `${request.prompt}\n\nReference context:\n${context.join('\n\n')}`
        : request.prompt;
    const completed = await this.completion.complete({
      provider,
      model,
      prompt,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(request.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: request.maxOutputTokens }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (!completed.text.trim()) {
      throw new Error('Prompt Generation completed without text output.');
    }
    return Object.freeze({
      type: 'prompt',
      providerId: provider.id,
      modelId: model.id,
      text: completed.text,
      request: Object.freeze({
        prompt: request.prompt,
        ...(request.context === undefined ? {} : { context: Object.freeze([...request.context]) }),
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        ...(request.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: request.maxOutputTokens }),
      }),
    });
  }
}
