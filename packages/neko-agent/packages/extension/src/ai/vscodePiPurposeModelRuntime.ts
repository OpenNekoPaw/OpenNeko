import type { Platform } from '@neko/platform';
import {
  completePiPurposeModel,
  createOpenNekoPiModels,
  type AgentModelParameters,
  type OpenNekoCredentialStore,
  type PiPurposeModelCompletion,
} from '@neko/agent/pi';

import {
  resolveVSCodePiPurposeModelUse,
  type VSCodePiDirectPurpose,
} from './vscodePiRuntimeManager';

export interface VSCodePiPurposeModelRuntimeOptions {
  readonly credentials: OpenNekoCredentialStore;
  readonly config: Platform['config'];
  readonly resolveAccountGatewayCredential?: (providerId: string) => Promise<string>;
}

export interface CompleteVSCodePiPurposeModelInput {
  readonly purpose: VSCodePiDirectPurpose;
  readonly modelRef?: { readonly providerId: string; readonly modelId: string };
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly parameters?: AgentModelParameters;
  readonly signal?: AbortSignal;
}

/** Host bridge for one bounded product-purpose completion through Pi. */
export class VSCodePiPurposeModelRuntime {
  constructor(private readonly options: VSCodePiPurposeModelRuntimeOptions) {}

  async complete(input: CompleteVSCodePiPurposeModelInput): Promise<PiPurposeModelCompletion> {
    const selection = this.resolveSelection(input);
    const models = createOpenNekoPiModels(this.options.credentials);
    const modelUse = await resolveVSCodePiPurposeModelUse(
      models,
      this.options.credentials,
      {
        purpose: input.purpose,
        ...selection,
        providerSource: 'explicit-config',
        ...(input.parameters === undefined ? {} : { parameters: input.parameters }),
      },
      this.options.resolveAccountGatewayCredential,
    );
    return completePiPurposeModel({
      models,
      modelUse,
      context: {
        systemPrompt: requirePromptPart(input.systemPrompt, 'systemPrompt'),
        messages: [
          {
            role: 'user',
            content: requirePromptPart(input.prompt, 'prompt'),
            timestamp: Date.now(),
          },
        ],
      },
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
  }

  private resolveSelection(input: CompleteVSCodePiPurposeModelInput) {
    const ref = input.modelRef ?? this.options.config.resolveModelRefForPurpose(input.purpose);
    if (!ref) throw new Error(`No explicit model binding is configured for ${input.purpose}.`);
    const provider = this.options.config.getProvider(ref.providerId);
    const model = this.options.config.getModel(ref.modelId);
    if (!provider || provider.enabled === false || !model || model.enabled === false) {
      throw new Error(`Configured purpose model ${ref.providerId}/${ref.modelId} is unavailable.`);
    }
    if (model.providerId !== provider.id) {
      throw new Error(
        `Purpose model ${model.id} belongs to provider ${model.providerId}, not ${provider.id}.`,
      );
    }
    return { provider, model };
  }
}

function requirePromptPart(value: string, field: 'systemPrompt' | 'prompt'): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Pi purpose completion requires a non-empty ${field}.`);
  return normalized;
}
