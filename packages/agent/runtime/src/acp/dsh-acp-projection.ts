import type {
  ContentBlock as AcpContentBlock,
  RequestPermissionRequest,
  SessionNotification,
} from '@agentclientprotocol/sdk';
import type {
  DshAcpContextPressureNotification,
  DshAcpContextPressureProjection,
  DshAcpSessionEventNotification,
} from '@neko/agent-contracts/dsh-acp';

export const DSH_ACP_PROJECTION_DEFAULT_MAX_EVENTS_PER_SESSION = 256;
export const DSH_ACP_PROJECTION_DEFAULT_MAX_ASSISTANT_STREAM_BYTES = 262_144;

export type DshAcpProjectedToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface DshAcpProjectedToolEvent {
  readonly kind: 'tool';
  readonly sessionId: string;
  readonly toolCallId: string;
  readonly turn: number;
  readonly turnStartedAt?: number;
  readonly status: DshAcpProjectedToolStatus;
  readonly title?: string;
  readonly rawInput?: unknown;
  readonly rawOutput?: unknown;
}

export interface DshAcpProjectedPermissionEvent {
  readonly kind: 'permission';
  readonly sessionId: string;
  readonly toolCallId: string;
  readonly turn: number;
  readonly request: RequestPermissionRequest;
}

export type DshAcpProjectedTurnEvent =
  | {
      readonly kind: 'turn';
      readonly sessionId: string;
      readonly turn: number;
      readonly phase: 'start';
      readonly startedAt: number;
    }
  | {
      readonly kind: 'turn';
      readonly sessionId: string;
      readonly turn: number;
      readonly phase: 'end';
      readonly startedAt: number;
      readonly completedAt: number;
      readonly reason?: string;
    };

export interface DshAcpProjectedCancelEvent {
  readonly kind: 'cancel';
  readonly sessionId: string;
  readonly turn?: number;
  readonly toolCallId?: string;
}

export interface DshAcpProjectedDiagnosticEvent {
  readonly kind: 'diagnostic';
  readonly sessionId: string;
  readonly code: string;
  readonly message: string;
}

export interface DshAcpProjectedCommandEvent {
  readonly kind: 'command';
  readonly sessionId: string;
  readonly commandId: string;
  readonly name: string;
  readonly args?: string;
  readonly status: 'running' | 'completed' | 'failed';
  readonly text?: string;
}

export type DshAcpProjectedUserMessageBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'resource_link'; readonly name: string; readonly uri: string };

export type DshAcpProjectedMessageEvent =
  | {
      readonly kind: 'message';
      readonly sessionId: string;
      readonly role: 'user';
      readonly content: readonly DshAcpProjectedUserMessageBlock[];
      readonly messageId?: string;
    }
  | {
      readonly kind: 'message';
      readonly sessionId: string;
      readonly role: 'assistant';
      readonly turn: number;
      readonly step: number;
      readonly text: string;
      readonly messageId: string;
      readonly state: 'streaming' | 'final';
    };

export interface DshAcpProjectedThoughtEvent {
  readonly kind: 'thought';
  readonly sessionId: string;
  readonly turn: number;
  readonly step: number;
  readonly text: string;
  readonly messageId: string;
  readonly state: 'streaming' | 'final';
}

export type DshAcpProjectedEvent =
  | DshAcpProjectedMessageEvent
  | DshAcpProjectedThoughtEvent
  | DshAcpProjectedToolEvent
  | DshAcpProjectedPermissionEvent
  | DshAcpProjectedTurnEvent
  | DshAcpProjectedCancelEvent
  | DshAcpProjectedCommandEvent
  | DshAcpProjectedDiagnosticEvent;

export interface DshAcpProjectionToolSnapshot {
  readonly toolCallId: string;
  readonly turn: number;
  readonly status: DshAcpProjectedToolStatus;
  readonly terminal: boolean;
}

export interface DshAcpProjectionOptions {
  readonly maxEventsPerSession?: number;
  readonly maxAssistantStreamBytes?: number;
}

interface AssistantAssemblyState {
  readonly turn: number;
  readonly step: number;
  readonly channel: 'text' | 'reasoning';
  readonly blocks: Map<number, string>;
  event: DshAcpProjectedMessageEvent | DshAcpProjectedThoughtEvent | undefined;
}

interface ToolProjectionState {
  readonly toolCallId: string;
  readonly turn: number;
  status: DshAcpProjectedToolStatus;
  terminal: boolean;
  title: string | undefined;
  rawInput: unknown;
  rawOutput: unknown;
  permissionRequest: RequestPermissionRequest | undefined;
}

interface CommandProjectionState {
  readonly commandId: string;
  readonly name: string;
  readonly args?: string;
  event: DshAcpProjectedCommandEvent;
}

interface SessionProjectionState {
  readonly sessionId: string;
  lastEventSequence: number | undefined;
  lastEventFrameIndex: number;
  lastEventFrameCount: number;
  lastContextPressureSequence: number | undefined;
  contextPressure: DshAcpContextPressureProjection | undefined;
  currentTurn: number | undefined;
  readonly turnStartedAt: Map<number, number>;
  readonly openSteps: Set<string>;
  readonly assistantAssemblies: Map<string, AssistantAssemblyState>;
  readonly endedTurns: Set<number>;
  readonly cancelledTurns: Set<number>;
  readonly cancelledToolKeys: Set<string>;
  readonly tools: Map<string, ToolProjectionState>;
  readonly commands: Map<string, CommandProjectionState>;
  readonly userMessages: Map<
    string,
    Extract<DshAcpProjectedMessageEvent, { readonly role: 'user' }>
  >;
  readonly events: DshAcpProjectedEvent[];
}

export class DshAcpProjection {
  private readonly sessions = new Map<string, SessionProjectionState>();
  private readonly maxEventsPerSession: number;
  private readonly maxAssistantStreamBytes: number;

  constructor(options: DshAcpProjectionOptions = {}) {
    const maxEventsPerSession =
      options.maxEventsPerSession ?? DSH_ACP_PROJECTION_DEFAULT_MAX_EVENTS_PER_SESSION;
    if (!Number.isSafeInteger(maxEventsPerSession) || maxEventsPerSession <= 0) {
      throw new Error('DSH ACP projection max events per session must be a positive integer.');
    }
    this.maxEventsPerSession = maxEventsPerSession;
    const maxAssistantStreamBytes =
      options.maxAssistantStreamBytes ?? DSH_ACP_PROJECTION_DEFAULT_MAX_ASSISTANT_STREAM_BYTES;
    if (!Number.isSafeInteger(maxAssistantStreamBytes) || maxAssistantStreamBytes <= 0) {
      throw new Error('DSH ACP assistant stream byte limit must be a positive integer.');
    }
    this.maxAssistantStreamBytes = maxAssistantStreamBytes;
  }

  acceptSessionUpdate(notification: SessionNotification): readonly DshAcpProjectedEvent[] {
    const session = this.session(notification.sessionId);
    const sequenceResult = readOpenNekoSequenceFrame(notification);
    if (sequenceResult.kind === 'invalid') {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_INVALID_SEQUENCE',
          'DSH ACP opennekoSequence must be a non-negative safe integer.',
        ),
      );
    }
    if (sequenceResult.kind === 'value') {
      const stale = this.rejectStaleSequence(session, sequenceResult.value);
      if (stale.length > 0) return stale;
    }
    const update = notification.update;
    if (update.sessionUpdate === 'user_message_chunk') {
      const block = projectUserMessageBlock(update.content);
      if (block === undefined) return [];
      const event: Extract<DshAcpProjectedMessageEvent, { readonly role: 'user' }> = {
        kind: 'message',
        sessionId: notification.sessionId,
        role: 'user',
        content: [block],
        ...(update.messageId === undefined || update.messageId === null
          ? {}
          : { messageId: update.messageId }),
      };
      if (event.messageId === undefined) return this.record(session, event);
      const existing = session.userMessages.get(event.messageId);
      if (existing === undefined) {
        const recorded = this.record(session, event);
        if (recorded[0] === event) session.userMessages.set(event.messageId, event);
        return recorded;
      }
      const replacement = { ...existing, content: [...existing.content, block] };
      const eventIndex = session.events.indexOf(existing);
      if (eventIndex < 0) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_USER_MESSAGE_MISSING',
            `DSH user message '${event.messageId}' is no longer projected.`,
          ),
        );
      }
      session.events[eventIndex] = replacement;
      session.userMessages.set(event.messageId, replacement);
      return [replacement];
    }
    if (
      update.sessionUpdate === 'agent_message_chunk' ||
      update.sessionUpdate === 'agent_thought_chunk'
    ) {
      return this.acceptAssistantChunk(session, notification);
    }
    if (update.sessionUpdate === 'tool_call') {
      return this.acceptToolCall(session, notification);
    }
    if (update.sessionUpdate === 'tool_call_update') {
      return this.acceptToolCallUpdate(session, notification);
    }
    return [];
  }

  acceptSessionEvent(
    notification: DshAcpSessionEventNotification,
  ): readonly DshAcpProjectedEvent[] {
    const session = this.session(notification.sessionId);
    const sequenceResult = readIntegerField(notification.sequence);
    if (sequenceResult.kind !== 'value') {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_INVALID_SEQUENCE',
          'DSH ACP event sequence must be a non-negative safe integer.',
        ),
      );
    }
    const stale = this.rejectStaleSequence(session, {
      sequence: sequenceResult.value,
      frameIndex: 0,
      frameCount: 1,
    });
    if (stale.length > 0) return stale;
    if (notification.type === 'turn/start') {
      const turnResult = readTurn(notification.data);
      if (turnResult.kind === 'missing' || turnResult.kind === 'invalid') {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_INVALID_TURN',
            'DSH turn/start event must contain a non-negative safe integer turn.',
          ),
        );
      }
      const turn = turnResult.value;
      if (session.endedTurns.has(turn)) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_TERMINAL_TURN',
            `DSH turn ${turn} already ended.`,
          ),
        );
      }
      return this.commit(
        session,
        {
          kind: 'turn',
          sessionId: session.sessionId,
          turn,
          phase: 'start',
          startedAt: notification.time,
        },
        () => {
          session.currentTurn = turn;
          session.turnStartedAt.set(turn, notification.time);
        },
      );
    }
    if (notification.type === 'step/start' || notification.type === 'step/end') {
      const identity = readTurnStep(notification.data);
      if (identity.kind !== 'value') {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_INVALID_STEP',
            `DSH ${notification.type} event must contain non-negative safe integer turn and step identities.`,
          ),
        );
      }
      const key = stepKey(identity.turn, identity.step);
      if (notification.type === 'step/start') {
        if (session.currentTurn !== identity.turn || session.openSteps.has(key)) {
          return this.record(
            session,
            diagnostic(
              session.sessionId,
              'ACP_PROJECTION_INVALID_STEP',
              `DSH step ${identity.turn}:${identity.step} cannot start in the current projection state.`,
            ),
          );
        }
        session.openSteps.add(key);
        return [];
      }
      if (!session.openSteps.delete(key)) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_INVALID_STEP',
            `DSH step ${identity.turn}:${identity.step} ended without a matching start.`,
          ),
        );
      }
      return [];
    }
    if (notification.type === 'turn/end') {
      const turnResult = readTurn(notification.data);
      if (turnResult.kind === 'missing' || turnResult.kind === 'invalid') {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_INVALID_TURN',
            'DSH turn/end event must contain a non-negative safe integer turn.',
          ),
        );
      }
      const turn = turnResult.value;
      if (session.endedTurns.has(turn)) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_TERMINAL_TURN',
            `DSH turn ${turn} already ended.`,
          ),
        );
      }
      const startedAt = session.turnStartedAt.get(turn);
      if (startedAt === undefined) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_MISSING_TURN_START',
            `DSH turn ${turn} ended without a matching turn/start event.`,
          ),
        );
      }
      if (notification.time < startedAt) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_INVALID_TURN_TIME',
            `DSH turn ${turn} ended before it started.`,
          ),
        );
      }
      const unsettledAssemblies = [...session.assistantAssemblies.entries()].filter(([key]) =>
        key.startsWith(`${turn}:`),
      );
      for (const [key, assembly] of unsettledAssemblies) {
        session.assistantAssemblies.delete(key);
        this.removeAssistantAssemblyEvent(session, assembly);
      }
      const completed = this.commit(
        session,
        {
          kind: 'turn',
          sessionId: session.sessionId,
          turn,
          phase: 'end',
          startedAt,
          completedAt: notification.time,
          reason: readTurnEndReason(notification.data),
        },
        () => {
          session.endedTurns.add(turn);
          if (session.currentTurn === turn) session.currentTurn = undefined;
        },
      );
      if (completed[0]?.kind === 'diagnostic' || unsettledAssemblies.length === 0) return completed;
      return [
        ...completed,
        ...this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_UNSETTLED_ASSISTANT_STREAM',
            `DSH turn ${turn} ended with ${unsettledAssemblies.length} assistant stream channel(s) missing a final message.`,
          ),
        ),
      ];
    }
    if (notification.type === 'command/run') {
      const command = readCommandRun(notification.data);
      if (command.kind === 'invalid') {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_INVALID_COMMAND',
            'DSH command/run must contain exact commandId, name, and optional args.',
          ),
        );
      }
      if (session.commands.has(command.commandId)) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_DUPLICATE_COMMAND',
            `DSH command ${command.commandId} already exists.`,
          ),
        );
      }
      const event: DshAcpProjectedCommandEvent = {
        kind: 'command',
        sessionId: session.sessionId,
        commandId: command.commandId,
        name: command.name,
        ...(command.args === undefined ? {} : { args: command.args }),
        status: 'running',
      };
      return this.commit(session, event, () => {
        session.commands.set(command.commandId, {
          commandId: command.commandId,
          name: command.name,
          ...(command.args === undefined ? {} : { args: command.args }),
          event,
        });
      });
    }
    if (notification.type === 'command/done') {
      const command = readCommandDone(notification.data);
      if (command.kind === 'invalid') {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_INVALID_COMMAND',
            'DSH command/done must contain exact commandId, outcome, and optional text.',
          ),
        );
      }
      const current = session.commands.get(command.commandId);
      if (current === undefined) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_UNKNOWN_COMMAND',
            `DSH command ${command.commandId} completed without command/run.`,
          ),
        );
      }
      const index = session.events.indexOf(current.event);
      if (index < 0) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_COMMAND_EVENT_LOST',
            `DSH command ${command.commandId} lost its projected running event.`,
          ),
        );
      }
      const event: DshAcpProjectedCommandEvent = {
        kind: 'command',
        sessionId: session.sessionId,
        commandId: current.commandId,
        name: current.name,
        ...(current.args === undefined ? {} : { args: current.args }),
        status: command.outcome === 'success' ? 'completed' : 'failed',
        ...(command.text === undefined ? {} : { text: command.text }),
      };
      session.events[index] = event;
      session.commands.delete(command.commandId);
      return [event];
    }
    return [];
  }

  acceptContextPressure(
    notification: DshAcpContextPressureNotification,
  ): readonly DshAcpProjectedEvent[] {
    const session = this.session(notification.sessionId);
    const lastSequence = session.lastContextPressureSequence;
    if (lastSequence !== undefined && notification.sourceSequence < lastSequence) {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_STALE_CONTEXT_PRESSURE',
          `DSH context pressure sequence ${notification.sourceSequence} is older than ${lastSequence}.`,
        ),
      );
    }
    if (lastSequence === notification.sourceSequence) {
      if (sameContextPressure(session.contextPressure, notification.pressure)) return [];
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_CONFLICTING_CONTEXT_PRESSURE',
          `DSH context pressure sequence ${notification.sourceSequence} changed without a newer source event.`,
        ),
      );
    }
    session.lastContextPressureSequence = notification.sourceSequence;
    session.contextPressure = Object.freeze({ ...notification.pressure });
    return [];
  }

  acceptPermission(request: RequestPermissionRequest): readonly DshAcpProjectedEvent[] {
    const session = this.session(request.sessionId);
    const toolCallId = request.toolCall.toolCallId;
    const requestedTurn = readOpenNekoPermissionTurn(request);
    if (requestedTurn.kind === 'invalid') {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_INVALID_TURN',
          'DSH ACP permission opennekoTurn must be a non-negative safe integer.',
        ),
      );
    }
    let turn: number;
    if (requestedTurn.kind === 'value') {
      turn = requestedTurn.value;
    } else {
      const matches = [...session.tools.values()].filter(
        (candidate) => candidate.toolCallId === toolCallId,
      );
      if (matches.length === 0) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_UNKNOWN_TOOL',
            `Permission for ${toolCallId} has no known tool turn.`,
          ),
        );
      }
      if (matches.length > 1) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_AMBIGUOUS_TOOL_TURN',
            `Permission for ${toolCallId} is ambiguous across turns.`,
          ),
        );
      }
      const unique = matches[0];
      if (unique === undefined) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_UNKNOWN_TOOL',
            `Permission for ${toolCallId} has no known tool turn.`,
          ),
        );
      }
      turn = unique.turn;
    }
    const key = toolKey(turn, toolCallId);
    const existing = session.tools.get(key);
    const tool: ToolProjectionState = existing ?? {
      toolCallId,
      turn,
      status: 'pending',
      terminal: false,
      title: request.toolCall.title ?? undefined,
      rawInput: request.toolCall.rawInput,
      rawOutput: undefined,
      permissionRequest: request,
    };
    return this.commit(
      session,
      {
        kind: 'permission',
        sessionId: session.sessionId,
        toolCallId,
        turn,
        request,
      },
      () => {
        tool.permissionRequest = request;
        session.tools.set(key, tool);
      },
    );
  }

  cancel(input: {
    readonly sessionId: string;
    readonly turn?: number;
    readonly toolCallId?: string;
  }): readonly DshAcpProjectedEvent[] {
    const session = this.session(input.sessionId);
    if (input.toolCallId !== undefined && input.turn === undefined) {
      const matches = [...session.tools.values()].filter(
        (candidate) => candidate.toolCallId === input.toolCallId,
      );
      if (matches.length !== 1) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_AMBIGUOUS_CANCEL',
            `Cancel for ${input.toolCallId} cannot be resolved to exactly one turn.`,
          ),
        );
      }
      const unique = matches[0];
      if (unique === undefined) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_AMBIGUOUS_CANCEL',
            `Cancel for ${input.toolCallId} cannot be resolved to exactly one turn.`,
          ),
        );
      }
      input = { ...input, turn: unique.turn };
    }
    const event: DshAcpProjectedCancelEvent = {
      kind: 'cancel',
      sessionId: session.sessionId,
      ...(input.turn === undefined ? {} : { turn: input.turn }),
      ...(input.toolCallId === undefined ? {} : { toolCallId: input.toolCallId }),
    };
    return this.commit(session, event, () => {
      if (input.turn !== undefined) session.cancelledTurns.add(input.turn);
      if (input.turn !== undefined && input.toolCallId !== undefined) {
        session.cancelledToolKeys.add(toolKey(input.turn, input.toolCallId));
      }
    });
  }

  drain(sessionId: string): readonly DshAcpProjectedEvent[] {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return [];
    const events = [...session.events];
    session.events.length = 0;
    return events;
  }

  reset(): void {
    this.sessions.clear();
  }

  hasActiveTurn(): boolean {
    return [...this.sessions.values()].some((session) => session.currentTurn !== undefined);
  }

  snapshot(sessionId: string): DshAcpProjectionSnapshot {
    const session = this.session(sessionId);
    return {
      sessionId,
      currentTurn: session.currentTurn,
      contextPressure: session.contextPressure,
      events: [...session.events],
      tools: [...session.tools.values()].map((tool) => ({
        toolCallId: tool.toolCallId,
        turn: tool.turn,
        status: tool.status,
        terminal: tool.terminal,
      })),
    };
  }

  private acceptToolCall(
    session: SessionProjectionState,
    notification: SessionNotification,
  ): readonly DshAcpProjectedEvent[] {
    if (notification.update.sessionUpdate !== 'tool_call') return [];
    const update = notification.update;
    const turnResult = readOpenNekoTurn(notification);
    if (turnResult.kind === 'invalid') {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_INVALID_TURN',
          `Tool call ${update.toolCallId} has an invalid opennekoTurn.`,
        ),
      );
    }
    if (turnResult.kind === 'missing') {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_MISSING_TURN',
          `Tool call ${update.toolCallId} has no exact turn.`,
        ),
      );
    }
    const turn = turnResult.value;
    if (session.endedTurns.has(turn)) {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_TERMINAL_TURN',
          `Tool call ${update.toolCallId} arrived after turn ${turn} ended.`,
        ),
      );
    }
    const turnStartedAt = session.turnStartedAt.get(turn);
    const key = toolKey(turn, update.toolCallId);
    const existing = session.tools.get(key);
    if (existing !== undefined) {
      if (existing.terminal) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_DUPLICATE_TOOL',
            `Tool call ${update.toolCallId} in turn ${turn} is already terminal.`,
          ),
        );
      }
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_DUPLICATE_TOOL',
          `Tool call ${update.toolCallId} in turn ${turn} was already projected.`,
        ),
      );
    }
    const tool: ToolProjectionState = {
      toolCallId: update.toolCallId,
      turn,
      status: update.status ?? 'pending',
      terminal: false,
      title: update.title,
      rawInput: update.rawInput,
      rawOutput: undefined,
      permissionRequest: undefined,
    };
    return this.commit(
      session,
      {
        kind: 'tool',
        sessionId: session.sessionId,
        toolCallId: tool.toolCallId,
        turn,
        ...(turnStartedAt === undefined ? {} : { turnStartedAt }),
        status: tool.status,
        title: tool.title,
        rawInput: tool.rawInput,
      },
      () => {
        session.tools.set(key, tool);
      },
    );
  }

  private acceptAssistantChunk(
    session: SessionProjectionState,
    notification: SessionNotification,
  ): readonly DshAcpProjectedEvent[] {
    const update = notification.update;
    if (
      update.sessionUpdate !== 'agent_message_chunk' &&
      update.sessionUpdate !== 'agent_thought_chunk'
    ) {
      return [];
    }
    if (update.content.type !== 'text') {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_INVALID_ASSISTANT_CHUNK',
          'DSH assistant output must use ACP text chunks.',
        ),
      );
    }
    const identity = readAssistantChunkIdentity(notification);
    if (identity.kind !== 'value') {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_INVALID_ASSISTANT_CHUNK',
          'DSH assistant chunk must identify its exact turn, step, phase and block.',
        ),
      );
    }
    if (
      session.currentTurn !== identity.turn ||
      !session.openSteps.has(stepKey(identity.turn, identity.step))
    ) {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_UNKNOWN_ASSISTANT_STEP',
          `DSH assistant chunk targets inactive step ${identity.turn}:${identity.step}.`,
        ),
      );
    }
    const channel =
      update.sessionUpdate === 'agent_message_chunk' ? ('text' as const) : ('reasoning' as const);
    const key = assistantAssemblyKey(identity.turn, identity.step, channel);
    if (identity.phase === 'final') {
      if (
        update.messageId === undefined ||
        update.messageId === null ||
        update.messageId.length === 0
      ) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_INVALID_ASSISTANT_CHUNK',
            'DSH final assistant message must provide its stable message identity.',
          ),
        );
      }
      return this.settleAssistantAssembly(
        session,
        key,
        identity.turn,
        identity.step,
        channel,
        update.messageId,
        update.content.text,
      );
    }
    if (identity.blockIndex === undefined || update.content.text.length === 0) {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_INVALID_ASSISTANT_CHUNK',
          'DSH assistant delta must contain a non-empty text block with an exact block index.',
        ),
      );
    }
    let assembly = session.assistantAssemblies.get(key);
    if (assembly === undefined) {
      assembly = {
        turn: identity.turn,
        step: identity.step,
        channel,
        blocks: new Map(),
        event: undefined,
      };
      session.assistantAssemblies.set(key, assembly);
    }
    assembly.blocks.set(
      identity.blockIndex,
      (assembly.blocks.get(identity.blockIndex) ?? '') + update.content.text,
    );
    const text = assembleAssistantBlocks(assembly.blocks);
    if (new TextEncoder().encode(text).length > this.maxAssistantStreamBytes) {
      session.assistantAssemblies.delete(key);
      this.removeAssistantAssemblyEvent(session, assembly);
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_ASSISTANT_STREAM_OVERFLOW',
          `DSH assistant stream ${identity.turn}:${identity.step}:${channel} exceeded ${this.maxAssistantStreamBytes} bytes.`,
        ),
      );
    }
    const messageId =
      update.messageId === undefined || update.messageId === null
        ? `dsh:${identity.turn}:${identity.step}:${channel}`
        : update.messageId;
    const event = assistantEvent(
      session.sessionId,
      identity.turn,
      identity.step,
      channel,
      messageId,
      text,
      'streaming',
    );
    return this.replaceOrRecordAssistantEvent(session, assembly, event);
  }

  private settleAssistantAssembly(
    session: SessionProjectionState,
    key: string,
    turn: number,
    step: number,
    channel: 'text' | 'reasoning',
    messageId: string,
    text: string,
  ): readonly DshAcpProjectedEvent[] {
    const assembly = session.assistantAssemblies.get(key);
    session.assistantAssemblies.delete(key);
    if (text.length === 0) {
      if (assembly !== undefined) this.removeAssistantAssemblyEvent(session, assembly);
      return [];
    }
    if (new TextEncoder().encode(text).length > this.maxAssistantStreamBytes) {
      if (assembly !== undefined) this.removeAssistantAssemblyEvent(session, assembly);
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_ASSISTANT_STREAM_OVERFLOW',
          `DSH final assistant message ${turn}:${step}:${channel} exceeded ${this.maxAssistantStreamBytes} bytes.`,
        ),
      );
    }
    const event = assistantEvent(session.sessionId, turn, step, channel, messageId, text, 'final');
    if (assembly === undefined) return this.record(session, event);
    return this.replaceOrRecordAssistantEvent(session, assembly, event);
  }

  private replaceOrRecordAssistantEvent(
    session: SessionProjectionState,
    assembly: AssistantAssemblyState,
    event: DshAcpProjectedMessageEvent | DshAcpProjectedThoughtEvent,
  ): readonly DshAcpProjectedEvent[] {
    if (assembly.event === undefined) {
      const recorded = this.record(session, event);
      if (recorded[0] === event) assembly.event = event;
      return recorded;
    }
    const index = session.events.indexOf(assembly.event);
    if (index < 0) {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_ASSISTANT_ASSEMBLY_LOST',
          `DSH assistant assembly ${assembly.turn}:${assembly.step}:${assembly.channel} lost its projected event.`,
        ),
      );
    }
    session.events[index] = event;
    assembly.event = event;
    return [event];
  }

  private removeAssistantAssemblyEvent(
    session: SessionProjectionState,
    assembly: AssistantAssemblyState,
  ): void {
    if (assembly.event === undefined) return;
    const index = session.events.indexOf(assembly.event);
    if (index >= 0) session.events.splice(index, 1);
    assembly.event = undefined;
  }

  private acceptToolCallUpdate(
    session: SessionProjectionState,
    notification: SessionNotification,
  ): readonly DshAcpProjectedEvent[] {
    if (notification.update.sessionUpdate !== 'tool_call_update') return [];
    const update = notification.update;
    const turnResult = readOpenNekoTurn(notification);
    if (turnResult.kind === 'invalid') {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_INVALID_TURN',
          `Tool update ${update.toolCallId} has an invalid opennekoTurn.`,
        ),
      );
    }
    if (turnResult.kind === 'missing') {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_MISSING_TURN',
          `Tool update ${update.toolCallId} must carry an exact opennekoTurn.`,
        ),
      );
    }
    const requestedTurn = turnResult.value;
    const key = toolKey(requestedTurn, update.toolCallId);
    const tool = session.tools.get(key);
    if (tool === undefined) {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_UNKNOWN_TOOL',
          `Tool update ${update.toolCallId} has no projected tool call for turn ${requestedTurn}.`,
        ),
      );
    }
    if (tool.terminal) {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_TERMINAL_TOOL',
          `Tool update ${update.toolCallId} arrived after the tool was terminal.`,
        ),
      );
    }
    const status = update.status ?? tool.status;
    const terminal = status === 'completed' || status === 'failed';
    const cancelled =
      session.cancelledTurns.has(tool.turn) ||
      session.cancelledToolKeys.has(toolKey(tool.turn, tool.toolCallId));
    if (cancelled && !terminal) {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_UPDATE_AFTER_CANCEL',
          `Tool update ${update.toolCallId} is not a final update after cancellation.`,
        ),
      );
    }
    if (session.endedTurns.has(tool.turn) && !cancelled) {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_TERMINAL_TURN',
          `Tool update ${update.toolCallId} arrived after turn ${tool.turn} ended.`,
        ),
      );
    }
    const turnStartedAt = session.turnStartedAt.get(tool.turn);
    return this.commit(
      session,
      {
        kind: 'tool',
        sessionId: session.sessionId,
        toolCallId: tool.toolCallId,
        turn: tool.turn,
        ...(turnStartedAt === undefined ? {} : { turnStartedAt }),
        status,
        title: tool.title,
        rawInput: tool.rawInput,
        rawOutput: update.rawOutput,
      },
      () => {
        tool.status = status;
        tool.terminal = terminal;
        if (update.title !== undefined && update.title !== null) tool.title = update.title;
        if (update.rawInput !== undefined) tool.rawInput = update.rawInput;
        if (update.rawOutput !== undefined) tool.rawOutput = update.rawOutput;
        session.tools.set(key, tool);
      },
    );
  }

  private session(sessionId: string): SessionProjectionState {
    let session = this.sessions.get(sessionId);
    if (session === undefined) {
      session = {
        sessionId,
        lastEventSequence: undefined,
        lastEventFrameIndex: -1,
        lastEventFrameCount: 1,
        lastContextPressureSequence: undefined,
        contextPressure: undefined,
        currentTurn: undefined,
        turnStartedAt: new Map(),
        openSteps: new Set(),
        assistantAssemblies: new Map(),
        endedTurns: new Set(),
        cancelledTurns: new Set(),
        cancelledToolKeys: new Set(),
        tools: new Map(),
        commands: new Map(),
        userMessages: new Map(),
        events: [],
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  private rejectStaleSequence(
    session: SessionProjectionState,
    frame: SequenceFrame,
  ): readonly DshAcpProjectedEvent[] {
    const sequence = frame.sequence;
    if (session.lastEventSequence !== undefined && sequence < session.lastEventSequence) {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_STALE_SEQUENCE',
          `DSH event sequence ${sequence} is not newer than ${session.lastEventSequence}.`,
        ),
      );
    }
    if (session.lastEventSequence === sequence) {
      if (
        frame.frameCount !== session.lastEventFrameCount ||
        frame.frameIndex !== session.lastEventFrameIndex + 1
      ) {
        return this.record(
          session,
          diagnostic(
            session.sessionId,
            'ACP_PROJECTION_STALE_SEQUENCE',
            `DSH event sequence ${sequence} frame ${frame.frameIndex} does not follow frame ${session.lastEventFrameIndex}.`,
          ),
        );
      }
      session.lastEventFrameIndex = frame.frameIndex;
      return [];
    }
    if (frame.frameIndex !== 0) {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_INVALID_SEQUENCE',
          `DSH event sequence ${sequence} must start at frame 0.`,
        ),
      );
    }
    session.lastEventSequence = sequence;
    session.lastEventFrameIndex = frame.frameIndex;
    session.lastEventFrameCount = frame.frameCount;
    return [];
  }

  private record(
    session: SessionProjectionState,
    event: DshAcpProjectedEvent,
  ): readonly DshAcpProjectedEvent[] {
    if (session.events.length >= this.maxEventsPerSession) {
      return [
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_OVERFLOW',
          `Session ${session.sessionId} exceeded ${this.maxEventsPerSession} projected events.`,
        ),
      ];
    }
    session.events.push(event);
    return [event];
  }

  private commit(
    session: SessionProjectionState,
    event: DshAcpProjectedEvent,
    mutate: () => void,
  ): readonly DshAcpProjectedEvent[] {
    const recorded = this.record(session, event);
    if (recorded.length === 1 && recorded[0]?.kind === 'diagnostic') {
      return recorded;
    }
    mutate();
    return recorded;
  }
}

export interface DshAcpProjectionSnapshot {
  readonly sessionId: string;
  readonly currentTurn: number | undefined;
  readonly contextPressure: DshAcpContextPressureProjection | undefined;
  readonly events: readonly DshAcpProjectedEvent[];
  readonly tools: readonly DshAcpProjectionToolSnapshot[];
}

function sameContextPressure(
  left: DshAcpContextPressureProjection | undefined,
  right: DshAcpContextPressureProjection,
): boolean {
  return (
    left !== undefined &&
    left.pressureTokens === right.pressureTokens &&
    left.projectedTokens === right.projectedTokens &&
    left.contextWindow === right.contextWindow
  );
}

type IntegerFieldResult =
  | { readonly kind: 'missing' }
  | { readonly kind: 'value'; readonly value: number }
  | { readonly kind: 'invalid' };

interface SequenceFrame {
  readonly sequence: number;
  readonly frameIndex: number;
  readonly frameCount: number;
}

type SequenceFrameResult =
  | { readonly kind: 'missing' }
  | { readonly kind: 'value'; readonly value: SequenceFrame }
  | { readonly kind: 'invalid' };

type AssistantChunkIdentityResult =
  | {
      readonly kind: 'value';
      readonly turn: number;
      readonly step: number;
      readonly phase: 'delta' | 'final';
      readonly blockIndex?: number;
    }
  | { readonly kind: 'invalid' };

type TurnStepResult =
  | { readonly kind: 'value'; readonly turn: number; readonly step: number }
  | { readonly kind: 'invalid' };

type CommandRunResult =
  | {
      readonly kind: 'value';
      readonly commandId: string;
      readonly name: string;
      readonly args?: string;
    }
  | { readonly kind: 'invalid' };

type CommandDoneResult =
  | {
      readonly kind: 'value';
      readonly commandId: string;
      readonly outcome: 'success' | 'error';
      readonly text?: string;
    }
  | { readonly kind: 'invalid' };

function readIntegerField(value: unknown): IntegerFieldResult {
  if (value === undefined) return { kind: 'missing' };
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return { kind: 'invalid' };
  }
  return { kind: 'value', value };
}

function projectUserMessageBlock(
  block: AcpContentBlock,
): DshAcpProjectedUserMessageBlock | undefined {
  if (block.type === 'text') {
    return block.text.length === 0 ? undefined : { type: 'text', text: block.text };
  }
  if (block.type === 'resource_link') {
    return block.name.length === 0 || block.uri.length === 0
      ? undefined
      : { type: 'resource_link', name: block.name, uri: block.uri };
  }
  return undefined;
}

function readOpenNekoSequenceFrame(notification: SessionNotification): SequenceFrameResult {
  const meta = notification._meta;
  if (meta === undefined || meta === null) return { kind: 'missing' };
  const sequence = readIntegerField(meta.opennekoSequence);
  if (sequence.kind !== 'value') return sequence;
  const rawFrameIndex = meta.opennekoFrameIndex;
  const rawFrameCount = meta.opennekoFrameCount;
  if (rawFrameIndex === undefined && rawFrameCount === undefined) {
    return {
      kind: 'value',
      value: { sequence: sequence.value, frameIndex: 0, frameCount: 1 },
    };
  }
  const frameIndex = readIntegerField(rawFrameIndex);
  const frameCount = readIntegerField(rawFrameCount);
  if (
    frameIndex.kind !== 'value' ||
    frameCount.kind !== 'value' ||
    frameCount.value === 0 ||
    frameIndex.value >= frameCount.value
  ) {
    return { kind: 'invalid' };
  }
  return {
    kind: 'value',
    value: {
      sequence: sequence.value,
      frameIndex: frameIndex.value,
      frameCount: frameCount.value,
    },
  };
}

function readOpenNekoTurn(notification: SessionNotification): IntegerFieldResult {
  const meta = notification._meta;
  return readIntegerField(meta === undefined || meta === null ? undefined : meta.opennekoTurn);
}

function readOpenNekoPermissionTurn(request: RequestPermissionRequest): IntegerFieldResult {
  const meta = request._meta;
  return readIntegerField(meta === undefined || meta === null ? undefined : meta.opennekoTurn);
}

function readTurn(data: unknown): IntegerFieldResult {
  if (data === null || typeof data !== 'object') return { kind: 'missing' };
  return readIntegerField((data as { readonly turn?: unknown }).turn);
}

function readTurnStep(data: unknown): TurnStepResult {
  if (data === null || typeof data !== 'object') return { kind: 'invalid' };
  const record = data as { readonly turn?: unknown; readonly step?: unknown };
  const turn = readIntegerField(record.turn);
  const step = readIntegerField(record.step);
  return turn.kind === 'value' && step.kind === 'value'
    ? { kind: 'value', turn: turn.value, step: step.value }
    : { kind: 'invalid' };
}

function readCommandRun(data: unknown): CommandRunResult {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { kind: 'invalid' };
  }
  const record = data as Record<string, unknown>;
  const commandId = readNonEmptyString(record.commandId);
  const name = readNonEmptyString(record.name);
  const args = record.args === undefined ? undefined : readString(record.args);
  const source = record.source;
  if (
    !hasOnlyKeys(record, ['commandId', 'name', 'args', 'source']) ||
    commandId === undefined ||
    name === undefined ||
    (record.args !== undefined && args === undefined) ||
    source === null ||
    typeof source !== 'object' ||
    Array.isArray(source) ||
    !hasOnlyKeys(source as Record<string, unknown>, ['kind']) ||
    (source as Record<string, unknown>).kind !== 'user'
  ) {
    return { kind: 'invalid' };
  }
  return {
    kind: 'value',
    commandId,
    name,
    ...(args === undefined ? {} : { args }),
  };
}

function readCommandDone(data: unknown): CommandDoneResult {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { kind: 'invalid' };
  }
  const record = data as Record<string, unknown>;
  const commandId = readNonEmptyString(record.commandId);
  const outcome = record.kind;
  const text = record.text === undefined ? undefined : readString(record.text);
  const sourceEventSeq = readIntegerField(record.sourceEventSeq);
  if (
    !hasOnlyKeys(record, ['commandId', 'kind', 'text', 'sourceEventSeq']) ||
    commandId === undefined ||
    (outcome !== 'success' && outcome !== 'error') ||
    (record.text !== undefined && text === undefined) ||
    (record.sourceEventSeq !== undefined && sourceEventSeq.kind !== 'value')
  ) {
    return { kind: 'invalid' };
  }
  return {
    kind: 'value',
    commandId,
    outcome,
    ...(text === undefined ? {} : { text }),
  };
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readAssistantChunkIdentity(
  notification: SessionNotification,
): AssistantChunkIdentityResult {
  const meta = notification._meta;
  if (meta === undefined || meta === null) return { kind: 'invalid' };
  const turn = readIntegerField(meta.opennekoTurn);
  const step = readIntegerField(meta.opennekoStep);
  const sequence = readIntegerField(meta.opennekoSequence);
  const phase = meta.opennekoMessagePhase;
  if (
    turn.kind !== 'value' ||
    step.kind !== 'value' ||
    sequence.kind !== 'value' ||
    (phase !== 'delta' && phase !== 'final')
  ) {
    return { kind: 'invalid' };
  }
  if (phase === 'final') {
    if (meta.opennekoBlockIndex !== undefined) return { kind: 'invalid' };
    return { kind: 'value', turn: turn.value, step: step.value, phase };
  }
  const blockIndex = readIntegerField(meta.opennekoBlockIndex);
  if (blockIndex.kind !== 'value') return { kind: 'invalid' };
  return {
    kind: 'value',
    turn: turn.value,
    step: step.value,
    phase,
    blockIndex: blockIndex.value,
  };
}

function readTurnEndReason(data: unknown): string | undefined {
  if (data === null || typeof data !== 'object') return undefined;
  const reason = (data as { readonly reason?: unknown }).reason;
  if (reason === null || typeof reason !== 'object') return undefined;
  const kind = (reason as { readonly kind?: unknown }).kind;
  return typeof kind === 'string' ? kind : undefined;
}

function toolKey(turn: number, toolCallId: string): string {
  return `${turn}\u0000${toolCallId}`;
}

function stepKey(turn: number, step: number): string {
  return `${turn}:${step}`;
}

function assistantAssemblyKey(turn: number, step: number, channel: 'text' | 'reasoning'): string {
  return `${turn}:${step}:${channel}`;
}

function assembleAssistantBlocks(blocks: ReadonlyMap<number, string>): string {
  return [...blocks.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, text]) => text)
    .join('');
}

function assistantEvent(
  sessionId: string,
  turn: number,
  step: number,
  channel: 'text' | 'reasoning',
  messageId: string,
  text: string,
  state: 'streaming' | 'final',
): DshAcpProjectedMessageEvent | DshAcpProjectedThoughtEvent {
  return channel === 'text'
    ? { kind: 'message', sessionId, role: 'assistant', turn, step, text, messageId, state }
    : { kind: 'thought', sessionId, turn, step, text, messageId, state };
}

function diagnostic(
  sessionId: string,
  code: string,
  message: string,
): DshAcpProjectedDiagnosticEvent {
  return { kind: 'diagnostic', sessionId, code, message };
}
