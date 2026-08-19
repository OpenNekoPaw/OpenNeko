import type {
  Api,
  CacheRetention,
  Model,
  ProviderHeaders,
  ThinkingBudgets,
  Transport,
} from '@earendil-works/pi-ai';
import type { ThinkingLevel } from '@earendil-works/pi-agent-core';

export const AGENT_MODEL_PURPOSES = [
  'agent.main',
  'canvas.prompt',
  'canvas.judge',
  'character.dialogue',
  'character.profile',
  'text.embed',
  'image.generate',
  'image.edit',
  'image.understand',
  'video.generate',
  'video.understand',
  'video.safety',
  'audio.generate',
  'audio.tts',
  'audio.asr',
  'audio.understand',
  'audio.music.generate',
  'content.safety.moderate',
] as const;

export type AgentModelPurpose = (typeof AGENT_MODEL_PURPOSES)[number];

export interface AgentModelParameters {
  readonly thinkingLevel?: ThinkingLevel;
  readonly thinkingBudgets?: ThinkingBudgets;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly transport?: Transport;
  readonly cacheRetention?: CacheRetention;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly maxRetryDelayMs?: number;
  readonly headers?: ProviderHeaders;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AgentModelBinding {
  readonly providerId: string;
  readonly modelId: string;
  readonly parameters?: AgentModelParameters;
}

export type AgentModelBindingMap = Partial<Record<AgentModelPurpose, AgentModelBinding>>;

export type AgentModelCredentialState = 'configured' | 'ambient' | 'not-required' | 'missing';

/**
 * Bounds one Pi provider request. Long-running media work executes as a domain Task after the
 * model returns a Tool call, so it owns a separate timeout policy.
 */
export const DEFAULT_PI_MODEL_REQUEST_TIMEOUT_MS = 5 * 60 * 1_000;

export interface AgentModelCatalogEntry {
  readonly model: Model<Api> | AgentDomainModelRef;
  readonly execution?: 'pi' | 'domain';
  readonly capabilities: readonly string[];
  readonly credentialState: AgentModelCredentialState;
  readonly defaultParameters?: AgentModelParameters;
}

export interface AgentDomainModelRef {
  readonly provider: string;
  readonly id: string;
  readonly name: string;
}

export interface AgentModelPurposeRequirement {
  readonly capabilities: readonly string[];
}

export interface ResolveAgentModelPolicyInput {
  readonly catalog: readonly AgentModelCatalogEntry[];
  readonly catalogDefaults?: AgentModelBindingMap;
  readonly userBindings?: AgentModelBindingMap;
  readonly conversationOverrides?: AgentModelBindingMap;
  readonly requirements?: Partial<Record<AgentModelPurpose, AgentModelPurposeRequirement>>;
}

export interface ResolveAgentPurposeModelUseInput {
  readonly purpose: AgentModelPurpose;
  readonly catalog: readonly AgentModelCatalogEntry[];
  readonly binding: AgentModelBinding;
  readonly requirement?: AgentModelPurposeRequirement;
}

interface ResolvedAgentModelUseBase {
  readonly purpose: AgentModelPurpose;
  readonly parameters: Readonly<AgentModelParameters>;
}

export interface ResolvedPiAgentModelUse extends ResolvedAgentModelUseBase {
  readonly execution: 'pi';
  readonly model: Readonly<Model<Api>>;
}

export interface ResolvedDomainAgentModelUse extends ResolvedAgentModelUseBase {
  readonly execution: 'domain';
  readonly model: Readonly<AgentDomainModelRef>;
}

export type ResolvedAgentModelUse = ResolvedPiAgentModelUse | ResolvedDomainAgentModelUse;

export type AgentModelPolicy = Readonly<
  Record<'agent.main', ResolvedPiAgentModelUse> &
    Partial<Record<Exclude<AgentModelPurpose, 'agent.main'>, ResolvedAgentModelUse>>
>;

export type AgentModelPolicyErrorCode =
  | 'missing-main'
  | 'unknown-purpose'
  | 'duplicate-model'
  | 'model-not-found'
  | 'provider-mismatch'
  | 'capability-mismatch'
  | 'credential-missing'
  | 'invalid-parameter';

export class AgentModelPolicyError extends Error {
  readonly code: AgentModelPolicyErrorCode;
  readonly purpose?: string;

  constructor(code: AgentModelPolicyErrorCode, message: string, purpose?: string) {
    super(message);
    this.name = 'AgentModelPolicyError';
    this.code = code;
    this.purpose = purpose;
  }
}

const PURPOSE_SET = new Set<string>(AGENT_MODEL_PURPOSES);

export function resolveAgentModelPolicy(input: ResolveAgentModelPolicyInput): AgentModelPolicy {
  const catalog = indexCatalog(input.catalog);
  const bindings = mergeBindingLayers(
    input.catalogDefaults,
    input.userBindings,
    input.conversationOverrides,
  );
  if (bindings['agent.main'] === undefined) {
    throw new AgentModelPolicyError(
      'missing-main',
      'Agent model policy requires an explicit agent.main binding.',
      'agent.main',
    );
  }

  const resolved: Partial<Record<AgentModelPurpose, ResolvedAgentModelUse>> = {};
  for (const purpose of AGENT_MODEL_PURPOSES) {
    const binding = bindings[purpose];
    if (binding === undefined) continue;
    resolved[purpose] = resolveBinding(purpose, binding, catalog, input.requirements?.[purpose]);
  }

  const main = resolved['agent.main'];
  if (main === undefined) {
    throw new AgentModelPolicyError(
      'missing-main',
      'Agent model policy lost its required agent.main binding during resolution.',
      'agent.main',
    );
  }
  if (main.execution !== 'pi') {
    throw new AgentModelPolicyError(
      'capability-mismatch',
      'agent.main must be executable by Pi.',
      'agent.main',
    );
  }
  return Object.freeze({ ...resolved, 'agent.main': main });
}

/** Resolve one exact flat purpose binding without requiring an agent.main policy. */
export function resolveAgentPurposeModelUse(
  input: ResolveAgentPurposeModelUseInput,
): ResolvedAgentModelUse {
  return resolveBinding(
    input.purpose,
    input.binding,
    indexCatalog(input.catalog),
    input.requirement,
  );
}

export function requireAgentModelUse(
  policy: AgentModelPolicy,
  purpose: AgentModelPurpose,
): ResolvedAgentModelUse {
  const use = policy[purpose];
  if (use === undefined) {
    throw new AgentModelPolicyError(
      'model-not-found',
      `No model is bound to required purpose ${purpose}.`,
      purpose,
    );
  }
  return use;
}

function indexCatalog(
  entries: readonly AgentModelCatalogEntry[],
): ReadonlyMap<string, AgentModelCatalogEntry> {
  const indexed = new Map<string, AgentModelCatalogEntry>();
  for (const entry of entries) {
    const key = modelKey(entry.model.provider, entry.model.id);
    if (indexed.has(key)) {
      throw new AgentModelPolicyError(
        'duplicate-model',
        `Duplicate Agent model registration for ${entry.model.provider}/${entry.model.id}.`,
      );
    }
    indexed.set(key, entry);
  }
  return indexed;
}

function mergeBindingLayers(
  ...layers: readonly (AgentModelBindingMap | undefined)[]
): AgentModelBindingMap {
  const merged: Partial<Record<AgentModelPurpose, AgentModelBinding>> = {};
  for (const layer of layers) {
    if (layer === undefined) continue;
    for (const purpose of Object.keys(layer)) {
      if (!PURPOSE_SET.has(purpose)) {
        throw new AgentModelPolicyError(
          'unknown-purpose',
          `Unknown Agent model purpose ${purpose}; model policy is a flat, closed purpose map.`,
          purpose,
        );
      }
    }
    for (const purpose of AGENT_MODEL_PURPOSES) {
      const binding = layer[purpose];
      if (binding !== undefined) {
        merged[purpose] = binding;
      }
    }
  }
  return merged;
}

function resolveBinding(
  purpose: AgentModelPurpose,
  binding: AgentModelBinding,
  catalog: ReadonlyMap<string, AgentModelCatalogEntry>,
  requirement: AgentModelPurposeRequirement | undefined,
): ResolvedAgentModelUse {
  const exact = catalog.get(modelKey(binding.providerId, binding.modelId));
  if (exact === undefined) {
    const sameModelId = [...catalog.values()].find((entry) => entry.model.id === binding.modelId);
    if (sameModelId !== undefined) {
      throw new AgentModelPolicyError(
        'provider-mismatch',
        `Model ${binding.modelId} is registered for provider ${sameModelId.model.provider}, not ${binding.providerId}.`,
        purpose,
      );
    }
    throw new AgentModelPolicyError(
      'model-not-found',
      `Configured model ${binding.providerId}/${binding.modelId} was not registered with Pi.`,
      purpose,
    );
  }
  if (exact.credentialState === 'missing') {
    throw new AgentModelPolicyError(
      'credential-missing',
      `Configured provider ${binding.providerId} has no usable credential for ${purpose}.`,
      purpose,
    );
  }
  if (
    requirement !== undefined &&
    !requirement.capabilities.every((capability) => exact.capabilities.includes(capability))
  ) {
    throw new AgentModelPolicyError(
      'capability-mismatch',
      `Configured model ${binding.providerId}/${binding.modelId} lacks required capabilities for ${purpose}.`,
      purpose,
    );
  }

  const mergedParameters: AgentModelParameters = {
    ...exact.defaultParameters,
    ...binding.parameters,
    headers: mergeOptionalRecords(exact.defaultParameters?.headers, binding.parameters?.headers),
    metadata: mergeOptionalRecords(exact.defaultParameters?.metadata, binding.parameters?.metadata),
  };
  const parameters = normalizeParameters(
    exact.execution === 'domain' || mergedParameters.timeoutMs !== undefined
      ? mergedParameters
      : { ...mergedParameters, timeoutMs: DEFAULT_PI_MODEL_REQUEST_TIMEOUT_MS },
  );
  if (exact.execution === 'domain') {
    return Object.freeze({
      purpose,
      execution: 'domain' as const,
      model: freezeDomainModel(exact.model),
      parameters,
    });
  }
  if (!isPiModel(exact.model)) {
    throw new AgentModelPolicyError(
      'capability-mismatch',
      `Configured model ${binding.providerId}/${binding.modelId} lacks a Pi model contract for ${purpose}.`,
      purpose,
    );
  }
  return Object.freeze({
    purpose,
    execution: 'pi' as const,
    model: freezePiModel(exact.model),
    parameters,
  });
}

function normalizeParameters(parameters: AgentModelParameters): Readonly<AgentModelParameters> {
  assertFiniteRange(parameters.temperature, 'temperature', 0, 2);
  assertFiniteRange(parameters.topP, 'topP', 0, 1);
  assertPositiveInteger(parameters.maxTokens, 'maxTokens');
  for (const [level, budget] of Object.entries(parameters.thinkingBudgets ?? {})) {
    assertPositiveInteger(budget, `thinkingBudgets.${level}`);
  }
  assertPositiveInteger(parameters.timeoutMs, 'timeoutMs');
  assertNonNegativeInteger(parameters.maxRetries, 'maxRetries');
  assertNonNegativeInteger(parameters.maxRetryDelayMs, 'maxRetryDelayMs');
  const normalized = structuredClone(parameters);
  if (normalized.thinkingBudgets !== undefined) Object.freeze(normalized.thinkingBudgets);
  if (normalized.headers !== undefined) Object.freeze(normalized.headers);
  if (normalized.metadata !== undefined) Object.freeze(normalized.metadata);
  return Object.freeze(normalized);
}

function assertFiniteRange(
  value: number | undefined,
  field: string,
  minimum: number,
  maximum: number,
): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new AgentModelPolicyError(
      'invalid-parameter',
      `${field} must be a finite number between ${minimum} and ${maximum}.`,
    );
  }
}

function assertPositiveInteger(value: number | undefined, field: string): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value <= 0) {
    throw new AgentModelPolicyError('invalid-parameter', `${field} must be a positive integer.`);
  }
}

function assertNonNegativeInteger(value: number | undefined, field: string): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new AgentModelPolicyError(
      'invalid-parameter',
      `${field} must be a non-negative integer.`,
    );
  }
}

function freezePiModel(model: Model<Api>): Readonly<Model<Api>> {
  const snapshot = structuredClone(model);
  Object.freeze(snapshot.input);
  Object.freeze(snapshot.cost.tiers);
  Object.freeze(snapshot.cost);
  if (snapshot.headers !== undefined) Object.freeze(snapshot.headers);
  if (snapshot.compat !== undefined) Object.freeze(snapshot.compat);
  if (snapshot.thinkingLevelMap !== undefined) Object.freeze(snapshot.thinkingLevelMap);
  return Object.freeze(snapshot);
}

function freezeDomainModel(model: Model<Api> | AgentDomainModelRef): Readonly<AgentDomainModelRef> {
  return Object.freeze({ provider: model.provider, id: model.id, name: model.name });
}

function isPiModel(model: Model<Api> | AgentDomainModelRef): model is Model<Api> {
  return 'api' in model && 'baseUrl' in model && 'cost' in model;
}

function mergeOptionalRecords<TValue>(
  base: Readonly<Record<string, TValue>> | undefined,
  override: Readonly<Record<string, TValue>> | undefined,
): Record<string, TValue> | undefined {
  if (base === undefined && override === undefined) return undefined;
  return { ...base, ...override };
}

function modelKey(providerId: string, modelId: string): string {
  return `${providerId}\u0000${modelId}`;
}
