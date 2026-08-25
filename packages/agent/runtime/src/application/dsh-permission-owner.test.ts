import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';
import { describe, expect, it, vi } from 'vitest';

import { DshPermissionOwner } from './dsh-permission-owner';

describe('DSH permission owner', () => {
  it('binds a request to exact Conversation/Session/turn/call and selects an advertised option', async () => {
    const changed = vi.fn();
    const owner = createOwner(changed);
    const pending = owner.request({ request: permission(), turn: 3 });
    await vi.waitFor(() => expect(owner.list('conversation:one')).toHaveLength(1));
    expect(owner.list('conversation:one')).toEqual([
      {
        conversationId: 'conversation:one',
        dshSessionId: 'dsh-session:one',
        turn: 3,
        toolCallId: 'tool:one',
        title: 'Write file',
        options: [
          { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
        ],
      },
    ]);

    await owner.decide({
      conversationId: 'conversation:one',
      dshSessionId: 'dsh-session:one',
      turn: 3,
      toolCallId: 'tool:one',
      optionId: 'allow',
    });
    await expect(pending).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'allow' },
    });
    expect(owner.list('conversation:one')).toEqual([]);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('rejects stale identity and unadvertised options without settling the request', async () => {
    const owner = createOwner();
    const pending = owner.request({ request: permission(), turn: 3 });
    await vi.waitFor(() => expect(owner.list('conversation:one')).toHaveLength(1));

    await expect(
      owner.decide({
        conversationId: 'conversation:other',
        dshSessionId: 'dsh-session:one',
        turn: 3,
        toolCallId: 'tool:one',
        optionId: 'allow',
      }),
    ).rejects.toMatchObject({ code: 'DSH_PERMISSION_NOT_PENDING' });
    await expect(
      owner.decide({
        conversationId: 'conversation:one',
        dshSessionId: 'dsh-session:one',
        turn: 3,
        toolCallId: 'tool:one',
        optionId: 'not-advertised',
      }),
    ).rejects.toMatchObject({ code: 'DSH_PERMISSION_OPTION_INVALID' });
    expect(owner.list('conversation:one')).toHaveLength(1);
    await owner.dispose();
    await expect(pending).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
  });

  it('rejects a Session without an exact Conversation binding', async () => {
    const owner = new DshPermissionOwner({
      bindings: { async getByDshSessionId() {} },
    });
    await expect(owner.request({ request: permission(), turn: 1 })).rejects.toMatchObject({
      code: 'DSH_PERMISSION_CONVERSATION_MISSING',
    });
  });

  it('rejects duplicate pending identity and keeps sibling permission usable', async () => {
    const owner = createOwner();
    const first = owner.request({ request: permission(), turn: 1 });
    await vi.waitFor(() => expect(owner.list('conversation:one')).toHaveLength(1));
    await expect(owner.request({ request: permission(), turn: 1 })).rejects.toMatchObject({
      code: 'DSH_PERMISSION_ALREADY_PENDING',
    });
    const sibling = owner.request({
      request: permission({ toolCallId: 'tool:two' }),
      turn: 1,
    });
    await vi.waitFor(() => expect(owner.list('conversation:one')).toHaveLength(2));
    await owner.cancel({
      conversationId: 'conversation:one',
      dshSessionId: 'dsh-session:one',
      turn: 1,
      toolCallId: 'tool:one',
    });
    await owner.decide({
      conversationId: 'conversation:one',
      dshSessionId: 'dsh-session:one',
      turn: 1,
      toolCallId: 'tool:two',
      optionId: 'reject',
    });
    await expect(first).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
    await expect(sibling).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'reject' },
    });
  });

  it('does not publish a permission that resolves its binding after disposal', async () => {
    let releaseBinding!: () => void;
    const bindingReady = new Promise<void>((resolve) => {
      releaseBinding = resolve;
    });
    const owner = new DshPermissionOwner({
      bindings: {
        async getByDshSessionId(dshSessionId) {
          await bindingReady;
          return { conversationId: 'conversation:one', dshSessionId };
        },
      },
    });
    const request = owner.request({ request: permission(), turn: 1 });
    await owner.dispose();
    releaseBinding();

    await expect(request).rejects.toMatchObject({ code: 'DSH_PERMISSION_OWNER_DISPOSED' });
  });

  it('cancels pending permissions and rejects a request crossing a runtime reset', async () => {
    let releaseBinding!: () => void;
    const bindingReady = new Promise<void>((resolve) => {
      releaseBinding = resolve;
    });
    const owner = new DshPermissionOwner({
      bindings: {
        async getByDshSessionId(dshSessionId) {
          await bindingReady;
          return { conversationId: 'conversation:one', dshSessionId };
        },
      },
    });
    const crossing = owner.request({ request: permission(), turn: 1 });
    await owner.reset();
    releaseBinding();

    await expect(crossing).rejects.toMatchObject({ code: 'DSH_PERMISSION_OWNER_RESET' });
    expect(owner.list('conversation:one')).toEqual([]);

    const next = owner.request({ request: permission(), turn: 2 });
    await vi.waitFor(() => expect(owner.list('conversation:one')).toHaveLength(1));
    await owner.reset();
    await expect(next).resolves.toEqual({ outcome: { outcome: 'cancelled' } });
    expect(owner.list('conversation:one')).toEqual([]);
  });
});

function createOwner(onChanged = vi.fn()) {
  return new DshPermissionOwner({
    bindings: {
      async getByDshSessionId(dshSessionId) {
        return { conversationId: 'conversation:one', dshSessionId };
      },
    },
    onChanged,
  });
}

function permission(input: { readonly toolCallId?: string } = {}): RequestPermissionRequest {
  return {
    sessionId: 'dsh-session:one',
    toolCall: { toolCallId: input.toolCallId ?? 'tool:one', title: 'Write file' },
    options: [
      { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
      { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
    ],
  };
}
