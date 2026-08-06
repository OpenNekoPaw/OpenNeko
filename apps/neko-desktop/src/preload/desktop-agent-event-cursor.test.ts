import { describe, expect, it } from 'vitest';
import type { DesktopAgentConnectionIdentity } from '@neko/agent-contracts';
import {
  advanceDesktopAgentBootstrapCursor,
  DesktopAgentEventCursorRegistry,
  projectDesktopAgentSendFailure,
} from './desktop-agent-event-cursor';

describe('Desktop Agent preload event cursor', () => {
  it('preserves the sequence baseline when bootstrap reuses the exact connection', () => {
    const connection = createConnection('connection-1');
    const current = {
      connection,
      sequence: 31,
    };

    expect(advanceDesktopAgentBootstrapCursor(current, connection)).toEqual(current);
  });

  it('resets the sequence baseline for a replacement connection', () => {
    const current = {
      connection: createConnection('connection-1'),
      sequence: 31,
    };
    const replacement = createConnection('connection-2');

    expect(advanceDesktopAgentBootstrapCursor(current, replacement)).toEqual({
      connection: replacement,
      sequence: 0,
    });
  });

  it('projects a rejected conversation send into a conversation-visible terminal error', () => {
    expect(
      projectDesktopAgentSendFailure(
        {
          type: 'sendMessage',
          conversationId: 'conversation-1',
          message: 'hello',
          sessionMode: 'agent',
        },
        'Desktop send rejected.',
      ),
    ).toEqual({
      type: 'error',
      conversationId: 'conversation-1',
      message: 'Desktop send rejected.',
    });
    expect(
      projectDesktopAgentSendFailure({ type: 'getConversations' }, 'Catalog request rejected.'),
    ).toEqual({
      type: 'globalError',
      message: 'Catalog request rejected.',
    });
  });

  it('keeps two same-View conversation connections independently sequenced', () => {
    const registry = new DesktopAgentEventCursorRegistry();
    const previous = createConnection('connection-1');
    const replacement = createConnection('connection-2');
    registry.register(previous);
    registry.register(replacement);

    expect(registry.advance(previous, 1)).toEqual({
      kind: 'accepted',
      connection: previous,
    });
    expect(registry.advance(replacement, 1)).toEqual({
      kind: 'accepted',
      connection: replacement,
    });
    expect(registry.advance(replacement, 2)).toEqual({
      kind: 'accepted',
      connection: replacement,
    });
  });

  it('rejects events after the exact connection is unregistered', () => {
    const registry = new DesktopAgentEventCursorRegistry();
    const previous = createConnection('connection-1');
    const current = createConnection('connection-2');
    registry.register(previous);
    registry.register(current);
    registry.unregister(previous);

    expect(registry.advance(previous, 1)).toEqual({ kind: 'foreign' });
    expect(registry.advance(current, 1)).toEqual({ kind: 'accepted', connection: current });
  });

  it('keeps unknown and identity-conflicting events fail-visible', () => {
    const registry = new DesktopAgentEventCursorRegistry();
    const current = createConnection('connection-current');
    registry.register(current);

    expect(registry.advance(createConnection('connection-foreign'), 1)).toEqual({
      kind: 'foreign',
    });
    expect(
      registry.advance({ ...current, workspaceId: 'workspace-forged' }, 1),
    ).toEqual({
      kind: 'foreign',
    });
    expect(registry.advance(current, 3)).toEqual({
      kind: 'sequence-mismatch',
      connection: current,
      expectedSequence: 1,
      receivedSequence: 3,
    });
  });

  it('unregisters one connection and preserves another active View', () => {
    const registry = new DesktopAgentEventCursorRegistry();
    const first = createConnection('connection-1');
    const second = { ...createConnection('connection-2'), viewId: 'view-2' };
    registry.register(first);
    registry.register(second);
    registry.unregister(second);

    expect(registry.advance(second, 1)).toEqual({ kind: 'foreign' });
    expect(registry.advance(first, 1)).toEqual({ kind: 'accepted', connection: first });
  });
});

function createConnection(connectionId: string): DesktopAgentConnectionIdentity {
  return {
    applicationInstanceId: 'application-1',
    windowId: 'window-1',
    workbenchInstanceId: 'workbench-1',
    agentSurfaceId: `agent-surface:${connectionId}`,
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    viewId: 'view-1',
    connectionId,
  };
}
