import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalCommandProjection } from './model-family-presentation';
import type { AgentTerminalMessageKey } from './terminal-messages';

export interface TerminalConfigSnapshot {
  readonly provider: string;
  readonly model: string;
  readonly maskedApiKey?: string;
  readonly baseUrl?: string;
  readonly maxOutputTokens: number;
  readonly temperature: number;
  readonly verbose: boolean;
  readonly outputFormat: string;
  readonly workDir: string;
  readonly mcpServerCount: number;
}

export interface TerminalProviderSnapshot {
  readonly id: string;
  readonly displayName: string;
  readonly type: string;
  readonly hasApiKey: boolean;
  readonly models: readonly string[];
}

export interface TerminalConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: number;
  readonly messageCount: number;
  readonly current: boolean;
}

export interface TerminalHistoryRow {
  readonly role: 'user' | 'assistant' | 'tool';
  readonly preview?: string;
}

export type ConfigCommandSemanticResult =
  | Readonly<{
      readonly kind: 'status';
      readonly surface: 'slash' | 'process';
      readonly config: TerminalConfigSnapshot;
    }>
  | Readonly<{ readonly kind: 'updated'; readonly key: string; readonly value: string }>
  | Readonly<{
      readonly kind: 'providers';
      readonly providers: readonly TerminalProviderSnapshot[];
    }>
  | Readonly<{
      readonly kind: 'models';
      readonly providerId: string;
      readonly currentModelId: string;
      readonly models: readonly string[];
    }>
  | Readonly<{
      readonly kind: 'diagnostic';
      readonly code:
        | 'set-usage'
        | 'invalid-key'
        | 'invalid-max-tokens'
        | 'invalid-temperature'
        | 'invalid-output-format'
        | 'update-unavailable'
        | 'models-empty'
        | 'unknown-command';
      readonly key?: string;
      readonly providerId?: string;
      readonly command?: string;
    }>;

export type ResumeCommandSemanticResult =
  | Readonly<{
      readonly kind: 'resumed';
      readonly title: string;
      readonly messageCount: number;
      readonly updatedAt: number;
    }>
  | Readonly<{
      readonly kind: 'conversations';
      readonly conversations: readonly TerminalConversationSummary[];
    }>
  | Readonly<{
      readonly kind: 'diagnostic';
      readonly code: 'unavailable' | 'not-found' | 'storage-failed';
      readonly conversationId?: string;
      readonly detail?: string;
    }>;

export type HistoryCommandSemanticResult =
  | Readonly<{ readonly kind: 'history'; readonly rows: readonly TerminalHistoryRow[] }>
  | Readonly<{ readonly kind: 'diagnostic'; readonly code: 'unavailable' }>;

type PresentationContext = AgentTerminalPresentationContext<AgentTerminalMessageKey>;

export function presentConfigCommand(
  result: ConfigCommandSemanticResult,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.kind) {
    case 'status':
      return { kind: 'output', output: presentConfigStatus(result, context) };
    case 'updated':
      return {
        kind: 'output',
        output: context.t('agent.terminal.config.updated', {
          key: result.key,
          value: result.value,
        }),
      };
    case 'providers':
      return { kind: 'output', output: presentProviders(result.providers, context) };
    case 'models':
      return { kind: 'output', output: presentModels(result, context) };
    case 'diagnostic':
      return presentConfigDiagnostic(result, context);
  }
}

export function presentResumeCommand(
  result: ResumeCommandSemanticResult,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.kind) {
    case 'resumed':
      return {
        kind: 'output',
        output: context.t(resumeCountKey(result.messageCount), {
          title: result.title,
          messageCount: context.format.count(result.messageCount),
          updatedAt: context.format.dateTime(result.updatedAt),
        }),
      };
    case 'conversations':
      return { kind: 'output', output: presentConversations(result.conversations, context) };
    case 'diagnostic':
      return presentResumeDiagnostic(result, context);
  }
}

export function presentHistoryCommand(
  result: HistoryCommandSemanticResult,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  if (result.kind === 'diagnostic') {
    return terminalError(
      'history.unavailable',
      'agent.terminal.diagnostic.history.unavailable',
      context,
    );
  }
  if (result.rows.length === 0) {
    return { kind: 'output', output: context.t('agent.terminal.history.empty') };
  }
  return {
    kind: 'output',
    output: [
      context.t(historyCountKey(result.rows.length), {
        messageCount: context.format.count(result.rows.length),
      }),
      ...result.rows.map((row, index) =>
        context.t('agent.terminal.history.row', {
          index: context.format.count(index + 1),
          role: context.t(`agent.terminal.history.role.${row.role}`),
          preview: row.preview ?? context.t('agent.terminal.history.structured'),
        }),
      ),
    ].join('\n'),
  };
}

function presentConfigStatus(
  result: Extract<ConfigCommandSemanticResult, { readonly kind: 'status' }>,
  context: PresentationContext,
): string {
  const { config } = result;
  const value = (
    field:
      | 'provider'
      | 'model'
      | 'apiKey'
      | 'baseUrl'
      | 'maxOutputTokens'
      | 'temperature'
      | 'verbose'
      | 'outputFormat'
      | 'workDir'
      | 'mcpServers',
    fieldValue: string | number | boolean,
  ): string =>
    context.t('agent.terminal.config.status.row', {
      name: context.t(`agent.terminal.config.status.field.${field}`),
      value: String(fieldValue),
    });
  const rows = [
    context.t('agent.terminal.config.status.header'),
    value('provider', config.provider),
    value('model', config.model),
    value('apiKey', config.maskedApiKey ?? context.t('agent.terminal.value.notSet')),
    value('baseUrl', config.baseUrl ?? context.t('agent.terminal.value.default')),
    value('maxOutputTokens', context.format.count(config.maxOutputTokens)),
    value('temperature', config.temperature),
    value('verbose', config.verbose),
    value('outputFormat', config.outputFormat),
    value('workDir', config.workDir),
    value('mcpServers', context.format.count(config.mcpServerCount)),
  ];
  if (result.surface === 'slash') {
    rows.push(
      context.t('agent.terminal.config.status.usage.set'),
      context.t('agent.terminal.config.status.usage.providers'),
      context.t('agent.terminal.config.status.usage.models'),
    );
  }
  return rows.join('\n');
}

function presentProviders(
  providers: readonly TerminalProviderSnapshot[],
  context: PresentationContext,
): string {
  return [
    context.t('agent.terminal.config.providers.header'),
    ...providers.flatMap((provider) => [
      context.t('agent.terminal.config.providers.row', {
        providerId: provider.id,
        displayName: provider.displayName,
      }),
      context.t('agent.terminal.config.providers.type', { type: provider.type }),
      context.t('agent.terminal.config.providers.apiKey', {
        state: provider.hasApiKey ? '✓' : '✗',
      }),
      context.t('agent.terminal.config.providers.models', {
        models:
          provider.models.length > 0
            ? provider.models.join(', ')
            : context.t('agent.terminal.value.none'),
      }),
    ]),
  ].join('\n');
}

function presentModels(
  result: Extract<ConfigCommandSemanticResult, { readonly kind: 'models' }>,
  context: PresentationContext,
): string {
  return [
    context.t('agent.terminal.config.models.header', { providerId: result.providerId }),
    ...result.models.map((modelId) =>
      context.t(
        modelId === result.currentModelId
          ? 'agent.terminal.config.models.rowCurrent'
          : 'agent.terminal.config.models.row',
        { modelId },
      ),
    ),
    context.t('agent.terminal.config.models.currentHint'),
  ].join('\n');
}

function presentConversations(
  conversations: readonly TerminalConversationSummary[],
  context: PresentationContext,
): string {
  if (conversations.length === 0) {
    return context.t('agent.terminal.resume.empty');
  }
  return [
    context.t('agent.terminal.resume.header'),
    ...conversations.flatMap((conversation, index) => [
      context.t(
        conversation.current ? 'agent.terminal.resume.rowCurrent' : 'agent.terminal.resume.row',
        {
          index: context.format.count(index + 1),
          title: conversation.title,
        },
      ),
      context.t(resumeSummaryCountKey(conversation.messageCount), {
        conversationId: conversation.id,
        updatedAt: context.format.dateTime(conversation.updatedAt),
        messageCount: context.format.count(conversation.messageCount),
      }),
    ]),
    context.t('agent.terminal.resume.usage'),
  ].join('\n');
}

function presentConfigDiagnostic(
  result: Extract<ConfigCommandSemanticResult, { readonly kind: 'diagnostic' }>,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.code) {
    case 'set-usage':
      return terminalError(
        'config.set-usage',
        'agent.terminal.diagnostic.config.setUsage',
        context,
      );
    case 'invalid-key':
      return terminalError(
        'config.invalid-key',
        'agent.terminal.diagnostic.config.invalidKey',
        context,
        {
          key: required(result.key, result.code),
        },
      );
    case 'invalid-max-tokens':
      return terminalError(
        'config.invalid-max-tokens',
        'agent.terminal.diagnostic.config.invalidMaxTokens',
        context,
      );
    case 'invalid-temperature':
      return terminalError(
        'config.invalid-temperature',
        'agent.terminal.diagnostic.config.invalidTemperature',
        context,
      );
    case 'invalid-output-format':
      return terminalError(
        'config.invalid-output-format',
        'agent.terminal.diagnostic.config.invalidOutputFormat',
        context,
      );
    case 'update-unavailable':
      return terminalError(
        'config.update-unavailable',
        'agent.terminal.diagnostic.config.updateUnavailable',
        context,
      );
    case 'models-empty':
      return terminalError(
        'config.models-empty',
        'agent.terminal.diagnostic.config.modelsEmpty',
        context,
        {
          providerId: required(result.providerId, result.code),
        },
      );
    case 'unknown-command':
      return terminalError(
        'config.unknown-command',
        'agent.terminal.diagnostic.config.unknownCommand',
        context,
        {
          command: required(result.command, result.code),
        },
      );
  }
}

function presentResumeDiagnostic(
  result: Extract<ResumeCommandSemanticResult, { readonly kind: 'diagnostic' }>,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.code) {
    case 'unavailable':
      return terminalError(
        'resume.unavailable',
        'agent.terminal.diagnostic.resume.unavailable',
        context,
      );
    case 'not-found':
      return terminalError(
        'resume.not-found',
        'agent.terminal.diagnostic.resume.notFound',
        context,
        {
          conversationId: required(result.conversationId, result.code),
        },
      );
    case 'storage-failed':
      return terminalError(
        'resume.storage-failed',
        'agent.terminal.diagnostic.resume.storageFailed',
        context,
        {
          detail: required(result.detail, result.code),
        },
      );
  }
}

function terminalError(
  diagnosticCode: string,
  key: AgentTerminalMessageKey,
  context: PresentationContext,
  params?: Readonly<Record<string, string | number>>,
): AgentTerminalCommandProjection {
  return { kind: 'error', diagnosticCode, error: context.t(key, params) };
}

function resumeCountKey(count: number): AgentTerminalMessageKey {
  return count === 1 ? 'agent.terminal.resume.resumedOne' : 'agent.terminal.resume.resumedMany';
}

function resumeSummaryCountKey(count: number): AgentTerminalMessageKey {
  return count === 1 ? 'agent.terminal.resume.summaryOne' : 'agent.terminal.resume.summaryMany';
}

function historyCountKey(count: number): AgentTerminalMessageKey {
  return count === 1 ? 'agent.terminal.history.headerOne' : 'agent.terminal.history.headerMany';
}

function required(value: string | undefined, code: string): string {
  if (value === undefined) {
    throw new Error(`Missing semantic data for terminal diagnostic: ${code}`);
  }
  return value;
}
