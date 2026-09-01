import { describe, expect, it } from 'vitest';
import { createDshTurnCanvasTargetOwner } from '@neko/agent-runtime/application';
import { resolveDesktopDshSessionEventAdmission } from './desktop-dsh-turn-canvas-event-admission';

describe('Desktop DSH turn Canvas event admission', () => {
  it('binds turn/start before awaiting the Conversation binding', async () => {
    const targets = createDshTurnCanvasTargetOwner();
    targets.admit('dsh-1', {
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/story.nkc',
    });
    let resolveBinding!: (value: { readonly conversationId: string }) => void;
    const binding = new Promise<{ readonly conversationId: string }>((resolve) => {
      resolveBinding = resolve;
    });

    const pending = resolveDesktopDshSessionEventAdmission({
      event: { sessionId: 'dsh-1', type: 'turn/start', replay: false },
      projection: { snapshot: () => ({ currentTurn: 1 }) },
      targets,
      resolveBinding: () => binding,
    });

    expect(targets.read('dsh-1', 1)).toMatchObject({
      canvasId: 'neko/boards/story.nkc',
    });
    resolveBinding({ conversationId: 'conversation-1' });
    await expect(pending).resolves.toEqual({
      binding: { conversationId: 'conversation-1' },
      startedTurn: 1,
    });
  });

  it('releases the bound turn when its Conversation binding is unavailable', async () => {
    const targets = createDshTurnCanvasTargetOwner();
    targets.admit('dsh-1', {
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/workspace.nkc',
    });

    await expect(
      resolveDesktopDshSessionEventAdmission({
        event: { sessionId: 'dsh-1', type: 'turn/start', replay: false },
        projection: { snapshot: () => ({ currentTurn: 1 }) },
        targets,
        resolveBinding: async () => undefined,
      }),
    ).rejects.toThrow('has no Conversation binding');
    expect(() => targets.read('dsh-1', 1)).toThrow('has no bound Canvas target admission');
  });

  it('replays turn/start without consuming or fabricating a live Canvas admission', async () => {
    const targets = createDshTurnCanvasTargetOwner();

    await expect(
      resolveDesktopDshSessionEventAdmission({
        event: { sessionId: 'dsh-1', type: 'turn/start', replay: true },
        projection: { snapshot: () => ({ currentTurn: 1 }) },
        targets,
        resolveBinding: async () => ({ conversationId: 'conversation-1' }),
      }),
    ).resolves.toEqual({ binding: { conversationId: 'conversation-1' } });
    expect(() => targets.read('dsh-1', 1)).toThrow('has no bound Canvas target admission');
  });
});
