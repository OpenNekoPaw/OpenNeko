export type AgentTokenBudgetDiagnosticSeverity = 'warning' | 'error';

export type AgentTokenBudgetDiagnosticCode =
  | 'missing-context-window'
  | 'invalid-context-window'
  | 'invalid-model-output-cap'
  | 'invalid-default-output-cap'
  | 'invalid-requested-output-cap'
  | 'requested-output-exceeds-model-cap'
  | 'default-output-exceeds-model-cap'
  | 'impossible-input-budget';

export interface AgentTokenBudgetDiagnostic {
  readonly code: AgentTokenBudgetDiagnosticCode;
  readonly severity: AgentTokenBudgetDiagnosticSeverity;
  readonly modelId: string;
  readonly message: string;
}

export interface AgentTokenBudgetInput {
  readonly modelId: string;
  readonly contextWindow?: number;
  readonly modelMaxOutputTokens?: number;
  readonly defaultMaxOutputTokens: number;
  readonly requestedMaxOutputTokens?: number;
  readonly reasoningReserveTokens?: number;
  readonly safetyMarginTokens?: number;
}

export interface AgentTokenBudget {
  readonly modelId: string;
  readonly contextWindow?: number;
  readonly modelMaxOutputTokens?: number;
  readonly requestedMaxOutputTokens?: number;
  readonly defaultMaxOutputTokens?: number;
  readonly effectiveMaxOutputTokens?: number;
  readonly reasoningReserveTokens: number;
  readonly safetyMarginTokens: number;
  readonly effectiveInputBudget?: number;
  readonly diagnostics: readonly AgentTokenBudgetDiagnostic[];
}

export interface AgentAutoCompactThresholdInput {
  readonly effectiveInputBudget?: number;
  readonly explicitTokenThreshold?: number;
  readonly defaultTokenThreshold: number;
  readonly thresholdRatio?: number;
}

const DEFAULT_AUTO_COMPACT_THRESHOLD_RATIO = 0.85;

function isPositiveInteger(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function createDiagnostic(
  input: AgentTokenBudgetInput,
  code: AgentTokenBudgetDiagnosticCode,
  severity: AgentTokenBudgetDiagnosticSeverity,
  detail: string,
): AgentTokenBudgetDiagnostic {
  return {
    code,
    severity,
    modelId: input.modelId,
    message: `Token budget for model "${input.modelId}" is invalid: ${detail}`,
  };
}

export function resolveAgentTokenBudget(input: AgentTokenBudgetInput): AgentTokenBudget {
  const diagnostics: AgentTokenBudgetDiagnostic[] = [];

  const contextWindow = isPositiveInteger(input.contextWindow) ? input.contextWindow : undefined;
  if (input.contextWindow === undefined) {
    diagnostics.push(
      createDiagnostic(input, 'missing-context-window', 'warning', 'context window is unknown.'),
    );
  } else if (contextWindow === undefined) {
    diagnostics.push(
      createDiagnostic(
        input,
        'invalid-context-window',
        'error',
        `context window must be a positive integer, got ${String(input.contextWindow)}.`,
      ),
    );
  }

  const modelMaxOutputTokens = isPositiveInteger(input.modelMaxOutputTokens)
    ? input.modelMaxOutputTokens
    : undefined;
  if (input.modelMaxOutputTokens !== undefined && modelMaxOutputTokens === undefined) {
    diagnostics.push(
      createDiagnostic(
        input,
        'invalid-model-output-cap',
        'error',
        `model max output tokens must be a positive integer, got ${String(input.modelMaxOutputTokens)}.`,
      ),
    );
  }

  const defaultMaxOutputTokens = isPositiveInteger(input.defaultMaxOutputTokens)
    ? input.defaultMaxOutputTokens
    : undefined;
  if (defaultMaxOutputTokens === undefined) {
    diagnostics.push(
      createDiagnostic(
        input,
        'invalid-default-output-cap',
        'error',
        `default max output tokens must be a positive integer, got ${String(input.defaultMaxOutputTokens)}.`,
      ),
    );
  }

  const requestedMaxOutputTokens = isPositiveInteger(input.requestedMaxOutputTokens)
    ? input.requestedMaxOutputTokens
    : undefined;
  if (input.requestedMaxOutputTokens !== undefined && requestedMaxOutputTokens === undefined) {
    diagnostics.push(
      createDiagnostic(
        input,
        'invalid-requested-output-cap',
        'error',
        `requested max output tokens must be a positive integer, got ${String(input.requestedMaxOutputTokens)}.`,
      ),
    );
  }

  const requestedOrDefault = requestedMaxOutputTokens ?? defaultMaxOutputTokens;
  let effectiveMaxOutputTokens = requestedOrDefault;
  if (requestedOrDefault !== undefined && modelMaxOutputTokens !== undefined) {
    if (requestedOrDefault > modelMaxOutputTokens) {
      effectiveMaxOutputTokens = modelMaxOutputTokens;
      diagnostics.push(
        createDiagnostic(
          input,
          requestedMaxOutputTokens !== undefined
            ? 'requested-output-exceeds-model-cap'
            : 'default-output-exceeds-model-cap',
          'error',
          `output cap ${requestedOrDefault} exceeds model max output tokens ${modelMaxOutputTokens}.`,
        ),
      );
    }
  }

  const reasoningReserveTokens = isPositiveInteger(input.reasoningReserveTokens)
    ? input.reasoningReserveTokens
    : 0;
  const safetyMarginTokens = isPositiveInteger(input.safetyMarginTokens)
    ? input.safetyMarginTokens
    : 0;

  let effectiveInputBudget: number | undefined;
  if (contextWindow !== undefined) {
    effectiveInputBudget = Math.max(0, contextWindow - safetyMarginTokens);
    if (effectiveInputBudget <= 0) {
      diagnostics.push(
        createDiagnostic(
          input,
          'impossible-input-budget',
          'error',
          `input context window ${contextWindow} is consumed by safety margin ${safetyMarginTokens}.`,
        ),
      );
    }
  }

  return {
    modelId: input.modelId,
    ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(modelMaxOutputTokens !== undefined ? { modelMaxOutputTokens } : {}),
    ...(requestedMaxOutputTokens !== undefined ? { requestedMaxOutputTokens } : {}),
    ...(defaultMaxOutputTokens !== undefined ? { defaultMaxOutputTokens } : {}),
    ...(effectiveMaxOutputTokens !== undefined ? { effectiveMaxOutputTokens } : {}),
    reasoningReserveTokens,
    safetyMarginTokens,
    ...(effectiveInputBudget !== undefined ? { effectiveInputBudget } : {}),
    diagnostics,
  };
}

export function resolveAgentAutoCompactTokenThreshold(
  input: AgentAutoCompactThresholdInput,
): number {
  const defaultThreshold = isPositiveInteger(input.defaultTokenThreshold)
    ? input.defaultTokenThreshold
    : 0;
  const thresholdRatio =
    typeof input.thresholdRatio === 'number' &&
    Number.isFinite(input.thresholdRatio) &&
    input.thresholdRatio > 0 &&
    input.thresholdRatio <= 1
      ? input.thresholdRatio
      : DEFAULT_AUTO_COMPACT_THRESHOLD_RATIO;
  const derivedThreshold = isPositiveInteger(input.effectiveInputBudget)
    ? Math.floor(input.effectiveInputBudget * thresholdRatio)
    : undefined;
  const explicitThreshold = isPositiveInteger(input.explicitTokenThreshold)
    ? input.explicitTokenThreshold
    : undefined;

  if (derivedThreshold !== undefined && explicitThreshold !== undefined) {
    return Math.min(derivedThreshold, explicitThreshold);
  }
  return derivedThreshold ?? explicitThreshold ?? defaultThreshold;
}
