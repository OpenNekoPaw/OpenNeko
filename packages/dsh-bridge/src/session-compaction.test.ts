import { CallId, MessageId, createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import { describe, expect, it } from 'vitest';
import { projectExtensionSessionEvent, projectSessionEvent } from './index';
import { branchSeedThroughAssistantReply } from './session-branch';

describe('DSH compaction human transcript boundary', () => {
  it.each([false, true])('does not redeliver replaced tool results (replay=%s)', (replay) => {
    const session = Session.create(SessionId('compact-tools'));
    const callId = CallId('canvas-call');
    const call = session.append('tool/call', {
      turn: 0,
      step: 0,
      callId,
      name: 'openneko_canvas',
      arguments: '{}',
    });
    const result = session.append(
      'tool/result',
      {
        turn: 0,
        step: 0,
        message: {
          id: MessageId('canvas-result'),
          role: 'user',
          source: { kind: 'tool', callId },
          content: [
            {
              type: 'tool-result',
              toolCallId: callId,
              isError: false,
              content: [{ type: 'text', text: 'Original canvas output.' }],
            },
          ],
        },
      },
      { surfaceOp: 'append', sourceEventSeqs: [call.seq] },
    );
    let previous = result;
    for (const text of ['Pruned canvas output.', 'Pruned again.']) {
      const replacement = session.append(
        'tool/result',
        {
          ...result.data,
          message: {
            ...result.data.message,
            content: [
              {
                type: 'tool-result',
                toolCallId: callId,
                isError: false,
                content: [{ type: 'text', text }],
              },
            ],
          },
        },
        {
          surfaceOp: { op: 'replace', start: previous.seq, end: previous.seq },
          sourceEventSeqs: [previous.seq],
        },
      );
      expect(projectSessionEvent(session.id, replacement, { replay })).toEqual([]);
      expect(projectExtensionSessionEvent(session.id, replacement, replay)).toBeUndefined();
      previous = replacement;
    }
    const nextCallId = CallId('next-call');
    const nextCall = session.append('tool/call', {
      turn: 1,
      step: 0,
      callId: nextCallId,
      name: 'read',
      arguments: '{}',
    });
    session.append(
      'tool/result',
      {
        turn: 1,
        step: 0,
        message: {
          id: MessageId('next-result'),
          role: 'user',
          source: { kind: 'tool', callId: nextCallId },
          content: [
            {
              type: 'tool-result',
              toolCallId: nextCallId,
              isError: false,
              content: [{ type: 'text', text: 'Continued after compaction.' }],
            },
          ],
        },
      },
      { surfaceOp: 'append', sourceEventSeqs: [nextCall.seq] },
    );

    const updates = session.events
      .flatMap((event) => projectSessionEvent(session.id, event, { replay }))
      .map((notification) => notification.update);
    expect(updates).toMatchObject([
      { sessionUpdate: 'tool_call', toolCallId: callId, status: 'pending' },
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: callId,
        status: 'completed',
        rawOutput: [{ type: 'text', text: 'Original canvas output.' }],
      },
      { sessionUpdate: 'tool_call', toolCallId: nextCallId, status: 'pending' },
      { sessionUpdate: 'tool_call_update', toolCallId: nextCallId, status: 'completed' },
    ]);
    expect(session.events.filter((event) => event.type === 'tool/result')).toHaveLength(4);
    expect(session.deriveMessages()).toMatchObject([
      { content: [{ type: 'tool-result', content: [{ text: 'Pruned again.' }] }] },
      { content: [{ type: 'tool-result', content: [{ text: 'Continued after compaction.' }] }] },
    ]);
  });

  it.each([false, true])('keeps original user and assistant messages (replay=%s)', (replay) => {
    const session = Session.create(SessionId('compact-messages'));
    const user = session.append(
      'user/message',
      createUserMessage({
        content: [{ type: 'text', text: 'Original request.' }],
        source: { kind: 'user' },
      }),
      { surfaceOp: 'append' },
    );
    const assistant = session.append(
      'assistant/message',
      {
        turn: 0,
        step: 0,
        message: createAssistantMessage({
          content: [{ type: 'text', text: 'Original answer.' }],
          source: { provider: 'provider', model: 'model' },
        }),
      },
      { surfaceOp: 'append', sourceEventSeqs: [] },
    );
    const replacements = [
      session.append(
        'user/message',
        {
          ...user.data,
          content: [{ type: 'text', text: 'Short request.' }],
        },
        {
          surfaceOp: { op: 'replace', start: user.seq, end: user.seq },
          sourceEventSeqs: [user.seq],
        },
      ),
      session.append(
        'assistant/message',
        {
          ...assistant.data,
          message: {
            ...assistant.data.message,
            content: [{ type: 'text', text: 'Short answer.' }],
          },
        },
        {
          surfaceOp: { op: 'replace', start: assistant.seq, end: assistant.seq },
          sourceEventSeqs: [assistant.seq],
        },
      ),
    ];
    for (const replacement of replacements) {
      expect(projectSessionEvent(session.id, replacement, { replay })).toEqual([]);
      expect(projectExtensionSessionEvent(session.id, replacement, replay)).toBeUndefined();
    }
    const updates = session.events.flatMap((event) =>
      projectSessionEvent(session.id, event, { replay }),
    );
    expect(updates).toMatchObject([
      { update: { sessionUpdate: 'user_message_chunk', content: { text: 'Original request.' } } },
      { update: { sessionUpdate: 'agent_thought_chunk', content: { text: '' } } },
      { update: { sessionUpdate: 'agent_message_chunk', content: { text: 'Original answer.' } } },
    ]);
    expect(session.deriveMessages()).toMatchObject([
      { content: [{ text: 'Short request.' }] },
      { content: [{ text: 'Short answer.' }] },
    ]);
  });

  it('branches from the original reply while retaining model surface events in the seed', () => {
    const session = Session.create(SessionId('compact-branch'));
    session.append('turn/start', { turn: 0 });
    const reply = session.append(
      'assistant/message',
      {
        turn: 0,
        step: 0,
        message: createAssistantMessage({
          content: [{ type: 'text', text: 'Full answer.' }],
          source: { provider: 'provider', model: 'model' },
        }),
      },
      { surfaceOp: 'append', sourceEventSeqs: [] },
    );
    const replacement = session.append(
      'assistant/message',
      {
        ...reply.data,
        message: { ...reply.data.message, content: [{ type: 'text', text: 'Summary.' }] },
      },
      {
        surfaceOp: { op: 'replace', start: reply.seq, end: reply.seq },
        sourceEventSeqs: [reply.seq],
      },
    );
    const end = session.append('turn/end', { turn: 0, reason: { kind: 'completed' } });
    session.append('assistant/message', replacement.data, {
      surfaceOp: { op: 'replace', start: replacement.seq, end: replacement.seq },
      sourceEventSeqs: [replacement.seq],
    });
    const seed = branchSeedThroughAssistantReply(session.events, reply.data.message.id);
    expect(seed.at(-1)).toEqual(end);
    expect(seed).toContainEqual(replacement);
    expect(seed).toHaveLength(end.seq + 1);
  });

  it('still rejects ambiguous original replies instead of silently choosing one', () => {
    const session = Session.create(SessionId('ambiguous-branch'));
    const message = createAssistantMessage({
      content: [{ type: 'text', text: 'Answer.' }],
      source: { provider: 'provider', model: 'model' },
    });
    for (const turn of [0, 1]) {
      session.append(
        'assistant/message',
        { turn, step: 0, message },
        { surfaceOp: 'append', sourceEventSeqs: [] },
      );
      session.append('turn/end', { turn, reason: { kind: 'completed' } });
    }
    expect(() => branchSeedThroughAssistantReply(session.events, message.id)).toThrow('found 2');
  });
});
