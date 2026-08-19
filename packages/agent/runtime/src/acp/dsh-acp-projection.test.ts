import type { RequestPermissionRequest, SessionNotification } from '@agentclientprotocol/sdk';
import { describe, expect, it } from 'vitest';

import type { DshAcpSessionEventNotification } from '@neko/agent-contracts/dsh-acp';

import { DshAcpProjection } from './dsh-acp-projection';

describe('DshAcpProjection', () => {
  it('assembles interleaved DSH text blocks and settles the final message exactly once', () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionUpdate(messageChunk('s1', 'user_message_chunk', 'hello', 0, 'u1'));
    projection.acceptSessionEvent(turnEvent('s1', 1, 'turn/start', 0));
    projection.acceptSessionEvent(stepEvent('s1', 2, 'step/start', 0, 0));
    projection.acceptSessionUpdate(assistantChunk('s1', 3, 0, 0, 'text', 1, 'world'));
    projection.acceptSessionUpdate(assistantChunk('s1', 4, 0, 0, 'text', 0, 'Hello '));

    expect(projection.snapshot('s1').events.at(-1)).toMatchObject({
      kind: 'message',
      role: 'assistant',
      text: 'Hello world',
      state: 'streaming',
    });

    projection.acceptSessionUpdate(finalAssistantChunk('s1', 5, 0, 0, 'reasoning', 'a1', '', 0));
    projection.acceptSessionUpdate(
      finalAssistantChunk('s1', 5, 0, 0, 'text', 'a1', 'Final answer', 1),
    );

    expect(projection.snapshot('s1').events).toEqual([
      {
        kind: 'message',
        sessionId: 's1',
        role: 'user',
        text: 'hello',
        messageId: 'u1',
      },
      {
        kind: 'turn',
        sessionId: 's1',
        turn: 0,
        phase: 'start',
        startedAt: 1_001,
      },
      {
        kind: 'message',
        sessionId: 's1',
        role: 'assistant',
        turn: 0,
        step: 0,
        text: 'Final answer',
        messageId: 'a1',
        state: 'final',
      },
    ]);
  });

  it('keeps reasoning separate and removes transient content absent from the final DSH message', () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionEvent(turnEvent('s1', 0, 'turn/start', 0));
    projection.acceptSessionEvent(stepEvent('s1', 1, 'step/start', 0, 0));
    projection.acceptSessionUpdate(assistantChunk('s1', 2, 0, 0, 'reasoning', 0, 'Inspect'));

    expect(projection.snapshot('s1').events.at(-1)).toMatchObject({
      kind: 'thought',
      text: 'Inspect',
      state: 'streaming',
    });

    projection.acceptSessionUpdate(finalAssistantChunk('s1', 3, 0, 0, 'reasoning', 'a1', '', 0));
    projection.acceptSessionUpdate(finalAssistantChunk('s1', 3, 0, 0, 'text', 'a1', 'Done', 1));

    expect(projection.snapshot('s1').events.filter((event) => event.kind === 'thought')).toEqual(
      [],
    );
    expect(projection.snapshot('s1').events.at(-1)).toMatchObject({
      kind: 'message',
      text: 'Done',
      state: 'final',
    });
  });

  it('fails an overflowing assistant assembly locally and preserves a sibling Session', () => {
    const projection = new DshAcpProjection({ maxAssistantStreamBytes: 4 });
    projection.acceptSessionEvent(turnEvent('s1', 0, 'turn/start', 0));
    projection.acceptSessionEvent(stepEvent('s1', 1, 'step/start', 0, 0));
    expect(
      projection.acceptSessionUpdate(assistantChunk('s1', 2, 0, 0, 'text', 0, '12345'))[0],
    ).toMatchObject({
      kind: 'diagnostic',
      code: 'ACP_PROJECTION_ASSISTANT_STREAM_OVERFLOW',
    });

    projection.acceptSessionEvent(turnEvent('s2', 0, 'turn/start', 0));
    projection.acceptSessionEvent(stepEvent('s2', 1, 'step/start', 0, 0));
    expect(
      projection.acceptSessionUpdate(assistantChunk('s2', 2, 0, 0, 'text', 0, 'ok'))[0],
    ).toMatchObject({ kind: 'message', sessionId: 's2', text: 'ok' });
  });

  it('removes an unsettled transient assistant stream when its turn ends fail-visible', () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionEvent(turnEvent('s1', 0, 'turn/start', 0));
    projection.acceptSessionEvent(stepEvent('s1', 1, 'step/start', 0, 0));
    projection.acceptSessionUpdate(assistantChunk('s1', 2, 0, 0, 'text', 0, 'Partial'));
    projection.acceptSessionEvent(stepEvent('s1', 3, 'step/end', 0, 0));

    expect(projection.acceptSessionEvent(turnEvent('s1', 4, 'turn/end', 0, 'failed'))).toEqual([
      expect.objectContaining({ kind: 'turn', phase: 'end', turn: 0 }),
      expect.objectContaining({
        kind: 'diagnostic',
        code: 'ACP_PROJECTION_UNSETTLED_ASSISTANT_STREAM',
      }),
    ]);
    expect(projection.snapshot('s1')).toMatchObject({
      currentTurn: undefined,
      events: [
        expect.objectContaining({ kind: 'turn', phase: 'start' }),
        expect.objectContaining({ kind: 'turn', phase: 'end' }),
        expect.objectContaining({
          kind: 'diagnostic',
          code: 'ACP_PROJECTION_UNSETTLED_ASSISTANT_STREAM',
        }),
      ],
    });
    expect(
      projection
        .snapshot('s1')
        .events.some((event) => event.kind === 'message' && event.role === 'assistant'),
    ).toBe(false);
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
    expect(events[3]).toMatchObject({
      kind: 'turn',
      turn: 0,
      phase: 'end',
      startedAt: 1_000,
      completedAt: 1_003,
      reason: 'success',
    });
  });

  it('projects exact user command events independently from model turns and Tools', () => {
    const projection = new DshAcpProjection();
    expect(
      projection.acceptSessionEvent(
        commandEvent('s1', 0, 'command/run', {
          commandId: 'command-1',
          name: 'help',
          args: 'tools',
          source: { kind: 'user' },
        }),
      ),
    ).toEqual([
      {
        kind: 'command',
        sessionId: 's1',
        commandId: 'command-1',
        name: 'help',
        args: 'tools',
        status: 'running',
      },
    ]);
    expect(
      projection.acceptSessionEvent(
        commandEvent('s1', 1, 'command/done', {
          commandId: 'command-1',
          kind: 'success',
          text: 'Available commands',
          sourceEventSeq: 0,
        }),
      ),
    ).toEqual([
      {
        kind: 'command',
        sessionId: 's1',
        commandId: 'command-1',
        name: 'help',
        args: 'tools',
        status: 'completed',
        text: 'Available commands',
      },
    ]);
    expect(projection.snapshot('s1')).toMatchObject({ currentTurn: undefined, tools: [] });
  });

  it('fails duplicate, unpaired, and malformed command events locally', () => {
    const projection = new DshAcpProjection();
    projection.acceptSessionEvent(
      commandEvent('s1', 0, 'command/run', {
        commandId: 'command-1',
        name: 'help',
        source: { kind: 'user' },
      }),
    );
    expect(
      projection.acceptSessionEvent(
        commandEvent('s1', 1, 'command/run', {
          commandId: 'command-1',
          name: 'help',
          source: { kind: 'user' },
        }),
      )[0],
    ).toMatchObject({ kind: 'diagnostic', code: 'ACP_PROJECTION_DUPLICATE_COMMAND' });
    expect(
      projection.acceptSessionEvent(
        commandEvent('s2', 0, 'command/done', {
          commandId: 'command-missing',
          kind: 'success',
        }),
      )[0],
    ).toMatchObject({ kind: 'diagnostic', code: 'ACP_PROJECTION_UNKNOWN_COMMAND' });
    expect(
      projection.acceptSessionEvent(
        commandEvent('s3', 0, 'command/run', {
          commandId: 'command-3',
          name: 'help',
          source: { kind: 'agent' },
        }),
      )[0],
    ).toMatchObject({ kind: 'diagnostic', code: 'ACP_PROJECTION_INVALID_COMMAND' });
    expect(projection.snapshot('s2').events).toHaveLength(1);
    expect(projection.snapshot('s3').events).toHaveLength(1);
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
        time: 1_005,
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

  it('rejects missing or decreasing DSH turn timing without affecting a sibling Session', () => {
    const projection = new DshAcpProjection();
    expect(projection.acceptSessionEvent(turnEvent('s1', 0, 'turn/end', 0))[0]).toMatchObject({
      kind: 'diagnostic',
      code: 'ACP_PROJECTION_MISSING_TURN_START',
    });

    projection.acceptSessionEvent(turnEvent('s2', 0, 'turn/start', 0, undefined, 2_000));
    expect(
      projection.acceptSessionEvent(turnEvent('s2', 1, 'turn/end', 0, 'success', 1_999))[0],
    ).toMatchObject({
      kind: 'diagnostic',
      code: 'ACP_PROJECTION_INVALID_TURN_TIME',
    });

    projection.acceptSessionEvent(turnEvent('s3', 0, 'turn/start', 0, undefined, 3_000));
    expect(
      projection.acceptSessionEvent(turnEvent('s3', 1, 'turn/end', 0, 'success', 4_500))[0],
    ).toMatchObject({
      kind: 'turn',
      startedAt: 3_000,
      completedAt: 4_500,
    });
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

function assistantChunk(
  sessionId: string,
  sequence: number,
  turn: number,
  step: number,
  channel: 'text' | 'reasoning',
  blockIndex: number,
  text: string,
): SessionNotification {
  return {
    sessionId,
    _meta: {
      opennekoSequence: sequence,
      opennekoTurn: turn,
      opennekoStep: step,
      opennekoBlockIndex: blockIndex,
      opennekoMessagePhase: 'delta',
    },
    update: {
      sessionUpdate: channel === 'text' ? 'agent_message_chunk' : 'agent_thought_chunk',
      messageId: `dsh:${turn}:${step}:${channel}`,
      content: { type: 'text', text },
    },
  };
}

function finalAssistantChunk(
  sessionId: string,
  sequence: number,
  turn: number,
  step: number,
  channel: 'text' | 'reasoning',
  messageId: string,
  text: string,
  frameIndex: number,
): SessionNotification {
  return {
    sessionId,
    _meta: {
      opennekoSequence: sequence,
      opennekoTurn: turn,
      opennekoStep: step,
      opennekoMessagePhase: 'final',
      opennekoFrameIndex: frameIndex,
      opennekoFrameCount: 2,
    },
    update: {
      sessionUpdate: channel === 'text' ? 'agent_message_chunk' : 'agent_thought_chunk',
      messageId,
      content: { type: 'text', text },
    },
  };
}

function stepEvent(
  sessionId: string,
  sequence: number,
  type: 'step/start' | 'step/end',
  turn: number,
  step: number,
): DshAcpSessionEventNotification {
  return { sessionId, sequence, time: 1_000 + sequence, type, data: { turn, step } };
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
  time = 1_000 + sequence,
): DshAcpSessionEventNotification {
  return {
    sessionId,
    sequence,
    time,
    type,
    data: reason === undefined ? { turn } : { turn, reason: { kind: reason } },
  };
}

function commandEvent(
  sessionId: string,
  sequence: number,
  type: 'command/run' | 'command/done',
  data: unknown,
): DshAcpSessionEventNotification {
  return { sessionId, sequence, time: 1_000 + sequence, type, data };
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
