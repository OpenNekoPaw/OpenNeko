import type { RequestPermissionRequest, SessionNotification } from '@agentclientprotocol/sdk';
import type { DshAcpSessionEventNotification } from '@neko/agent-contracts/dsh-acp';

export const DSH_ACP_PROJECTION_DEFAULT_MAX_EVENTS_PER_SESSION = 256;

export type DshAcpProjectedToolStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface DshAcpProjectedToolEvent {
  readonly kind: 'tool';
  readonly sessionId: string;
  readonly toolCallId: string;
  readonly turn: number;
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

export interface DshAcpProjectedTurnEvent {
  readonly kind: 'turn';
  readonly sessionId: string;
  readonly turn: number;
  readonly phase: 'start' | 'end';
  readonly reason?: string;
}

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

export interface DshAcpProjectedMessageEvent {
  readonly kind: 'message';
  readonly sessionId: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly messageId?: string;
}

export type DshAcpProjectedEvent =
  | DshAcpProjectedMessageEvent
  | DshAcpProjectedToolEvent
  | DshAcpProjectedPermissionEvent
  | DshAcpProjectedTurnEvent
  | DshAcpProjectedCancelEvent
  | DshAcpProjectedDiagnosticEvent;

export interface DshAcpProjectionToolSnapshot {
  readonly toolCallId: string;
  readonly turn: number;
  readonly status: DshAcpProjectedToolStatus;
  readonly terminal: boolean;
}

export interface DshAcpProjectionOptions {
  readonly maxEventsPerSession?: number;
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

interface SessionProjectionState {
  readonly sessionId: string;
  lastEventSequence: number | undefined;
  currentTurn: number | undefined;
  readonly endedTurns: Set<number>;
  readonly cancelledTurns: Set<number>;
  readonly cancelledToolKeys: Set<string>;
  readonly tools: Map<string, ToolProjectionState>;
  readonly events: DshAcpProjectedEvent[];
}

export class DshAcpProjection {
  private readonly sessions = new Map<string, SessionProjectionState>();
  private readonly maxEventsPerSession: number;

  constructor(options: DshAcpProjectionOptions = {}) {
    const maxEventsPerSession =
      options.maxEventsPerSession ?? DSH_ACP_PROJECTION_DEFAULT_MAX_EVENTS_PER_SESSION;
    if (!Number.isSafeInteger(maxEventsPerSession) || maxEventsPerSession <= 0) {
      throw new Error('DSH ACP projection max events per session must be a positive integer.');
    }
    this.maxEventsPerSession = maxEventsPerSession;
  }

  acceptSessionUpdate(notification: SessionNotification): readonly DshAcpProjectedEvent[] {
    const session = this.session(notification.sessionId);
    const sequenceResult = readOpenNekoSequence(notification);
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
    if (
      update.sessionUpdate === 'user_message_chunk' ||
      update.sessionUpdate === 'agent_message_chunk'
    ) {
      if (update.content.type !== 'text' || update.content.text.length === 0) return [];
      return this.record(session, {
        kind: 'message',
        sessionId: notification.sessionId,
        role: update.sessionUpdate === 'user_message_chunk' ? 'user' : 'assistant',
        text: update.content.text,
        ...(update.messageId === undefined || update.messageId === null
          ? {}
          : { messageId: update.messageId }),
      });
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
    const stale = this.rejectStaleSequence(session, sequenceResult.value);
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
        },
        () => {
          session.currentTurn = turn;
        },
      );
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
      return this.commit(
        session,
        {
          kind: 'turn',
          sessionId: session.sessionId,
          turn,
          phase: 'end',
          reason: readTurnEndReason(notification.data),
        },
        () => {
          session.endedTurns.add(turn);
          if (session.currentTurn === turn) session.currentTurn = undefined;
        },
      );
    }
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

  snapshot(sessionId: string): DshAcpProjectionSnapshot {
    const session = this.session(sessionId);
    return {
      sessionId,
      currentTurn: session.currentTurn,
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
        status: tool.status,
        title: tool.title,
        rawInput: tool.rawInput,
      },
      () => {
        session.tools.set(key, tool);
      },
    );
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
    return this.commit(
      session,
      {
        kind: 'tool',
        sessionId: session.sessionId,
        toolCallId: tool.toolCallId,
        turn: tool.turn,
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
        currentTurn: undefined,
        endedTurns: new Set(),
        cancelledTurns: new Set(),
        cancelledToolKeys: new Set(),
        tools: new Map(),
        events: [],
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  private rejectStaleSequence(
    session: SessionProjectionState,
    sequence: number,
  ): readonly DshAcpProjectedEvent[] {
    if (session.lastEventSequence !== undefined && sequence <= session.lastEventSequence) {
      return this.record(
        session,
        diagnostic(
          session.sessionId,
          'ACP_PROJECTION_STALE_SEQUENCE',
          `DSH event sequence ${sequence} is not newer than ${session.lastEventSequence}.`,
        ),
      );
    }
    session.lastEventSequence = sequence;
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
  readonly events: readonly DshAcpProjectedEvent[];
  readonly tools: readonly DshAcpProjectionToolSnapshot[];
}

type IntegerFieldResult =
  | { readonly kind: 'missing' }
  | { readonly kind: 'value'; readonly value: number }
  | { readonly kind: 'invalid' };

function readIntegerField(value: unknown): IntegerFieldResult {
  if (value === undefined) return { kind: 'missing' };
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return { kind: 'invalid' };
  }
  return { kind: 'value', value };
}

function readOpenNekoSequence(notification: SessionNotification): IntegerFieldResult {
  const meta = notification._meta;
  return readIntegerField(meta === undefined || meta === null ? undefined : meta.opennekoSequence);
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

function diagnostic(
  sessionId: string,
  code: string,
  message: string,
): DshAcpProjectedDiagnosticEvent {
  return { kind: 'diagnostic', sessionId, code, message };
}
