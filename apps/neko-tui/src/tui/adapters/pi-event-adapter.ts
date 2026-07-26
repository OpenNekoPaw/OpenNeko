import {
  createPiTimelineProjector,
  type PiProductAgentEvent,
  type PiProductEventSink,
  type PiTimelineProjector,
} from '@neko/agent/pi';
import {
  createConversationProjectionStore,
  type ConversationProjectionStore,
} from '@neko/agent/runtime';
import type {
  AgentTurnTimelineCompletionStatus,
  ConversationProjectionSnapshot,
  ConversationTurnProjection,
} from '@neko-agent/types';
import type {
  ToolResultArtifactTransfer,
  ToolResultAttachment,
} from '@neko/shared';

import {
  createTerminalTimelineProjector,
  type TerminalTimelineProjector,
} from '../core/timeline-projector';
import type { AgentTerminalPresentationContext } from '../presentation/context';
import type { AgentTerminalMessageKey } from '../presentation/terminal-messages';
import type { TuiConversationStores } from '../runtime/tui-runtime-context';

export interface TuiPiTerminalToolResult {
  readonly name: string;
  readonly success: boolean;
  readonly data?: unknown;
  readonly attachments?: readonly ToolResultAttachment[];
  readonly artifacts?: readonly ToolResultArtifactTransfer[];
}

export interface TuiPiProjectionEvidence {
  readonly implementation: 'shared-pi-timeline-projector';
  readonly store: 'conversation-projection-store';
  readonly presenter: 'terminal-timeline-presenter';
  readonly path: readonly [
    'pi-product-event',
    'shared-pi-timeline-projector',
    'conversation-projection-store',
    'terminal-timeline-presenter',
  ];
  readonly conversationId: string;
  readonly turnId: string;
  readonly runId: string;
  readonly messageId: string;
  readonly projectionVersion: number;
  readonly terminalProjectionVersion?: number;
  readonly completionStatus?: AgentTurnTimelineCompletionStatus;
  readonly patches: readonly {
    readonly baseProjectionVersion: number;
    readonly projectionVersion: number;
  }[];
  readonly droppedPatchCount: number;
  readonly acceptedPostTerminalPatchCount: number;
  readonly items: readonly {
    readonly itemId: string;
    readonly kind: ConversationTurnProjection['items'][number]['kind'];
    readonly itemRevision: number;
    readonly toolCallId?: string;
    readonly toolName?: string;
  }[];
}

export interface TuiPiEventAdapter extends PiProductEventSink {
  reset(): void;
  snapshot(): ConversationProjectionSnapshot;
  readProjectionEvidence(): TuiPiProjectionEvidence | null;
  readTerminalToolResults(): readonly TuiPiTerminalToolResult[];
  dispose(): void;
}

const PROJECTION_PATCH_EVIDENCE_LIMIT = 2_048;

export function createTuiPiEventAdapter(
  stores: TuiConversationStores,
  input: {
    readonly conversationId: string;
    readonly presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>;
  },
): TuiPiEventAdapter {
  const projection = createConversationProjectionStore(input.conversationId);
  let presenter = createTerminalPresenter(input.presentation);
  let projector: PiTimelineProjector | undefined;
  let patchEvidence: Array<{
    readonly baseProjectionVersion: number;
    readonly projectionVersion: number;
  }> = [];
  let droppedPatchCount = 0;
  let terminalProjectionVersion: number | undefined;
  let acceptedPostTerminalPatchCount = 0;
  const observedPath = new Set<string>();
  let disposed = false;
  const unsubscribe = projection.subscribe((patch) => {
    observedPath.add('conversation-projection-store');
    if (terminalProjectionVersion !== undefined) {
      acceptedPostTerminalPatchCount += 1;
    }
    if (patchEvidence.length >= PROJECTION_PATCH_EVIDENCE_LIMIT) {
      patchEvidence.shift();
      droppedPatchCount += 1;
    }
    patchEvidence.push({
      baseProjectionVersion: patch.baseProjectionVersion,
      projectionVersion: patch.projectionVersion,
    });
    const rows = presenter.projectMessage(patch);
    observedPath.add('terminal-timeline-presenter');
    stores.conversation.getState().applyTimelineRows(rows);
  });

  const requireActive = (): void => {
    if (disposed) throw new Error('TUI Pi event adapter is disposed.');
  };

  const requireProjector = (event: PiProductAgentEvent): PiTimelineProjector => {
    if (event.type === 'turn.started') {
      if (projector) throw new Error('TUI Pi adapter already owns an active turn.');
      projector = createPiTimelineProjector({
        conversationId: input.conversationId,
        messageId: `assistant-${event.identity.turnId}`,
        projection,
      });
      observedPath.add('shared-pi-timeline-projector');
    }
    if (!projector) {
      throw new Error(`TUI Pi event ${event.type} arrived without an active turn.`);
    }
    return projector;
  };

  return {
    emit(event): void {
      requireActive();
      observedPath.add('pi-product-event');
      if (event.type === 'usage') {
        stores.agent.getState().updateUsage({
          inputTokens: event.usage.input,
          outputTokens: event.usage.output,
          totalTokens: event.usage.totalTokens,
        });
        projector?.emit(event);
        return;
      }
      if (event.type === 'turn.persistence') {
        stores.agent.getState().setTurnPersistence({
          turnId: event.identity.turnId,
          state: event.state,
          ...(event.diagnostic === undefined ? {} : { diagnostic: event.diagnostic }),
        });
        projector?.emit(event);
        return;
      }

      const activeProjector = requireProjector(event);
      activeProjector.emit(event);
      if (
        event.type === 'turn.completed' ||
        event.type === 'turn.cancelled' ||
        event.type === 'turn.failed'
      ) {
        terminalProjectionVersion = projection.snapshot().projectionVersion;
      }
      switch (event.type) {
        case 'turn.started':
          stores.agent.getState().setRunning();
          return;
        case 'confirmation.required':
          stores.agent.getState().setWaitingConfirmation();
          return;
        case 'turn.completed':
        case 'turn.cancelled':
          commitTerminalAssistantMessage(stores, projection, activeProjector);
          stores.agent.getState().setIdle();
          return;
        case 'turn.failed': {
          commitTerminalAssistantMessage(stores, projection, activeProjector);
          stores.agent.getState().setError(new Error(event.error));
          return;
        }
        case 'assistant.text.delta':
        case 'assistant.thinking.delta':
        case 'assistant.message.completed':
        case 'tool.started':
        case 'tool.updated':
        case 'tool.completed':
          return;
      }
    },
    reset(): void {
      requireActive();
      if (projector && !projector.terminal) {
        throw new Error('TUI Pi adapter cannot reset a non-terminal turn.');
      }
      projector = undefined;
      presenter = createTerminalPresenter(input.presentation);
      patchEvidence = [];
      droppedPatchCount = 0;
      terminalProjectionVersion = undefined;
      acceptedPostTerminalPatchCount = 0;
      observedPath.clear();
    },
    snapshot(): ConversationProjectionSnapshot {
      requireActive();
      return projection.snapshot();
    },
    readProjectionEvidence(): TuiPiProjectionEvidence | null {
      requireActive();
      const identity = projector?.identity;
      if (!identity) return null;
      const snapshot = projection.snapshot();
      const messageId = `assistant-${identity.turnId}`;
      const turn = snapshot.turns.find(
        (candidate) =>
          candidate.turnId === identity.turnId &&
          candidate.runId === identity.runId &&
          candidate.messageId === messageId,
      );
      if (!turn) return null;
      const requiredPath = [
        'pi-product-event',
        'shared-pi-timeline-projector',
        'conversation-projection-store',
        'terminal-timeline-presenter',
      ] as const;
      if (!requiredPath.every((component) => observedPath.has(component))) {
        return null;
      }
      return {
        implementation: 'shared-pi-timeline-projector',
        store: 'conversation-projection-store',
        presenter: 'terminal-timeline-presenter',
        path: requiredPath,
        conversationId: identity.conversationId,
        turnId: identity.turnId,
        runId: identity.runId,
        messageId,
        projectionVersion: snapshot.projectionVersion,
        ...(terminalProjectionVersion === undefined
          ? {}
          : { terminalProjectionVersion }),
        ...(turn.completion === undefined ? {} : { completionStatus: turn.completion.status }),
        patches: structuredClone(patchEvidence),
        droppedPatchCount,
        acceptedPostTerminalPatchCount,
        items: turn.items.map((item) => ({
          itemId: item.itemId,
          kind: item.kind,
          itemRevision: item.itemRevision,
          ...(item.kind === 'tool_call'
            ? {
                toolCallId: item.payload.toolCall.id,
                toolName: item.payload.toolCall.name,
              }
            : {}),
        })),
      };
    },
    readTerminalToolResults(): readonly TuiPiTerminalToolResult[] {
      requireActive();
      const turn = requireTerminalTurn(projection, projector);
      return turn.items.flatMap((item) => {
        if (item.kind !== 'tool_call' || !item.payload.toolCall.result) return [];
        const result = item.payload.toolCall.result;
        return [
          {
            name: item.payload.toolCall.name,
            success: result.success,
            data: structuredClone(result.data),
            ...(result.attachments
              ? { attachments: structuredClone(result.attachments) }
              : {}),
            ...(result.artifacts
              ? {
                  artifacts:
                    structuredClone(result.artifacts) as readonly ToolResultArtifactTransfer[],
                }
              : {}),
          },
        ];
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      projection.dispose();
      projector = undefined;
    },
  };
}

function createTerminalPresenter(
  presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): TerminalTimelineProjector {
  return createTerminalTimelineProjector({ presentation });
}

function commitTerminalAssistantMessage(
  stores: TuiConversationStores,
  projection: ConversationProjectionStore,
  projector: PiTimelineProjector,
): void {
  const turn = requireTerminalTurn(projection, projector);
  const content = turn.items
    .filter((item) => item.kind === 'assistant_text')
    .map((item) => (item.kind === 'assistant_text' ? item.payload.content : ''))
    .join('');
  stores.conversation.getState().completeMessage(content);
}

function requireTerminalTurn(
  projection: ConversationProjectionStore,
  projector: PiTimelineProjector | undefined,
): ConversationTurnProjection {
  if (!projector?.terminal || !projector.identity) {
    throw new Error('TUI Pi terminal projection is not available.');
  }
  const identity = projector.identity;
  const turn = projection
    .snapshot()
    .turns.find(
      (candidate) =>
        candidate.turnId === identity.turnId &&
        candidate.runId === identity.runId &&
        candidate.messageId === `assistant-${identity.turnId}`,
    );
  if (!turn?.completion) {
    throw new Error(
      `TUI Pi terminal projection is missing for ${identity.turnId}/${identity.runId}.`,
    );
  }
  return turn;
}
