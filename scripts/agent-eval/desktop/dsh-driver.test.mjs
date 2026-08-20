import { describe, expect, it, vi } from 'vitest';
import { createDshDesktopAgentDriver, dshDriverExpression } from './dsh-driver.mjs';

describe('canonical DSH Desktop evaluation driver', () => {
  it('uses only public DSH bridges and never the retired Agent bridge', () => {
    const expression = dshDriverExpression({ kind: 'snapshot', conversationId: 'conversation-1' });
    expect(expression).toContain('window.openNekoDesktop');
    expect(expression).toContain('dshSessions');
    expect(expression).toContain('dshPermissions');
    expect(expression).toContain('dshRuntime');
    expect(expression).not.toContain('openNekoDesktop.agent');
    expect(expression).not.toContain('agentLaunch');
    expect(expression).not.toContain('automation');
    expect(expression).toContain('DSH Desktop Session has no effective selected model.');
  });

  it('selects an advertised model only on the exact idle DSH Conversation surface', () => {
    const expression = dshDriverExpression({
      kind: 'update-model',
      conversationId: 'conversation-1',
      providerId: 'provider-1',
      modelId: 'model-1',
      turnState: 'idle',
    });
    expect(expression).toContain('surface.scope?.conversationId !== conversationId');
    expect(expression).toContain('DSH model update requires an idle Session.');
    expect(expression).toContain('sessions.selectComposerModel');
    expect(expression).toContain('turnCountBefore');
    expect(expression).toContain('turnCountAfter');
  });

  it('rejects construction without the renderer boundary', () => {
    expect(() => createDshDesktopAgentDriver({})).toThrow('renderer evaluate function');
  });

  it('delegates public operations through one renderer evaluator', async () => {
    const evaluate = vi.fn(async (expression) => {
      expect(expression).toContain('dshSessions');
      return { conversationId: 'conversation-1', dshSessionId: 'session-1', events: [] };
    });
    const driver = createDshDesktopAgentDriver({ evaluate });

    await expect(driver.readProjection('conversation-1')).resolves.toMatchObject({
      conversationId: 'conversation-1',
    });
    await expect(
      driver.observeWorkflowStep({ conversationId: 'conversation-1' }),
    ).resolves.toMatchObject({ conversationId: 'conversation-1' });
    await expect(
      driver.updateConfiguration({
        conversationId: 'conversation-1',
        providerId: 'provider-1',
        modelId: 'model-1',
        turnState: 'idle',
      }),
    ).resolves.toMatchObject({ conversationId: 'conversation-1' });
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(evaluate.mock.calls[2][0]).toContain('"kind":"update-model"');
  });

  it('observes each DSH workflow event once and rejects projection rewind', async () => {
    const snapshots = [
      { conversationId: 'conversation-1', events: [{ kind: 'message', messageId: 'message-1' }] },
      {
        conversationId: 'conversation-1',
        events: [
          { kind: 'message', messageId: 'message-1' },
          { kind: 'tool', toolCallId: 'tool-1' },
        ],
      },
      { conversationId: 'conversation-1', events: [] },
    ];
    const driver = createDshDesktopAgentDriver({
      evaluate: vi.fn(async () => snapshots.shift()),
    });

    await expect(
      driver.observeWorkflowStep({ conversationId: 'conversation-1' }),
    ).resolves.toMatchObject({ events: [{ messageId: 'message-1' }] });
    await expect(
      driver.observeWorkflowStep({ conversationId: 'conversation-1' }),
    ).resolves.toMatchObject({ events: [{ toolCallId: 'tool-1' }] });
    await expect(driver.observeWorkflowStep({ conversationId: 'conversation-1' })).rejects.toThrow(
      'moved behind',
    );
  });

  it('reconnects the exact DSH Conversation after renderer reload', async () => {
    const connection = { scope: { conversationId: 'conversation-1' } };
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce({ reloading: true })
      .mockResolvedValueOnce({ connection })
      .mockResolvedValueOnce({ conversationId: 'conversation-1', events: [] });
    const waitForRenderer = vi.fn(async () => undefined);
    const driver = createDshDesktopAgentDriver({ evaluate, waitForRenderer });

    await expect(
      driver.reloadAndRestore({ conversationId: 'conversation-1' }),
    ).resolves.toMatchObject({
      accepted: true,
      connection,
      snapshot: { conversationId: 'conversation-1' },
    });
    expect(waitForRenderer).toHaveBeenCalledOnce();
  });

  it('rejects application restore when the visible DSH surface changed Conversation', async () => {
    const evaluate = vi.fn(async () => ({
      connection: { scope: { conversationId: 'conversation-2' } },
    }));
    const restartApplication = vi.fn(async () => undefined);
    const driver = createDshDesktopAgentDriver({ evaluate, restartApplication });

    await expect(driver.restartAndRestore({ conversationId: 'conversation-1' })).rejects.toThrow(
      'does not own the exact requested Conversation',
    );
    expect(restartApplication).toHaveBeenCalledOnce();
  });
});
