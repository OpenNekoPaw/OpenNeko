import type { RequestPermissionRequest, SessionNotification } from '@agentclientprotocol/sdk';
import { describe, expect, it } from 'vitest';

import type { DshAcpSessionEventNotification } from '@neko/agent-contracts/dsh-acp';

import { DshAcpProjection } from './dsh-acp-projection';

describe('DshAcpProjection', () => {
  it('projects bounded user and assistant text through the same Session snapshot', () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionUpdate(messageChunk('s1', 'user_message_chunk', 'hello', 0, 'u1'));
    projection.acceptSessionUpdate(messageChunk('s1', 'agent_message_chunk', 'hi', 1, 'a1'));

    expect(projection.snapshot('s1').events).toEqual([
      {
        kind: 'message',
        sessionId: 's1',
        role: 'user',
        text: 'hello',
        messageId: 'u1',
      },
      {
        kind: 'message',
        sessionId: 's1',
        role: 'assistant',
        text: 'hi',
        messageId: 'a1',
      },
    ]);
  });

  it('projects tool call progress with exact turn and sequence', () => {
    const projection = new DshAcpProjection();
    const events = [
      ...projection.acceptSessionEvent(turnEvent('s1', 0, 'turn/start', 0)),
      ...projection.acceptSessionUpdate(
        toolCall('s1', 'call-1', 0, 1, { status: 'pending', rawInput: { prompt: 'x' } }),
      ),
      ...projection.acceptSessionUpdate(
        toolCallUpdate('s1', 'call-1', 0, 2, { status: 'completed', rawOutput: { ok: true } }),
      ),
      ...projection.acceptSessionEvent(turnEvent('s1', 3, 'turn/end', 0, 'success')),
    ];

    expect(events.map((event) => event.kind)).toEqual(['turn', 'tool', 'tool', 'turn']);
    expect(events[1]).toMatchObject({
      kind: 'tool',
      sessionId: 's1',
      toolCallId: 'call-1',
      turn: 0,
      status: 'pending',
      rawInput: { prompt: 'x' },
    });
    expect(events[2]).toMatchObject({
      kind: 'tool',
      sessionId: 's1',
      toolCallId: 'call-1',
      turn: 0,
      status: 'completed',
      rawOutput: { ok: true },
    });
    expect(events[3]).toMatchObject({ kind: 'turn', turn: 0, phase: 'end', reason: 'success' });
  });

  it('correlates permission requests to the exact tool call and turn', () => {
    const projection = new DshAcpProjection();
    const events = [
      ...projection.acceptSessionEvent(turnEvent('s1', 0, 'turn/start', 0)),
      ...projection.acceptSessionUpdate(toolCall('s1', 'call-1', 0, 1)),
      ...projection.acceptPermission(permission('s1', 'call-1')),
      ...projection.acceptSessionUpdate(
        toolCallUpdate('s1', 'call-1', 0, 2, { status: 'completed' }),
      ),
    ];

    expect(events[2]).toMatchObject({
      kind: 'permission',
      sessionId: 's1',
      toolCallId: 'call-1',
      turn: 0,
    });
    expect(events[3]).toMatchObject({ kind: 'tool', toolCallId: 'call-1', status: 'completed' });
  });

  it('keeps the same toolCallId isolated across turns', () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionEvent(turnEvent('s1', 0, 'turn/start', 0));
    projection.acceptSessionUpdate(toolCall('s1', 'call-1', 0, 1));
    projection.acceptSessionEvent(turnEvent('s1', 2, 'turn/end', 0, 'success'));
    projection.acceptSessionEvent(turnEvent('s1', 3, 'turn/start', 1));
    projection.acceptSessionUpdate(toolCall('s1', 'call-1', 1, 4));
    projection.acceptSessionUpdate(toolCallUpdate('s1', 'call-1', 1, 5, { status: 'completed' }));

    const snapshot = projection.snapshot('s1');
    expect(snapshot.tools.filter((tool) => tool.toolCallId === 'call-1')).toHaveLength(2);
    const events = snapshot.events.filter((event) => event.kind === 'tool');
    expect(events).toHaveLength(3);
    expect(events[2]).toMatchObject({ toolCallId: 'call-1', turn: 1, status: 'completed' });
  });

  it('resolves permission to an exact turn from a unique known tool or request metadata', () => {
    const known = new DshAcpProjection();
    known.acceptSessionEvent(turnEvent('s1', 0, 'turn/start', 0));
    known.acceptSessionUpdate(toolCall('s1', 'call-1', 0, 1));
    const fromKnown = known.acceptPermission(permission('s1', 'call-1'));
    expect(fromKnown[0]).toMatchObject({
      kind: 'permission',
      sessionId: 's1',
      toolCallId: 'call-1',
      turn: 0,
    });

    const fromRequest = new DshAcpProjection();
    const fromMeta = fromRequest.acceptPermission(permission('s2', 'call-9', 4));
    expect(fromMeta[0]).toMatchObject({
      kind: 'permission',
      sessionId: 's2',
      toolCallId: 'call-9',
      turn: 4,
    });
  });

  it('fails visibly when permission cannot determine an exact turn', () => {
    const unknown = new DshAcpProjection();
    expect(unknown.acceptPermission(permission('s1', 'call-1'))[0]).toMatchObject({
      kind: 'diagnostic',
      code: 'ACP_PROJECTION_UNKNOWN_TOOL',
    });

    const ambiguous = new DshAcpProjection();
    ambiguous.acceptSessionEvent(turnEvent('s1', 0, 'turn/start', 0));
    ambiguous.acceptSessionUpdate(toolCall('s1', 'call-1', 0, 1));
    ambiguous.acceptSessionEvent(turnEvent('s1', 2, 'turn/end', 0, 'success'));
    ambiguous.acceptSessionEvent(turnEvent('s1', 3, 'turn/start', 1));
    ambiguous.acceptSessionUpdate(toolCall('s1', 'call-1', 1, 4));
    expect(ambiguous.acceptPermission(permission('s1', 'call-1'))[0]).toMatchObject({
      kind: 'diagnostic',
      code: 'ACP_PROJECTION_AMBIGUOUS_TOOL_TURN',
    });
  });

  it('does not mutate Tool state when the event buffer overflows', () => {
    const projection = new DshAcpProjection({ maxEventsPerSession: 1 });
    projection.acceptSessionEvent(turnEvent('s1', 0, 'turn/start', 0));

    const overflow = projection.acceptSessionUpdate(toolCall('s1', 'call-1', 0, 1));
    expect(overflow[0]).toMatchObject({
      kind: 'diagnostic',
      code: 'ACP_PROJECTION_OVERFLOW',
    });
    expect(projection.snapshot('s1').tools).toEqual([]);

    const drained = projection.drain('s1');
    expect(drained.map((event) => event.kind)).toEqual(['turn']);
    const accepted = projection.acceptSessionUpdate(toolCall('s1', 'call-1', 0, 2));
    expect(accepted[0]).toMatchObject({ kind: 'tool', toolCallId: 'call-1', turn: 0 });
    expect(projection.snapshot('s1').tools).toHaveLength(1);
  });

  it('allows a final same-turn tool update after cancel but rejects later frames', () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionEvent(turnEvent('s1', 0, 'turn/start', 0));
    projection.acceptSessionUpdate(toolCall('s1', 'call-1', 0, 1));
    projection.cancel({ sessionId: 's1', turn: 0 });

    const otherTurn = projection.acceptSessionUpdate(
      toolCallUpdate('s1', 'call-1', 1, 2, { status: 'completed' }),
    );
    expect(otherTurn[0]).toMatchObject({
      kind: 'diagnostic',
      code: 'ACP_PROJECTION_UNKNOWN_TOOL',
    });

    const finalUpdate = projection.acceptSessionUpdate(
      toolCallUpdate('s1', 'call-1', 0, 3, { status: 'failed' }),
    );
    expect(finalUpdate).toHaveLength(1);
    expect(finalUpdate[0]).toMatchObject({ kind: 'tool', status: 'failed', turn: 0 });

    const lateNonFinal = projection.acceptSessionUpdate(
      toolCallUpdate('s1', 'call-1', 0, 4, { status: 'in_progress' }),
    );
    expect(lateNonFinal[0]).toMatchObject({
      kind: 'diagnostic',
      code: 'ACP_PROJECTION_TERMINAL_TOOL',
    });
  });

  it('isolates duplicate and stale frames as per-session diagnostics', () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionEvent(turnEvent('s1', 0, 'turn/start', 0));
    projection.acceptSessionUpdate(toolCall('s1', 'call-1', 0, 1));

    const duplicate = projection.acceptSessionUpdate(toolCall('s1', 'call-1', 0, 2));
    expect(duplicate[0]).toMatchObject({
      kind: 'diagnostic',
      code: 'ACP_PROJECTION_DUPLICATE_TOOL',
    });

    const stale = projection.acceptSessionEvent(turnEvent('s1', 1, 'turn/start', 0));
    expect(stale[0]).toMatchObject({
      kind: 'diagnostic',
      code: 'ACP_PROJECTION_STALE_SEQUENCE',
    });

    const sibling = projection.acceptSessionUpdate(toolCall('s2', 'call-2', 0, 1));
    expect(sibling[0]).toMatchObject({ kind: 'tool', sessionId: 's2', toolCallId: 'call-2' });
  });

  it('strictly validates sequence and turn integer fields without inference on invalid values', () => {
    const projection = new DshAcpProjection();
    expect(
      projection.acceptSessionUpdate({
        sessionId: 's1',
        _meta: { opennekoSequence: -1, opennekoTurn: 0 },
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'call-1',
          title: 'bad',
          status: 'pending',
        },
      } as SessionNotification)[0],
    ).toMatchObject({ kind: 'diagnostic', code: 'ACP_PROJECTION_INVALID_SEQUENCE' });

    expect(
      projection.acceptSessionUpdate(toolCall('s1', 'call-1', Number.NaN, 1))[0],
    ).toMatchObject({ kind: 'diagnostic', code: 'ACP_PROJECTION_INVALID_TURN' });

    expect(
      projection.acceptPermission({
        ...permission('s1', 'call-1'),
        _meta: { opennekoTurn: -1 },
      })[0],
    ).toMatchObject({ kind: 'diagnostic', code: 'ACP_PROJECTION_INVALID_TURN' });

    expect(
      projection.acceptSessionEvent({
        sessionId: 's1',
        sequence: 5,
        type: 'turn/start',
        data: { turn: 1.5 },
      })[0],
    ).toMatchObject({ kind: 'diagnostic', code: 'ACP_PROJECTION_INVALID_TURN' });
  });

  it('requires tool_call_update to carry an exact opennekoTurn instead of inferring', () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionEvent(turnEvent('s1', 0, 'turn/start', 0));
    projection.acceptSessionUpdate(toolCall('s1', 'call-1', 0, 1));

    const missing = projection.acceptSessionUpdate({
      sessionId: 's1',
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call-1',
        status: 'completed',
      },
    } as SessionNotification);
    expect(missing[0]).toMatchObject({
      kind: 'diagnostic',
      code: 'ACP_PROJECTION_MISSING_TURN',
    });
  });

  it('clears currentTurn after the matching turn/end is committed', () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionEvent(turnEvent('s1', 0, 'turn/start', 0));
    expect(projection.snapshot('s1').currentTurn).toBe(0);
    projection.acceptSessionEvent(turnEvent('s1', 1, 'turn/end', 0, 'success'));
    expect(projection.snapshot('s1').currentTurn).toBeUndefined();
  });

  it('rejects terminal-turn late frames without reopening the tool', () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionEvent(turnEvent('s1', 0, 'turn/start', 0));
    projection.acceptSessionUpdate(toolCall('s1', 'call-1', 0, 1));
    projection.acceptSessionEvent(turnEvent('s1', 2, 'turn/end', 0, 'success'));

    const late = projection.acceptSessionUpdate(
      toolCallUpdate('s1', 'call-1', 0, 3, { status: 'completed' }),
    );
    expect(late[0]).toMatchObject({
      kind: 'diagnostic',
      code: 'ACP_PROJECTION_TERMINAL_TURN',
    });
  });

  it('returns a local overflow diagnostic and preserves sibling sessions', () => {
    const projection = new DshAcpProjection({ maxEventsPerSession: 2 });
    projection.acceptSessionEvent(turnEvent('s1', 0, 'turn/start', 0));
    projection.acceptSessionUpdate(toolCall('s1', 'call-1', 0, 1));

    const overflow = projection.acceptSessionUpdate(
      toolCallUpdate('s1', 'call-1', 0, 2, { status: 'completed' }),
    );
    expect(overflow).toHaveLength(1);
    expect(overflow[0]).toMatchObject({
      kind: 'diagnostic',
      code: 'ACP_PROJECTION_OVERFLOW',
      sessionId: 's1',
    });

    const sibling = projection.acceptSessionUpdate(toolCall('s2', 'call-2', 0, 1));
    expect(sibling[0]).toMatchObject({ kind: 'tool', sessionId: 's2', toolCallId: 'call-2' });
  });

  it('discards every process-local Session projection before runtime replay', () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionUpdate(messageChunk('s1', 'user_message_chunk', 'one', 0));
    projection.acceptSessionUpdate(messageChunk('s2', 'agent_message_chunk', 'two', 0));

    projection.reset();

    expect(projection.snapshot('s1').events).toEqual([]);
    expect(projection.snapshot('s2').events).toEqual([]);
    expect(
      projection.acceptSessionUpdate(messageChunk('s1', 'user_message_chunk', 'replayed', 0)),
    ).toHaveLength(1);
  });
});

function toolCall(
  sessionId: string,
  toolCallId: string,
  turn: number,
  sequence: number,
  extra: Partial<SessionNotification['update'] & { rawInput?: unknown }> = {},
): SessionNotification {
  return {
    sessionId,
    _meta: { opennekoSequence: sequence, opennekoTurn: turn },
    update: {
      sessionUpdate: 'tool_call',
      toolCallId,
      title: `tool-${toolCallId}`,
      status: 'pending',
      ...extra,
    },
  } as SessionNotification;
}

function messageChunk(
  sessionId: string,
  sessionUpdate: 'user_message_chunk' | 'agent_message_chunk',
  text: string,
  sequence: number,
  messageId?: string,
): SessionNotification {
  return {
    sessionId,
    _meta: { opennekoSequence: sequence },
    update: {
      sessionUpdate,
      content: { type: 'text', text },
      ...(messageId === undefined ? {} : { messageId }),
    },
  };
}

function toolCallUpdate(
  sessionId: string,
  toolCallId: string,
  turn: number,
  sequence: number,
  extra: Partial<SessionNotification['update'] & { rawOutput?: unknown }> = {},
): SessionNotification {
  return {
    sessionId,
    _meta: { opennekoSequence: sequence, opennekoTurn: turn },
    update: {
      sessionUpdate: 'tool_call_update',
      toolCallId,
      ...extra,
    },
  } as SessionNotification;
}

function turnEvent(
  sessionId: string,
  sequence: number,
  type: 'turn/start' | 'turn/end',
  turn: number,
  reason?: string,
): DshAcpSessionEventNotification {
  return {
    sessionId,
    sequence,
    type,
    data: reason === undefined ? { turn } : { turn, reason: { kind: reason } },
  };
}

function permission(
  sessionId: string,
  toolCallId: string,
  turn?: number,
): RequestPermissionRequest {
  return {
    sessionId,
    toolCall: { toolCallId, title: `tool-${toolCallId}` },
    options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
    ...(turn === undefined ? {} : { _meta: { opennekoTurn: turn } }),
  };
}
