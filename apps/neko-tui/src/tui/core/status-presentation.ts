import type { Task, TaskStatus } from '@neko/shared';
import type { AgentMessageQueueSnapshot } from '@neko-agent/types';
import type { CLIConfig } from './types';
import type { AgentStatus, ExecutionMode, SessionMode, TokenUsage } from '../types/state';
import type { AgentTerminalPresentationContext } from '../presentation/context';
import type { AgentTerminalMessageKey } from '../presentation/terminal-messages';

export interface TuiStatusSnapshot {
  readonly config: CLIConfig;
  readonly execution: Readonly<{
    readonly sessionMode: SessionMode;
    readonly executionMode: ExecutionMode;
    readonly status: AgentStatus;
  }>;
  readonly usage: TokenUsage;
  readonly contextTokenCount?: number;
  readonly messageQueue?: AgentMessageQueueSnapshot;
  readonly runningTask?: Task;
  readonly userConfigPath: string;
}

export function presentTuiStatus(
  snapshot: TuiStatusSnapshot,
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  if (snapshot.userConfigPath.length === 0) {
    throw new Error('TUI status presentation requires userConfigPath.');
  }

  const lines = [
    context.t('agent.terminal.status.model', { modelId: formatChatModel(snapshot.config) }),
    context.t('agent.terminal.status.session', {
      sessionMode: presentSessionMode(snapshot.execution.sessionMode, context),
    }),
    context.t('agent.terminal.status.mode', {
      executionMode: presentExecutionMode(snapshot.execution.executionMode, context),
    }),
    context.t('agent.terminal.status.state', {
      status: presentAgentStatus(snapshot.execution.status, context),
    }),
    ...presentModelSelectionRows(snapshot.config, context),
    context.t('agent.terminal.status.tokens', {
      count: context.format.count(snapshot.usage.total),
    }),
    ...(snapshot.contextTokenCount === undefined
      ? []
      : [
          context.t('agent.terminal.status.contextTokens', {
            count: context.format.count(snapshot.contextTokenCount),
          }),
        ]),
  ];

  if (snapshot.messageQueue !== undefined) {
    lines.push(
      context.t('agent.terminal.status.queue', {
        count: context.format.count(snapshot.messageQueue.pendingCount),
      }),
    );
  }
  if (snapshot.runningTask !== undefined) {
    lines.push(
      context.t('agent.terminal.status.task', {
        taskId: snapshot.runningTask.id,
        status: presentTaskStatus(snapshot.runningTask.status, context),
      }),
    );
  }
  lines.push(context.t('agent.terminal.status.config', { path: snapshot.userConfigPath }));
  return lines.join('\n');
}

function presentModelSelectionRows(
  config: CLIConfig,
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): readonly string[] {
  const rows: string[] = [];
  for (const category of ['image', 'video', 'audio'] as const) {
    const mediaModelId = config.defaultMediaModels?.[category];
    if (mediaModelId !== undefined) {
      rows.push(
        context.t('agent.terminal.status.mediaModel', {
          category: presentMediaCategory(category, context),
          modelId: mediaModelId,
        }),
      );
    }
    const perceptionModelId = config.perceptionModels?.[category];
    if (perceptionModelId !== undefined) {
      rows.push(
        context.t('agent.terminal.status.perceptionModel', {
          category: presentMediaCategory(category, context),
          modelId: perceptionModelId,
        }),
      );
    }
  }
  const llmConfig = config.llmConfig;
  if (llmConfig?.reasoningPreset !== undefined) {
    rows.push(
      context.t('agent.terminal.status.parameter', {
        name: 'reasoning',
        value: llmConfig.reasoningPreset,
      }),
    );
  }
  if (llmConfig?.verbosityPreset !== undefined) {
    rows.push(
      context.t('agent.terminal.status.parameter', {
        name: 'verbosity',
        value: llmConfig.verbosityPreset,
      }),
    );
  }
  if (llmConfig?.creativityPreset !== undefined) {
    rows.push(
      context.t('agent.terminal.status.parameter', {
        name: 'creativity',
        value: llmConfig.creativityPreset,
      }),
    );
  }
  for (const [name, value] of Object.entries(llmConfig?.advanced ?? {})) {
    if (value !== undefined) {
      rows.push(context.t('agent.terminal.status.parameter', { name, value: String(value) }));
    }
  }
  return rows;
}

function presentMediaCategory(
  category: 'image' | 'video' | 'audio',
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  switch (category) {
    case 'image':
      return context.t('agent.terminal.value.sessionMode.image');
    case 'video':
      return context.t('agent.terminal.value.sessionMode.video');
    case 'audio':
      return context.t('agent.terminal.value.sessionMode.audio');
  }
}

function presentTaskStatus(
  status: TaskStatus,
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  switch (status) {
    case 'pending':
      return context.t('agent.terminal.value.taskStatus.pending');
    case 'running':
      return context.t('agent.terminal.value.taskStatus.running');
    case 'completed':
      return context.t('agent.terminal.value.taskStatus.completed');
    case 'failed':
      return context.t('agent.terminal.value.taskStatus.failed');
    case 'cancelled':
      return context.t('agent.terminal.value.taskStatus.cancelled');
  }
}

function formatChatModel(config: CLIConfig): string {
  return config.chatModel === undefined
    ? `${config.provider}:${config.model}`
    : `${config.chatModel.providerId}:${config.chatModel.modelId}`;
}

function presentAgentStatus(
  status: AgentStatus,
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  switch (status) {
    case 'idle':
      return context.t('agent.terminal.value.agentStatus.idle');
    case 'running':
      return context.t('agent.terminal.value.agentStatus.running');
    case 'waiting_confirmation':
      return context.t('agent.terminal.value.agentStatus.waitingConfirmation');
    case 'error':
      return context.t('agent.terminal.value.agentStatus.error');
  }
}

function presentExecutionMode(
  mode: ExecutionMode,
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  switch (mode) {
    case 'plan':
      return context.t('agent.terminal.value.executionMode.plan');
    case 'ask':
      return context.t('agent.terminal.value.executionMode.ask');
    case 'auto':
      return context.t('agent.terminal.value.executionMode.auto');
  }
}

function presentSessionMode(
  mode: SessionMode,
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  switch (mode) {
    case 'agent':
      return context.t('agent.terminal.value.sessionMode.agent');
    case 'image':
      return context.t('agent.terminal.value.sessionMode.image');
    case 'video':
      return context.t('agent.terminal.value.sessionMode.video');
    case 'audio':
      return context.t('agent.terminal.value.sessionMode.audio');
  }
}
