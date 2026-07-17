import type { Api, Model, SimpleStreamOptions } from '@earendil-works/pi-ai';

import type { AgentModelParameters } from './model-policy';

type PayloadProjector = NonNullable<SimpleStreamOptions['onPayload']>;

/**
 * Pi intentionally exposes provider payload mutation instead of a cross-provider
 * topP stream option. Keep the normalized product parameter exact at this one
 * protocol boundary.
 */
export function composeAgentModelPayloadProjector(
  parameters: Readonly<AgentModelParameters>,
  next?: PayloadProjector,
): PayloadProjector | undefined {
  const topP = parameters.topP;
  if (topP === undefined) return next;
  return async (payload, model) => {
    const nextPayload = (await next?.(payload, model)) ?? payload;
    return projectTopP(nextPayload, model, topP);
  };
}

function projectTopP(payload: unknown, model: Model<Api>, topP: number): unknown {
  const record = requirePayloadRecord(payload, model);
  switch (model.api) {
    case 'openai-completions':
    case 'openai-responses':
    case 'anthropic-messages':
      return { ...record, top_p: topP };
    case 'google-generative-ai':
      return {
        ...record,
        config: { ...requireNestedRecord(record.config, model, 'config'), topP },
      };
    default:
      throw new Error(`topP has no exact Pi payload projection for API ${model.api}.`);
  }
}

function requirePayloadRecord(payload: unknown, model: Model<Api>): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new Error(`Pi API ${model.api} produced a non-object payload before topP projection.`);
  }
  return payload;
}

function requireNestedRecord(
  value: unknown,
  model: Model<Api>,
  field: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Pi API ${model.api} payload requires object field ${field} for topP projection.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
