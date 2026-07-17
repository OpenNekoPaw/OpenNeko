import type { Context, Models, SimpleStreamOptions } from '@earendil-works/pi-ai';

import type { ResolvedPiAgentModelUse } from './model-policy';
import { composeAgentModelPayloadProjector } from './model-payload';

export interface CompletePiPurposeModelInput {
  readonly models: Models;
  readonly modelUse: ResolvedPiAgentModelUse;
  readonly context: Context;
  readonly maxTokens?: number;
  readonly signal?: AbortSignal;
}

export interface PiPurposeModelCompletion {
  readonly purpose: ResolvedPiAgentModelUse['purpose'];
  readonly providerId: string;
  readonly modelId: string;
  readonly text: string;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
}

/**
 * Completes one already-resolved Pi purpose model without selecting or
 * falling back to another model. Product/domain owners remain responsible for
 * building the bounded context and resolving the immutable purpose snapshot.
 */
export async function completePiPurposeModel(
  input: CompletePiPurposeModelInput,
): Promise<PiPurposeModelCompletion> {
  const response = await input.models
    .streamSimple(structuredClone(input.modelUse.model), input.context, buildOptions(input))
    .result();
  if (response.stopReason === 'error' || response.stopReason === 'aborted') {
    throw new Error(
      response.errorMessage ??
        `Purpose model ${input.modelUse.model.provider}/${input.modelUse.model.id} ${response.stopReason}.`,
    );
  }
  const text = response.content
    .map((content) => (content.type === 'text' ? content.text : ''))
    .join('');
  if (text.trim().length === 0) {
    throw new Error(
      `Purpose model ${input.modelUse.model.provider}/${input.modelUse.model.id} returned no text.`,
    );
  }
  return Object.freeze({
    purpose: input.modelUse.purpose,
    providerId: input.modelUse.model.provider,
    modelId: input.modelUse.model.id,
    text,
    usage: Object.freeze({
      inputTokens: response.usage.input,
      outputTokens: response.usage.output,
      totalTokens: response.usage.totalTokens,
    }),
  });
}

function buildOptions(input: CompletePiPurposeModelInput): SimpleStreamOptions {
  const parameters = input.modelUse.parameters;
  const onPayload = composeAgentModelPayloadProjector(parameters);
  return {
    ...(parameters.temperature === undefined ? {} : { temperature: parameters.temperature }),
    ...((input.maxTokens ?? parameters.maxTokens) === undefined
      ? {}
      : { maxTokens: input.maxTokens ?? parameters.maxTokens }),
    ...(parameters.transport === undefined ? {} : { transport: parameters.transport }),
    ...(parameters.cacheRetention === undefined
      ? {}
      : { cacheRetention: parameters.cacheRetention }),
    ...(parameters.timeoutMs === undefined ? {} : { timeoutMs: parameters.timeoutMs }),
    ...(parameters.maxRetries === undefined ? {} : { maxRetries: parameters.maxRetries }),
    ...(parameters.maxRetryDelayMs === undefined
      ? {}
      : { maxRetryDelayMs: parameters.maxRetryDelayMs }),
    ...(parameters.headers === undefined ? {} : { headers: { ...parameters.headers } }),
    ...(parameters.metadata === undefined ? {} : { metadata: { ...parameters.metadata } }),
    ...(parameters.thinkingLevel === undefined || parameters.thinkingLevel === 'off'
      ? {}
      : { reasoning: parameters.thinkingLevel }),
    ...(parameters.thinkingBudgets === undefined
      ? {}
      : { thinkingBudgets: { ...parameters.thinkingBudgets } }),
    ...(onPayload === undefined ? {} : { onPayload }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  };
}
