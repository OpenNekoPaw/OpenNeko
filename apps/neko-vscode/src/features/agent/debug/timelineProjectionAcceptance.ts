import type { FeatureRuntimeContext } from '../../../feature-runtime-context';
import * as vscode from 'vscode';
import type { PiProductAgentEvent, PiProductEventPayload } from '@neko/agent/pi';
import type { ConversationProjectionStore } from '@neko/agent/runtime';
import type { ConversationProjectionSnapshot } from '@neko-agent/types';

import { getLogger } from '../base';
import {
  createPiAgentStreamSession,
  type PiAgentStreamSession,
} from '../chat/message/piAgentStreamProcessor';

export const TIMELINE_PROJECTION_ACCEPTANCE_START_COMMAND =
  'neko.agent.debug.startTimelineProjectionAcceptance';
export const TIMELINE_PROJECTION_ACCEPTANCE_CONTINUE_COMMAND =
  'neko.agent.debug.continueTimelineProjectionAcceptance';
export const TIMELINE_PROJECTION_ACCEPTANCE_CANCEL_COMMAND =
  'neko.agent.debug.cancelTimelineProjectionAcceptance';
export const TIMELINE_PROJECTION_ACCEPTANCE_CONTEXT_KEY =
  'neko.agent.timelineProjectionAcceptanceEnabled';

const logger = getLogger('TimelineProjectionAcceptance');

interface ProjectionOwner {
  getOrCreateProjection(conversationId: string): ConversationProjectionStore;
}

interface AcceptanceChatView {
  readonly webview: vscode.Webview | undefined;
  getSelectedAgentConversationId(): string | null;
}

type AcceptancePhase = 'idle' | 'awaiting-reattach' | 'awaiting-cancel' | 'completed';

export interface TimelineProjectionAcceptanceIdentity {
  readonly conversationId: string;
  readonly primaryTurnId: string;
  readonly primaryRunId: string;
  readonly primaryMessageId: string;
  readonly cancellationTurnId: string;
  readonly cancellationRunId: string;
  readonly cancellationMessageId: string;
  readonly toolCallId: string;
  readonly confirmationId: string;
}

export interface TimelineProjectionAcceptanceReport extends TimelineProjectionAcceptanceIdentity {
  readonly phase: AcceptancePhase;
  readonly projectionVersion: number;
  readonly primaryTerminalStatus?: 'completed';
  readonly cancellationTerminalStatus?: 'cancelled';
  readonly toolItemRevision?: number;
  readonly toolStatus?: 'succeeded';
  readonly persistenceWrites: 0;
  readonly canonicalPath: readonly [
    'pi-product-event',
    'shared-pi-timeline-projector',
    'conversation-projection-store',
    'projection-attachment',
    'webview-tab-replica',
  ];
}

export interface TimelineProjectionAcceptanceControllerOptions {
  readonly createRunId?: () => string;
  readonly now?: () => number;
  readonly createSession?: typeof createPiAgentStreamSession;
}

interface ActiveAcceptance {
  readonly identity: TimelineProjectionAcceptanceIdentity;
  readonly projection: ConversationProjectionStore;
  readonly primary: PiAgentStreamSession;
  cancellation?: PiAgentStreamSession;
  phase: Exclude<AcceptancePhase, 'idle'>;
}

/**
 * Development-only deterministic driver for the real Extension projection
 * attachment and Webview replica boundary. It never writes conversation
 * history, invokes a provider, or creates another projection authority.
 */
export class TimelineProjectionAcceptanceController implements vscode.Disposable {
  private readonly createRunId: () => string;
  private readonly now: () => number;
  private readonly createSession: typeof createPiAgentStreamSession;
  private active: ActiveAcceptance | undefined;

  constructor(
    private readonly projectionOwner: ProjectionOwner,
    options: TimelineProjectionAcceptanceControllerOptions = {},
  ) {
    this.createRunId = options.createRunId ?? (() => Date.now().toString(36));
    this.now = options.now ?? Date.now;
    this.createSession = options.createSession ?? createPiAgentStreamSession;
  }

  start(conversationId: string): TimelineProjectionAcceptanceReport {
    if (this.active && this.active.phase !== 'completed') {
      throw new Error(`Timeline projection acceptance cannot start while ${this.active.phase}.`);
    }
    this.disposeActive();

    const runId = this.createRunId();
    const identity: TimelineProjectionAcceptanceIdentity = {
      conversationId,
      primaryTurnId: `timeline-acceptance-primary-turn-${runId}`,
      primaryRunId: `timeline-acceptance-primary-run-${runId}`,
      primaryMessageId: `timeline-acceptance-primary-message-${runId}`,
      cancellationTurnId: `timeline-acceptance-cancel-turn-${runId}`,
      cancellationRunId: `timeline-acceptance-cancel-run-${runId}`,
      cancellationMessageId: `timeline-acceptance-cancel-message-${runId}`,
      toolCallId: `timeline-acceptance-tool-${runId}`,
      confirmationId: `timeline-acceptance-confirmation-${runId}`,
    };
    const projection = this.projectionOwner.getOrCreateProjection(conversationId);
    const primary = this.createSession({
      conversationId,
      messageId: identity.primaryMessageId,
      projection,
      onPhaseChange: () => undefined,
    });
    const active: ActiveAcceptance = {
      identity,
      projection,
      primary,
      phase: 'awaiting-reattach',
    };
    this.active = active;

    this.emitPrimary(active, { type: 'turn.started' });
    this.emitPrimary(active, {
      type: 'assistant.thinking.delta',
      sourceIndex: 0,
      delta: 'Inspecting the projection attachment path.',
    });
    this.emitPrimary(active, {
      type: 'assistant.text.delta',
      sourceIndex: 1,
      delta: '## Timeline projection acceptance\n\nSnapshot content before reattach.',
    });
    this.emitPrimary(active, {
      type: 'tool.started',
      toolCallId: identity.toolCallId,
      toolName: 'SyntheticProjectionProbe',
      args: { fixture: 'isolated-extension-host' },
    });
    this.emitPrimary(active, {
      type: 'tool.updated',
      toolCallId: identity.toolCallId,
      toolName: 'SyntheticProjectionProbe',
      update: {
        content: [{ type: 'text', text: 'Awaiting attachment replacement' }],
        details: { success: true, data: { stage: 'awaiting-reattach' } },
      },
    });
    this.emitPrimary(active, {
      type: 'confirmation.required',
      confirmationId: identity.confirmationId,
      toolCallId: identity.toolCallId,
      toolName: 'SyntheticProjectionProbe',
      summary: 'Continue the isolated projection acceptance fixture',
    });

    const report = this.report(active);
    logger.info('Timeline projection acceptance paused for Webview reattach', report);
    return report;
  }

  continueAfterReattach(): TimelineProjectionAcceptanceReport {
    const active = this.requirePhase('awaiting-reattach');
    this.emitPrimary(active, {
      type: 'tool.completed',
      toolCallId: active.identity.toolCallId,
      toolName: 'SyntheticProjectionProbe',
      result: {
        details: {
          success: true,
          data: { stage: 'reattached', source: 'canonical-projection' },
        },
      },
      isError: false,
    });
    this.emitPrimary(active, {
      type: 'assistant.text.delta',
      sourceIndex: 2,
      delta: '\n\nLive patch after snapshot acknowledgement.',
    });
    this.emitPrimary(active, { type: 'turn.completed' });
    const primaryResult = active.primary.result();
    if (primaryResult.terminalStatus !== 'completed') {
      throw new Error(
        `Timeline projection acceptance primary turn ended as ${primaryResult.terminalStatus}.`,
      );
    }

    active.cancellation = this.createSession({
      conversationId: active.identity.conversationId,
      messageId: active.identity.cancellationMessageId,
      projection: active.projection,
      onPhaseChange: () => undefined,
    });
    active.phase = 'awaiting-cancel';
    this.emitCancellation(active, { type: 'turn.started' });
    this.emitCancellation(active, {
      type: 'assistant.text.delta',
      sourceIndex: 0,
      delta: 'Cancellation turn is active.',
    });

    const report = this.report(active);
    logger.info('Timeline projection acceptance awaiting cancellation', report);
    return report;
  }

  cancel(): TimelineProjectionAcceptanceReport {
    const active = this.requirePhase('awaiting-cancel');
    this.emitCancellation(active, {
      type: 'turn.cancelled',
      reason: 'Extension Development Host acceptance cancellation',
    });
    const cancellationResult = active.cancellation?.result();
    if (cancellationResult?.terminalStatus !== 'cancelled') {
      throw new Error(
        `Timeline projection acceptance cancellation ended as ${
          cancellationResult?.terminalStatus ?? 'missing'
        }.`,
      );
    }
    active.phase = 'completed';
    const report = this.report(active);
    logger.info('Timeline projection acceptance completed', report);
    return report;
  }

  dispose(): void {
    this.disposeActive();
  }

  private emitPrimary(active: ActiveAcceptance, payload: PiProductEventPayload): void {
    active.primary.events.emit(this.event(active.identity, 'primary', payload));
  }

  private emitCancellation(active: ActiveAcceptance, payload: PiProductEventPayload): void {
    const cancellation = active.cancellation;
    if (!cancellation) {
      throw new Error('Timeline projection acceptance cancellation session is unavailable.');
    }
    cancellation.events.emit(this.event(active.identity, 'cancellation', payload));
  }

  private event(
    identity: TimelineProjectionAcceptanceIdentity,
    turn: 'primary' | 'cancellation',
    payload: PiProductEventPayload,
  ): PiProductAgentEvent {
    return {
      ...payload,
      identity: {
        workspaceId: 'timeline-projection-acceptance-workspace',
        conversationId: identity.conversationId,
        branchId: 'timeline-projection-acceptance-branch',
        turnId: turn === 'primary' ? identity.primaryTurnId : identity.cancellationTurnId,
        runId: turn === 'primary' ? identity.primaryRunId : identity.cancellationRunId,
      },
      timestamp: this.now(),
    };
  }

  private requirePhase(phase: ActiveAcceptance['phase']): ActiveAcceptance {
    const active = this.active;
    if (!active || active.phase !== phase) {
      throw new Error(
        `Timeline projection acceptance expected ${phase}, received ${active?.phase ?? 'idle'}.`,
      );
    }
    return active;
  }

  private report(active: ActiveAcceptance): TimelineProjectionAcceptanceReport {
    const snapshot = active.projection.snapshot();
    const primary = findTurn(snapshot, active.identity.primaryTurnId, active.identity.primaryRunId);
    const cancellation = findTurn(
      snapshot,
      active.identity.cancellationTurnId,
      active.identity.cancellationRunId,
    );
    const tool = primary?.items.find(
      (item) =>
        item.kind === 'tool_call' && item.payload.toolCall.id === active.identity.toolCallId,
    );
    return {
      ...active.identity,
      phase: active.phase,
      projectionVersion: snapshot.projectionVersion,
      ...(primary?.completion?.status === 'completed'
        ? { primaryTerminalStatus: 'completed' as const }
        : {}),
      ...(cancellation?.completion?.status === 'cancelled'
        ? { cancellationTerminalStatus: 'cancelled' as const }
        : {}),
      ...(tool?.kind === 'tool_call'
        ? {
            toolItemRevision: tool.itemRevision,
            ...(tool.status === 'succeeded' ? { toolStatus: 'succeeded' as const } : {}),
          }
        : {}),
      persistenceWrites: 0,
      canonicalPath: [
        'pi-product-event',
        'shared-pi-timeline-projector',
        'conversation-projection-store',
        'projection-attachment',
        'webview-tab-replica',
      ],
    };
  }

  private disposeActive(): void {
    this.active?.primary.dispose();
    this.active?.cancellation?.dispose();
    this.active = undefined;
  }
}

export async function registerTimelineProjectionAcceptanceCommands(input: {
  readonly context: FeatureRuntimeContext;
  readonly chatViewProvider: AcceptanceChatView;
  readonly controller: TimelineProjectionAcceptanceController;
}): Promise<void> {
  if (input.context.extensionMode !== vscode.ExtensionMode.Development) return;

  await vscode.commands.executeCommand(
    'setContext',
    TIMELINE_PROJECTION_ACCEPTANCE_CONTEXT_KEY,
    true,
  );
  const requireConversation = (): string => {
    if (!input.chatViewProvider.webview) {
      throw new Error('Open the Neko Agent Webview before running projection acceptance.');
    }
    const conversationId = input.chatViewProvider.getSelectedAgentConversationId();
    if (!conversationId) {
      throw new Error(
        'Select an isolated Agent conversation before running projection acceptance.',
      );
    }
    return conversationId;
  };
  input.context.subscriptions.push(
    input.controller,
    vscode.commands.registerCommand(TIMELINE_PROJECTION_ACCEPTANCE_START_COMMAND, () =>
      input.controller.start(requireConversation()),
    ),
    vscode.commands.registerCommand(TIMELINE_PROJECTION_ACCEPTANCE_CONTINUE_COMMAND, () =>
      input.controller.continueAfterReattach(),
    ),
    vscode.commands.registerCommand(TIMELINE_PROJECTION_ACCEPTANCE_CANCEL_COMMAND, () =>
      input.controller.cancel(),
    ),
  );
}

function findTurn(snapshot: ConversationProjectionSnapshot, turnId: string, runId: string) {
  return snapshot.turns.find((turn) => turn.turnId === turnId && turn.runId === runId);
}
