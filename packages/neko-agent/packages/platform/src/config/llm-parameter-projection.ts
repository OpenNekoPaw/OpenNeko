import type {
  AgentCreativityPreset,
  AgentLlmAdvancedParams,
  AgentLlmConfig,
  AgentReasoningEffort,
  AgentReasoningPreset,
  AgentTextVerbosity,
  AgentVerbosityPreset,
} from '@neko-agent/types';
import type { ChatModelOption } from '@neko/shared';
import type { Model, Provider } from '../types/provider';

interface ProjectedLlmOptions {
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly thinkingBudget?: number;
}

type MutableProjectedLlmOptions = {
  -readonly [Key in keyof ProjectedLlmOptions]: ProjectedLlmOptions[Key];
};

export type LlmProviderFamily = 'openai' | 'anthropic' | 'generic-openai' | 'local-ollama';

export type LlmParameterDiagnosticCode =
  | 'unsupported-reasoning-effort'
  | 'unsupported-thinking-budget'
  | 'unsupported-verbosity'
  | 'unsupported-temperature'
  | 'unsupported-top-p'
  | 'unsupported-fast-tier'
  | 'unsupported-service-tier'
  | 'unsupported-max-output-tokens'
  | 'invalid-anthropic-thinking-sampling-combination';

export interface LlmParameterDiagnostic {
  readonly code: LlmParameterDiagnosticCode;
  readonly message: string;
  readonly field: string;
}

export interface LlmModelCapabilities {
  readonly supportsTools: boolean;
  readonly supportsVision: boolean;
  readonly supportsReasoningEffort: boolean;
  readonly reasoningEffortValues?: readonly AgentReasoningEffort[];
  readonly supportsThinkingBudget: boolean;
  readonly supportsVerbosity: boolean;
  readonly supportsTemperature: boolean;
  readonly supportsTopP: boolean;
  readonly supportsMaxOutputTokens: boolean;
  readonly supportsFastTier: boolean;
}

export interface LlmCapabilityProjectionInput {
  readonly model: Pick<Model, 'capabilities' | 'options' | 'protocolProfile' | 'supportsBeta'>;
  readonly provider?: Pick<
    Provider,
    'type' | 'protocolProfile' | 'connectionKind' | 'supportLevel' | 'options' | 'supportsBeta'
  >;
}

export interface AgentPresetIntent {
  readonly reasoningEffort?: AgentReasoningEffort;
  readonly thinkingBudget?: number;
  readonly verbosity?: AgentTextVerbosity;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  readonly serviceTier?: 'auto' | 'default' | 'fast' | 'flex' | 'priority';
}

export interface LlmParameterProjectionInput {
  readonly model: Pick<
    Model,
    'id' | 'name' | 'capabilities' | 'options' | 'protocolProfile' | 'supportsBeta'
  >;
  readonly provider: Pick<
    Provider,
    | 'id'
    | 'type'
    | 'protocolProfile'
    | 'connectionKind'
    | 'supportLevel'
    | 'options'
    | 'supportsBeta'
  >;
  readonly llmConfig?: AgentLlmConfig;
  readonly runtimeDefaults?: Pick<
    AgentPresetIntent,
    'temperature' | 'topP' | 'maxOutputTokens' | 'thinkingBudget'
  >;
}

export interface LlmParameterProjection {
  readonly providerFamily: LlmProviderFamily;
  readonly capabilities: LlmModelCapabilities;
  readonly presetIntent: AgentPresetIntent;
  readonly chatOptions: ProjectedLlmOptions;
  readonly providerOptions: Record<string, unknown>;
  readonly diagnostics: readonly LlmParameterDiagnostic[];
}

export type LlmParameterControlAvailability = NonNullable<ChatModelOption['llmParameterControls']>;

type LlmProviderProjectionView = Pick<
  Provider,
  'type' | 'protocolProfile' | 'connectionKind' | 'supportLevel' | 'options' | 'supportsBeta'
>;

const ALL_REASONING_EFFORT_VALUES: readonly AgentReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

const DEFAULT_OPENAI_REASONING_EFFORT_VALUES: readonly AgentReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

const DEFAULT_ANTHROPIC_REASONING_EFFORT_VALUES: readonly AgentReasoningEffort[] = [
  'low',
  'medium',
  'high',
];

const CAPABILITY_ALIASES = {
  tools: ['function_calling', 'function_call', 'tools', 'tool_use'],
  vision: ['vision', 'llm.vision'],
  reasoningEffort: ['reasoning', 'reasoning_effort', 'reasoning.effort'],
  thinkingBudget: ['thinking', 'thinking_budget', 'extended_thinking', 'anthropic.thinking'],
  verbosity: ['verbosity', 'text_verbosity', 'text.verbosity'],
  temperature: ['temperature', 'sampling.temperature', 'sampling'],
  topP: ['top_p', 'topP', 'sampling.top_p', 'sampling'],
  maxOutputTokens: ['max_output_tokens', 'max_tokens', 'output_tokens'],
  fastTier: ['fast_tier', 'service_tier.fast', 'priority_service'],
} as const satisfies Record<string, readonly string[]>;

export function projectLlmModelCapabilities(
  input: LlmCapabilityProjectionInput,
): LlmModelCapabilities {
  const capabilitySet = createCapabilitySet(input.model.capabilities);
  const provider = resolveEffectiveLlmProviderView(input.model, input.provider);
  const providerFamily = provider
    ? resolveLlmProviderFamily(provider)
    : resolveProviderFamilyFromCapabilitySet(capabilitySet);
  const optionCapabilities = readOptionCapabilities(input.model.options, provider?.options);
  const supportsBeta = input.model.supportsBeta ?? provider?.supportsBeta ?? true;
  const supportsReasoningEffort =
    shouldSupportProviderParameter({
      capabilitySet,
      optionValue: undefined,
      providerFamily,
      parameterCapabilities: CAPABILITY_ALIASES.reasoningEffort,
      officialOnly: true,
    }) || optionCapabilities.reasoningEffortValues !== undefined;
  const supportsThinkingBudget =
    (providerFamily !== 'anthropic' || supportsBeta) &&
    (shouldSupportProviderParameter({
      capabilitySet,
      optionValue: optionCapabilities.thinkingBudget,
      providerFamily,
      parameterCapabilities: CAPABILITY_ALIASES.thinkingBudget,
      officialOnly: true,
    }) ||
      optionCapabilities.thinkingBudget === true);
  const supportsVerbosity =
    shouldSupportProviderParameter({
      capabilitySet,
      optionValue: optionCapabilities.verbosity,
      providerFamily,
      parameterCapabilities: CAPABILITY_ALIASES.verbosity,
      officialOnly: true,
    }) || optionCapabilities.verbosity === true;
  const supportsFastTier =
    shouldSupportProviderParameter({
      capabilitySet,
      optionValue: optionCapabilities.fastTier,
      providerFamily,
      parameterCapabilities: CAPABILITY_ALIASES.fastTier,
      officialOnly: true,
    }) || optionCapabilities.fastTier === true;
  const supportsTemperature = shouldSupportSamplingParameter({
    capabilitySet,
    optionValue: optionCapabilities.temperature,
    parameterCapabilities: CAPABILITY_ALIASES.temperature,
  });
  const supportsTopP = shouldSupportSamplingParameter({
    capabilitySet,
    optionValue: optionCapabilities.topP,
    parameterCapabilities: CAPABILITY_ALIASES.topP,
  });
  const supportsMaxOutputTokens = optionCapabilities.maxOutputTokens ?? true;

  return {
    supportsTools: hasAnyCapability(capabilitySet, CAPABILITY_ALIASES.tools),
    supportsVision: hasAnyCapability(capabilitySet, CAPABILITY_ALIASES.vision),
    supportsReasoningEffort,
    ...(supportsReasoningEffort
      ? {
          reasoningEffortValues:
            optionCapabilities.reasoningEffortValues ??
            (providerFamily === 'openai'
              ? DEFAULT_OPENAI_REASONING_EFFORT_VALUES
              : providerFamily === 'anthropic'
                ? DEFAULT_ANTHROPIC_REASONING_EFFORT_VALUES
                : ALL_REASONING_EFFORT_VALUES),
        }
      : {}),
    supportsThinkingBudget,
    supportsVerbosity,
    supportsTemperature,
    supportsTopP,
    supportsMaxOutputTokens,
    supportsFastTier,
  };
}

export function projectLlmParameterControls(
  input: LlmCapabilityProjectionInput,
): LlmParameterControlAvailability {
  const capabilities = projectLlmModelCapabilities(input);
  return {
    reasoning: capabilities.supportsReasoningEffort || capabilities.supportsThinkingBudget,
    verbosity: capabilities.supportsVerbosity,
    creativity: capabilities.supportsTemperature || capabilities.supportsTopP,
    maxOutputTokens: capabilities.supportsMaxOutputTokens,
  };
}

export function projectAgentPresetIntent(config: AgentLlmConfig = {}): AgentPresetIntent {
  const intent: AgentPresetIntent = {
    ...projectReasoningPreset(config.reasoningPreset),
    ...projectVerbosityPreset(config.verbosityPreset),
    ...projectCreativityPreset(config.creativityPreset),
  };

  return removeUndefinedValues({
    ...intent,
    ...mapAdvancedParamsToIntent(config.advanced),
  });
}

export function projectLlmParameters(input: LlmParameterProjectionInput): LlmParameterProjection {
  const provider = resolveEffectiveLlmProviderView(input.model, input.provider) ?? input.provider;
  const providerFamily = resolveLlmProviderFamily(provider);
  const capabilities = projectLlmModelCapabilities({
    model: input.model,
    provider,
  });
  const projectedIntent = removeUndefinedValues({
    ...input.runtimeDefaults,
    ...projectAgentPresetIntent(input.llmConfig),
  });
  const presetIntent =
    providerFamily === 'anthropic' &&
    input.runtimeDefaults?.thinkingBudget !== undefined &&
    !hasExplicitSamplingConfig(input.llmConfig)
      ? removeAnthropicSamplingDefaults(projectedIntent)
      : projectedIntent;
  const hasExplicitThinkingBudget =
    input.llmConfig?.advanced?.thinkingBudget !== undefined ||
    input.runtimeDefaults?.thinkingBudget !== undefined;
  const diagnostics: LlmParameterDiagnostic[] = [];
  const chatOptions: MutableProjectedLlmOptions = {};
  const providerOptions: Record<string, unknown> = {};

  applyCommonOptions({
    presetIntent,
    capabilities,
    diagnostics,
    chatOptions,
    diagnoseUnsupported: !hasReasoningLikeParameter(presetIntent),
  });

  switch (providerFamily) {
    case 'openai':
      applyOpenAIOptions({
        presetIntent,
        capabilities,
        diagnostics,
        providerOptions,
        hasExplicitThinkingBudget,
      });
      break;
    case 'anthropic':
      applyAnthropicOptions({
        presetIntent,
        capabilities,
        diagnostics,
        chatOptions,
        providerOptions,
        supportsBeta: input.model.supportsBeta ?? input.provider.supportsBeta ?? true,
        hasExplicitThinkingBudget,
      });
      break;
    case 'generic-openai':
      applyGenericOpenAIOptions({
        presetIntent,
        capabilities,
        diagnostics,
        hasExplicitThinkingBudget,
      });
      break;
    case 'local-ollama':
      applyLocalOllamaOptions({
        presetIntent,
        capabilities,
        diagnostics,
        hasExplicitThinkingBudget,
      });
      break;
  }

  return {
    providerFamily,
    capabilities,
    presetIntent,
    chatOptions,
    providerOptions,
    diagnostics,
  };
}

function hasExplicitSamplingConfig(config: AgentLlmConfig | undefined): boolean {
  return (
    config?.creativityPreset !== undefined ||
    config?.advanced?.temperature !== undefined ||
    config?.advanced?.topP !== undefined
  );
}

function removeAnthropicSamplingDefaults(intent: AgentPresetIntent): AgentPresetIntent {
  const { temperature: _temperature, topP: _topP, ...rest } = intent;
  return rest;
}

export function resolveLlmProviderFamily(
  provider: Pick<Provider, 'type' | 'protocolProfile' | 'connectionKind' | 'supportLevel'>,
): LlmProviderFamily {
  if (provider.type === 'anthropic' || provider.protocolProfile === 'anthropic') {
    return 'anthropic';
  }
  if (
    provider.type === 'ollama' ||
    provider.protocolProfile === 'ollama' ||
    provider.connectionKind === 'local'
  ) {
    return 'local-ollama';
  }
  if (provider.type === 'openai' || provider.protocolProfile === 'openai-responses') {
    return 'openai';
  }
  return 'generic-openai';
}

export function resolveEffectiveLlmProviderView(
  model: Pick<Model, 'protocolProfile'>,
  provider?: LlmProviderProjectionView,
): LlmProviderProjectionView | undefined {
  if (!provider || model.protocolProfile === undefined) {
    return provider;
  }
  return {
    ...provider,
    protocolProfile: model.protocolProfile,
  };
}

function applyCommonOptions(input: {
  readonly presetIntent: AgentPresetIntent;
  readonly capabilities: LlmModelCapabilities;
  readonly diagnostics: LlmParameterDiagnostic[];
  readonly chatOptions: MutableProjectedLlmOptions;
  readonly diagnoseUnsupported?: boolean;
}): void {
  const {
    presetIntent,
    capabilities,
    diagnostics,
    chatOptions,
    diagnoseUnsupported = true,
  } = input;

  if (presetIntent.temperature !== undefined) {
    if (capabilities.supportsTemperature) {
      chatOptions.temperature = presetIntent.temperature;
    } else if (diagnoseUnsupported) {
      diagnostics.push(createDiagnostic('unsupported-temperature', 'temperature'));
    }
  }

  if (presetIntent.topP !== undefined) {
    if (capabilities.supportsTopP) {
      chatOptions.topP = presetIntent.topP;
    } else if (diagnoseUnsupported) {
      diagnostics.push(createDiagnostic('unsupported-top-p', 'topP'));
    }
  }

  if (presetIntent.maxOutputTokens !== undefined) {
    if (capabilities.supportsMaxOutputTokens) {
      chatOptions.maxTokens = presetIntent.maxOutputTokens;
    } else if (diagnoseUnsupported) {
      diagnostics.push(createDiagnostic('unsupported-max-output-tokens', 'maxOutputTokens'));
    }
  }
}

function applyOpenAIOptions(input: {
  readonly presetIntent: AgentPresetIntent;
  readonly capabilities: LlmModelCapabilities;
  readonly diagnostics: LlmParameterDiagnostic[];
  readonly providerOptions: Record<string, unknown>;
  readonly hasExplicitThinkingBudget: boolean;
}): void {
  const { presetIntent, capabilities, diagnostics, providerOptions, hasExplicitThinkingBudget } =
    input;

  if (presetIntent.reasoningEffort !== undefined) {
    if (
      capabilities.supportsReasoningEffort &&
      effortIsSupported(presetIntent.reasoningEffort, capabilities)
    ) {
      providerOptions.openai = {
        ...(isRecord(providerOptions.openai) ? providerOptions.openai : {}),
        reasoningEffort: presetIntent.reasoningEffort,
      };
    } else {
      diagnostics.push(createDiagnostic('unsupported-reasoning-effort', 'reasoningEffort'));
    }
  }

  if (presetIntent.verbosity !== undefined) {
    if (capabilities.supportsVerbosity) {
      providerOptions.openai = {
        ...(isRecord(providerOptions.openai) ? providerOptions.openai : {}),
        textVerbosity: presetIntent.verbosity,
      };
    } else {
      diagnostics.push(createDiagnostic('unsupported-verbosity', 'verbosity'));
    }
  }

  if (presetIntent.serviceTier !== undefined) {
    if (capabilities.supportsFastTier) {
      providerOptions.openai = {
        ...(isRecord(providerOptions.openai) ? providerOptions.openai : {}),
        serviceTier: mapOpenAIServiceTier(presetIntent.serviceTier),
      };
    } else {
      diagnostics.push(createDiagnostic('unsupported-fast-tier', 'serviceTier'));
    }
  }

  if (presetIntent.thinkingBudget !== undefined && hasExplicitThinkingBudget) {
    diagnostics.push(createDiagnostic('unsupported-thinking-budget', 'thinkingBudget'));
  }
}

function applyAnthropicOptions(input: {
  readonly presetIntent: AgentPresetIntent;
  readonly capabilities: LlmModelCapabilities;
  readonly diagnostics: LlmParameterDiagnostic[];
  readonly chatOptions: MutableProjectedLlmOptions;
  readonly providerOptions: Record<string, unknown>;
  readonly supportsBeta: boolean;
  readonly hasExplicitThinkingBudget: boolean;
}): void {
  const {
    presetIntent,
    capabilities,
    diagnostics,
    chatOptions,
    providerOptions,
    supportsBeta,
    hasExplicitThinkingBudget,
  } = input;

  if (presetIntent.reasoningEffort !== undefined) {
    if (capabilities.supportsThinkingBudget && supportsBeta) {
      chatOptions.thinkingBudget =
        presetIntent.thinkingBudget ?? thinkingBudgetForEffort(presetIntent.reasoningEffort);
      providerOptions.anthropic = {
        ...(isRecord(providerOptions.anthropic) ? providerOptions.anthropic : {}),
        thinking: {
          type: 'enabled',
          budgetTokens: chatOptions.thinkingBudget,
        },
      };
    } else if (!supportsBeta && presetIntent.thinkingBudget !== undefined) {
      diagnostics.push(createDiagnostic('unsupported-thinking-budget', 'thinkingBudget'));
    } else if (
      capabilities.supportsReasoningEffort &&
      isAnthropicEffortValue(presetIntent.reasoningEffort) &&
      effortIsSupported(presetIntent.reasoningEffort, capabilities)
    ) {
      providerOptions.anthropic = {
        ...(isRecord(providerOptions.anthropic) ? providerOptions.anthropic : {}),
        effort: mapAnthropicEffort(presetIntent.reasoningEffort),
      };
    } else {
      diagnostics.push(createDiagnostic('unsupported-reasoning-effort', 'reasoningEffort'));
    }
  }

  if (presetIntent.thinkingBudget !== undefined && hasExplicitThinkingBudget) {
    if (capabilities.supportsThinkingBudget && supportsBeta) {
      chatOptions.thinkingBudget = presetIntent.thinkingBudget;
      providerOptions.anthropic = {
        ...(isRecord(providerOptions.anthropic) ? providerOptions.anthropic : {}),
        thinking: {
          type: 'enabled',
          budgetTokens: presetIntent.thinkingBudget,
        },
      };
    } else {
      diagnostics.push(createDiagnostic('unsupported-thinking-budget', 'thinkingBudget'));
    }
  }

  if (chatOptions.thinkingBudget !== undefined && chatOptions.thinkingBudget > 0) {
    if (chatOptions.temperature !== undefined || chatOptions.topP !== undefined) {
      diagnostics.push(
        createDiagnostic(
          'invalid-anthropic-thinking-sampling-combination',
          chatOptions.temperature !== undefined ? 'temperature' : 'topP',
        ),
      );
    }
  }

  if (presetIntent.verbosity !== undefined) {
    diagnostics.push(createDiagnostic('unsupported-verbosity', 'verbosity'));
  }
  if (presetIntent.serviceTier !== undefined) {
    diagnostics.push(createDiagnostic('unsupported-service-tier', 'serviceTier'));
  }
}

function applyGenericOpenAIOptions(input: {
  readonly presetIntent: AgentPresetIntent;
  readonly capabilities: LlmModelCapabilities;
  readonly diagnostics: LlmParameterDiagnostic[];
  readonly hasExplicitThinkingBudget: boolean;
}): void {
  const { presetIntent, capabilities, diagnostics, hasExplicitThinkingBudget } = input;

  if (presetIntent.reasoningEffort !== undefined && !capabilities.supportsReasoningEffort) {
    diagnostics.push(createDiagnostic('unsupported-reasoning-effort', 'reasoningEffort'));
  }
  if (presetIntent.thinkingBudget !== undefined && hasExplicitThinkingBudget) {
    diagnostics.push(createDiagnostic('unsupported-thinking-budget', 'thinkingBudget'));
  }
  if (presetIntent.verbosity !== undefined && !capabilities.supportsVerbosity) {
    diagnostics.push(createDiagnostic('unsupported-verbosity', 'verbosity'));
  }
  if (presetIntent.serviceTier !== undefined) {
    diagnostics.push(createDiagnostic('unsupported-service-tier', 'serviceTier'));
  }
}

function applyLocalOllamaOptions(input: {
  readonly presetIntent: AgentPresetIntent;
  readonly capabilities: LlmModelCapabilities;
  readonly diagnostics: LlmParameterDiagnostic[];
  readonly hasExplicitThinkingBudget: boolean;
}): void {
  const { presetIntent, capabilities, diagnostics, hasExplicitThinkingBudget } = input;

  if (presetIntent.reasoningEffort !== undefined && !capabilities.supportsReasoningEffort) {
    diagnostics.push(createDiagnostic('unsupported-reasoning-effort', 'reasoningEffort'));
  }
  if (
    presetIntent.thinkingBudget !== undefined &&
    hasExplicitThinkingBudget &&
    !capabilities.supportsThinkingBudget
  ) {
    diagnostics.push(createDiagnostic('unsupported-thinking-budget', 'thinkingBudget'));
  }
  if (presetIntent.verbosity !== undefined) {
    diagnostics.push(createDiagnostic('unsupported-verbosity', 'verbosity'));
  }
  if (presetIntent.serviceTier !== undefined) {
    diagnostics.push(createDiagnostic('unsupported-service-tier', 'serviceTier'));
  }
}

function projectReasoningPreset(preset: AgentReasoningPreset | undefined): AgentPresetIntent {
  switch (preset) {
    case 'fast':
      return { reasoningEffort: 'low', thinkingBudget: 1024, serviceTier: 'fast' };
    case 'balanced':
      return { reasoningEffort: 'medium', thinkingBudget: 4096 };
    case 'deep':
      return { reasoningEffort: 'high', thinkingBudget: 12000 };
    case undefined:
      return {};
  }
}

function projectVerbosityPreset(preset: AgentVerbosityPreset | undefined): AgentPresetIntent {
  switch (preset) {
    case 'brief':
      return { verbosity: 'low' };
    case 'standard':
      return { verbosity: 'medium' };
    case 'detailed':
      return { verbosity: 'high' };
    case undefined:
      return {};
  }
}

function projectCreativityPreset(preset: AgentCreativityPreset | undefined): AgentPresetIntent {
  switch (preset) {
    case 'stable':
      return { temperature: 0.2, topP: 0.8 };
    case 'creative':
      return { temperature: 0.7, topP: 0.95 };
    case 'wild':
      return { temperature: 1, topP: 1 };
    case undefined:
      return {};
  }
}

function mapAdvancedParamsToIntent(
  advanced: AgentLlmAdvancedParams | undefined,
): AgentPresetIntent {
  if (!advanced) return {};
  return removeUndefinedValues({
    temperature: advanced.temperature,
    topP: advanced.topP,
    maxOutputTokens: advanced.maxOutputTokens,
    reasoningEffort: advanced.reasoningEffort,
    thinkingBudget: advanced.thinkingBudget,
    verbosity: advanced.verbosity,
    serviceTier: advanced.serviceTier,
  });
}

function mapOpenAIServiceTier(
  serviceTier: NonNullable<AgentPresetIntent['serviceTier']>,
): 'auto' | 'default' | 'flex' | 'priority' {
  return serviceTier === 'fast' ? 'priority' : serviceTier;
}

function mapAnthropicEffort(
  effort: Extract<AgentReasoningEffort, 'low' | 'medium' | 'high' | 'xhigh'>,
): 'low' | 'medium' | 'high' | 'max' {
  return effort === 'xhigh' ? 'max' : effort;
}

function isAnthropicEffortValue(
  effort: AgentReasoningEffort,
): effort is Extract<AgentReasoningEffort, 'low' | 'medium' | 'high' | 'xhigh'> {
  return effort === 'low' || effort === 'medium' || effort === 'high' || effort === 'xhigh';
}

function hasReasoningLikeParameter(intent: AgentPresetIntent): boolean {
  return intent.reasoningEffort !== undefined || intent.thinkingBudget !== undefined;
}

function thinkingBudgetForEffort(effort: AgentReasoningEffort): number {
  switch (effort) {
    case 'none':
    case 'minimal':
      return 1024;
    case 'low':
      return 2048;
    case 'medium':
      return 4096;
    case 'high':
      return 12000;
    case 'xhigh':
      return 20000;
  }
}

function createCapabilitySet(capabilities: readonly string[]): ReadonlySet<string> {
  return new Set(capabilities.map((capability) => capability.trim()).filter(Boolean));
}

function hasAnyCapability(
  capabilitySet: ReadonlySet<string>,
  capabilities: readonly string[],
): boolean {
  return capabilities.some((capability) => capabilitySet.has(capability));
}

function readOptionCapabilities(
  modelOptions: Record<string, unknown> | undefined,
  providerOptions: Record<string, unknown> | undefined,
): {
  readonly reasoningEffortValues?: readonly AgentReasoningEffort[];
  readonly thinkingBudget?: boolean;
  readonly verbosity?: boolean;
  readonly temperature?: boolean;
  readonly topP?: boolean;
  readonly maxOutputTokens?: boolean;
  readonly fastTier?: boolean;
} {
  const merged = {
    ...readSingleOptionCapabilities(providerOptions),
    ...readSingleOptionCapabilities(modelOptions),
  };
  return removeUndefinedValues(merged);
}

function readSingleOptionCapabilities(
  options: Record<string, unknown> | undefined,
): ReturnType<typeof readOptionCapabilities> {
  if (!options) return {};
  const raw = options.llmCapabilities;
  if (!isRecord(raw)) return {};

  return {
    reasoningEffortValues: readReasoningEffortValues(raw.reasoningEffortValues),
    thinkingBudget: readOptionalBoolean(raw.thinkingBudget),
    verbosity: readOptionalBoolean(raw.verbosity),
    temperature: readOptionalBoolean(raw.temperature),
    topP: readOptionalBoolean(raw.topP),
    maxOutputTokens: readOptionalBoolean(raw.maxOutputTokens),
    fastTier: readOptionalBoolean(raw.fastTier),
  };
}

function readReasoningEffortValues(value: unknown): readonly AgentReasoningEffort[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter(isAgentReasoningEffort);
  return values.length > 0 ? values : undefined;
}

function shouldSupportSamplingParameter(input: {
  readonly capabilitySet: ReadonlySet<string>;
  readonly optionValue: boolean | undefined;
  readonly parameterCapabilities: readonly string[];
}): boolean {
  if (input.optionValue !== undefined) return input.optionValue;
  if (hasAnyCapability(input.capabilitySet, input.parameterCapabilities)) return true;
  if (input.capabilitySet.has('reasoning')) return false;
  return true;
}

function shouldSupportProviderParameter(input: {
  readonly capabilitySet: ReadonlySet<string>;
  readonly optionValue: boolean | undefined;
  readonly providerFamily: LlmProviderFamily;
  readonly parameterCapabilities: readonly string[];
  readonly officialOnly: boolean;
}): boolean {
  if (input.optionValue !== undefined) return input.optionValue;
  if (
    input.officialOnly &&
    input.providerFamily !== 'openai' &&
    input.providerFamily !== 'anthropic'
  ) {
    return false;
  }
  return hasAnyCapability(input.capabilitySet, input.parameterCapabilities);
}

function resolveProviderFamilyFromCapabilitySet(
  capabilitySet: ReadonlySet<string>,
): LlmProviderFamily {
  if (capabilitySet.has('anthropic.thinking')) return 'anthropic';
  if (capabilitySet.has('ollama')) return 'local-ollama';
  if (capabilitySet.has('openai.responses')) return 'openai';
  return 'generic-openai';
}

function effortIsSupported(
  effort: AgentReasoningEffort,
  capabilities: LlmModelCapabilities,
): boolean {
  return (
    capabilities.reasoningEffortValues?.includes(effort) ?? capabilities.supportsReasoningEffort
  );
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function isAgentReasoningEffort(value: unknown): value is AgentReasoningEffort {
  return (
    value === 'none' ||
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh'
  );
}

function createDiagnostic(code: LlmParameterDiagnosticCode, field: string): LlmParameterDiagnostic {
  return {
    code,
    field,
    message: buildDiagnosticMessage(code, field),
  };
}

function buildDiagnosticMessage(code: LlmParameterDiagnosticCode, field: string): string {
  switch (code) {
    case 'unsupported-reasoning-effort':
      return `Selected model does not support reasoning effort parameter: ${field}`;
    case 'unsupported-thinking-budget':
      return `Selected model or provider does not support thinking budget parameter: ${field}`;
    case 'unsupported-verbosity':
      return `Selected model does not support output verbosity parameter: ${field}`;
    case 'unsupported-temperature':
      return `Selected model does not support temperature parameter: ${field}`;
    case 'unsupported-top-p':
      return `Selected model does not support topP parameter: ${field}`;
    case 'unsupported-fast-tier':
      return `Selected model or provider does not support fast service tier: ${field}`;
    case 'unsupported-service-tier':
      return `Selected provider does not support requested service tier: ${field}`;
    case 'unsupported-max-output-tokens':
      return `Selected model does not support max output tokens parameter: ${field}`;
    case 'invalid-anthropic-thinking-sampling-combination':
      return `Anthropic thinking requests cannot include sampling parameter: ${field}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function removeUndefinedValues<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, unknown] => entry[1] !== undefined),
  ) as T;
}
