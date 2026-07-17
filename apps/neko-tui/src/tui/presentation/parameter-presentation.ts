import type { AgentLlmAdvancedParams, AgentLlmConfig } from '@neko-agent/types';
import type { LlmParameterDiagnosticCode } from '@neko/platform';
import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalCommandProjection } from './model-family-presentation';
import type { AgentTerminalMessageKey } from './terminal-messages';

export const TERMINAL_ADVANCED_PARAMETER_KEYS = [
  'temperature',
  'topP',
  'maxOutputTokens',
  'reasoningEffort',
  'thinkingBudget',
  'verbosity',
  'serviceTier',
] as const satisfies readonly (keyof AgentLlmAdvancedParams)[];

export type ParameterDiagnosticCode =
  | 'unavailable'
  | 'usage'
  | 'set-usage'
  | 'unsupported'
  | 'invalid-reasoning'
  | 'invalid-verbosity-preset'
  | 'invalid-creativity'
  | 'number-range'
  | 'positive-integer'
  | 'invalid-reasoning-effort'
  | 'invalid-text-verbosity'
  | 'invalid-service-tier'
  | 'validation-failed';

export type ParameterValidationDiagnostic =
  | Readonly<{ readonly code: 'provider-not-configured'; readonly providerId: string }>
  | Readonly<{ readonly code: 'model-not-configured'; readonly modelId: string }>
  | Readonly<{
      readonly code: LlmParameterDiagnosticCode;
      readonly field: string;
    }>;

export interface ParameterApplicationProjection {
  readonly rows: readonly Readonly<{ readonly name: string; readonly value: string | number }>[];
  readonly providerOptionNames: readonly string[];
}

export interface ParameterDiagnostic {
  readonly code: ParameterDiagnosticCode;
  readonly name?: string;
  readonly value?: string;
  readonly causes?: readonly ParameterValidationDiagnostic[];
}

export type ParameterSemanticResult =
  | Readonly<{ readonly kind: 'status'; readonly config: AgentLlmConfig }>
  | Readonly<{ readonly kind: 'reset' }>
  | Readonly<{
      readonly kind: 'updated';
      readonly name: string;
      readonly value: string;
      readonly application: ParameterApplicationProjection;
    }>
  | Readonly<{ readonly kind: 'diagnostic'; readonly diagnostic: ParameterDiagnostic }>;

type Context = AgentTerminalPresentationContext<AgentTerminalMessageKey>;

export function presentParameterCommand(
  result: ParameterSemanticResult,
  context: Context,
): AgentTerminalCommandProjection {
  switch (result.kind) {
    case 'status':
      return { kind: 'output', output: presentStatus(result.config, context) };
    case 'reset':
      return { kind: 'output', output: context.t('agent.terminal.parameter.reset') };
    case 'updated': {
      const lines = [
        context.t('agent.terminal.parameter.updated', {
          name: result.name,
          value: result.value,
        }),
      ];
      const applicationRows = presentApplication(result.application, context);
      lines.push(...applicationRows);
      return { kind: 'output', output: lines.join('\n') };
    }
    case 'diagnostic':
      return presentDiagnostic(result.diagnostic, context);
  }
}

function presentStatus(config: AgentLlmConfig, context: Context): string {
  const lines = [context.t('agent.terminal.parameter.status.header')];
  lines.push(presentRow('reasoning', config.reasoningPreset, context));
  lines.push(presentRow('verbosity', config.verbosityPreset, context));
  lines.push(presentRow('creativity', config.creativityPreset, context));
  const advanced = config.advanced ?? {};
  if (Object.keys(advanced).length > 0) {
    lines.push(context.t('agent.terminal.parameter.status.advanced'));
    for (const key of TERMINAL_ADVANCED_PARAMETER_KEYS) {
      const value = advanced[key];
      if (value !== undefined) {
        lines.push(context.t('agent.terminal.parameter.status.advancedRow', { name: key, value }));
      }
    }
  }
  lines.push('', context.t('agent.terminal.parameter.usage'));
  return lines.join('\n');
}

function presentRow(name: string, value: string | undefined, context: Context): string {
  return context.t('agent.terminal.parameter.status.row', {
    name,
    value: value ?? context.t('agent.terminal.value.default'),
  });
}

function presentDiagnostic(
  diagnostic: ParameterDiagnostic,
  context: Context,
): AgentTerminalCommandProjection {
  const code = `parameter.${diagnostic.code}`;
  let message: string;
  switch (diagnostic.code) {
    case 'unavailable':
      message = context.t('agent.terminal.diagnostic.parameter.unavailable');
      break;
    case 'usage':
      message = context.t('agent.terminal.diagnostic.parameter.usage');
      break;
    case 'set-usage':
      message = context.t('agent.terminal.diagnostic.parameter.setUsage');
      break;
    case 'unsupported':
      message = context.t('agent.terminal.diagnostic.parameter.unsupported', {
        name: required(diagnostic.name, code),
      });
      break;
    case 'invalid-reasoning':
    case 'invalid-verbosity-preset':
    case 'invalid-creativity':
    case 'invalid-reasoning-effort':
    case 'invalid-text-verbosity':
    case 'invalid-service-tier':
      message = presentEnumeratedDiagnostic(diagnostic.code, context);
      break;
    case 'number-range':
      message = context.t('agent.terminal.diagnostic.parameter.numberRange', {
        name: required(diagnostic.name, code),
      });
      break;
    case 'positive-integer':
      message = context.t('agent.terminal.diagnostic.parameter.positiveInteger', {
        name: required(diagnostic.name, code),
      });
      break;
    case 'validation-failed':
      message = context.t('agent.terminal.diagnostic.parameter.validationFailed');
      break;
  }
  const causes = diagnostic.causes?.map((cause) => presentValidationCause(cause, context)) ?? [];
  return {
    kind: 'error',
    diagnosticCode: code,
    error: causes.length === 0 ? message : [message, ...causes].join('\n'),
  };
}

function presentApplication(
  application: ParameterApplicationProjection,
  context: Context,
): string[] {
  if (application.rows.length === 0 && application.providerOptionNames.length === 0) {
    return [context.t('agent.terminal.parameter.applied.defaults')];
  }

  const lines = [context.t('agent.terminal.parameter.applied.header')];
  for (const row of application.rows) {
    lines.push(
      context.t('agent.terminal.parameter.applied.row', {
        name: row.name,
        value: row.value,
      }),
    );
  }
  if (application.providerOptionNames.length > 0) {
    lines.push(
      context.t('agent.terminal.parameter.applied.providerOptions', {
        names: application.providerOptionNames.join(','),
      }),
    );
  }
  return lines;
}

function presentValidationCause(
  diagnostic: ParameterValidationDiagnostic,
  context: Context,
): string {
  switch (diagnostic.code) {
    case 'provider-not-configured':
      return context.t('agent.terminal.diagnostic.parameter.providerNotConfigured', {
        providerId: diagnostic.providerId,
      });
    case 'model-not-configured':
      return context.t('agent.terminal.diagnostic.parameter.modelNotConfigured', {
        modelId: diagnostic.modelId,
      });
    case 'unsupported-reasoning-effort':
      return context.t('agent.terminal.diagnostic.parameter.unsupportedReasoningEffort', {
        field: diagnostic.field,
      });
    case 'unsupported-thinking-budget':
      return context.t('agent.terminal.diagnostic.parameter.unsupportedThinkingBudget', {
        field: diagnostic.field,
      });
    case 'unsupported-verbosity':
      return context.t('agent.terminal.diagnostic.parameter.unsupportedVerbosity', {
        field: diagnostic.field,
      });
    case 'unsupported-temperature':
      return context.t('agent.terminal.diagnostic.parameter.unsupportedTemperature', {
        field: diagnostic.field,
      });
    case 'unsupported-top-p':
      return context.t('agent.terminal.diagnostic.parameter.unsupportedTopP', {
        field: diagnostic.field,
      });
    case 'unsupported-fast-tier':
      return context.t('agent.terminal.diagnostic.parameter.unsupportedFastTier', {
        field: diagnostic.field,
      });
    case 'unsupported-service-tier':
      return context.t('agent.terminal.diagnostic.parameter.unsupportedServiceTier', {
        field: diagnostic.field,
      });
    case 'unsupported-max-output-tokens':
      return context.t('agent.terminal.diagnostic.parameter.unsupportedMaxOutputTokens', {
        field: diagnostic.field,
      });
    case 'invalid-anthropic-thinking-sampling-combination':
      return context.t('agent.terminal.diagnostic.parameter.invalidAnthropicThinkingSampling', {
        field: diagnostic.field,
      });
  }
}

function required(value: string | undefined, code: string): string {
  if (value === undefined)
    throw new Error(`Missing semantic value for terminal diagnostic: ${code}`);
  return value;
}

function presentEnumeratedDiagnostic(
  code:
    | 'invalid-reasoning'
    | 'invalid-verbosity-preset'
    | 'invalid-creativity'
    | 'invalid-reasoning-effort'
    | 'invalid-text-verbosity'
    | 'invalid-service-tier',
  context: Context,
): string {
  switch (code) {
    case 'invalid-reasoning':
      return context.t('agent.terminal.diagnostic.parameter.invalid-reasoning');
    case 'invalid-verbosity-preset':
      return context.t('agent.terminal.diagnostic.parameter.invalid-verbosity-preset');
    case 'invalid-creativity':
      return context.t('agent.terminal.diagnostic.parameter.invalid-creativity');
    case 'invalid-reasoning-effort':
      return context.t('agent.terminal.diagnostic.parameter.invalid-reasoning-effort');
    case 'invalid-text-verbosity':
      return context.t('agent.terminal.diagnostic.parameter.invalid-text-verbosity');
    case 'invalid-service-tier':
      return context.t('agent.terminal.diagnostic.parameter.invalid-service-tier');
  }
}
