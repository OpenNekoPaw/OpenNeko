import { describe, expect, it } from 'vitest';
import { createDshTurnCanvasTargetOwner } from '@neko/agent-runtime/application';
import { resolveDesktopDshSessionEventAdmission } from './desktop-dsh-turn-canvas-event-admission';

describe('Desktop DSH turn Canvas event admission', () => {
  it('binds turn/start before awaiting the Conversation binding', async () => {
    const targets = createDshTurnCanvasTargetOwner();
    targets.admit('dsh-1', {
      kind: 'exact-canvas',
      workspaceId: 'workspace-1',
      canvasId: 'neko/boards/story.nkc',
    });
    let resolveBinding!: (value: { readonly conversationId: string }) => void;
    const binding = new Promise<{ readonly conversationId: string }>((resolve) => {
      resolveBinding = resolve;
    });

    const pending = resolveDesktopDshSessionEventAdmission({
      event: { sessionId: 'dsh-1', type: 'turn/start' },
      projection: { snapshot: () => ({ currentTurn: 1 }) },
      targets,
      resolveBinding: () => binding,
    });

    expect(targets.read('dsh-1', 1)).toMatchObject({
      kind: 'exact-canvas',
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
    targets.admit('dsh-1', { kind: 'workspace-board', workspaceId: 'workspace-1' });

    await expect(
      resolveDesktopDshSessionEventAdmission({
        event: { sessionId: 'dsh-1', type: 'turn/start' },
        projection: { snapshot: () => ({ currentTurn: 1 }) },
        targets,
        resolveBinding: async () => undefined,
      }),
    ).rejects.toThrow('has no Conversation binding');
    expect(() => targets.read('dsh-1', 1)).toThrow('has no bound Canvas target admission');
  });
});
