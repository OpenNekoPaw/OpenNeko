export type EffectiveAgentConfigValueSource = 'user' | 'runtime' | 'default';
export type EffectiveAgentOutputFormat = 'text' | 'json' | 'markdown';
export type EffectiveAgentConfigDimensionKey =
  | 'modelBinding'
  | 'temperature'
  | 'maxTokens'
  | 'thinkingBudget'
  | 'executionMode'
  | 'outputFormat';

export interface EffectiveAgentConfigDimensionDescriptor {
  readonly key: EffectiveAgentConfigDimensionKey;
  readonly owner: 'agent-config';
  readonly scope: 'turn';
  readonly restart: 'not-required';
  readonly valueType: 'model-binding' | 'number' | 'integer' | 'enum';
}

export type AgentExecutionMode = 'plan' | 'ask' | 'auto';

export const EFFECTIVE_AGENT_CONFIG_DIMENSIONS: readonly EffectiveAgentConfigDimensionDescriptor[] =
  Object.freeze([
    dimension('modelBinding', 'model-binding'),
    dimension('temperature', 'number'),
    dimension('maxTokens', 'integer'),
    dimension('thinkingBudget', 'integer'),
    dimension('executionMode', 'enum'),
    dimension('outputFormat', 'enum'),
  ]);

export interface EffectiveAgentConfigurationValues {
  readonly modelBinding: {
    readonly purpose: 'agent.main';
    readonly providerId: string;
    readonly modelId: string;
  };
  readonly temperature: number;
  readonly maxTokens: number;
  readonly thinkingBudget: number;
  readonly executionMode: AgentExecutionMode;
  readonly outputFormat: EffectiveAgentOutputFormat;
}

export interface EffectiveAgentConfigurationProjection {
  readonly profileId: string;
  readonly digest: `sha256:${string}`;
  readonly values: EffectiveAgentConfigurationValues;
  readonly sources: Readonly<
    Record<EffectiveAgentConfigDimensionKey, EffectiveAgentConfigValueSource>
  >;
  readonly dimensions: typeof EFFECTIVE_AGENT_CONFIG_DIMENSIONS;
}

function dimension(
  key: EffectiveAgentConfigDimensionKey,
  valueType: EffectiveAgentConfigDimensionDescriptor['valueType'],
): EffectiveAgentConfigDimensionDescriptor {
  return Object.freeze({
    key,
    owner: 'agent-config',
    scope: 'turn',
    restart: 'not-required',
    valueType,
  });
}
