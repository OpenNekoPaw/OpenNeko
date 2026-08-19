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
  });

  it('rejects construction without the renderer boundary', () => {
    expect(() => createDshDesktopAgentDriver({})).toThrow(
      'renderer evaluate function',
    );
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
    expect(evaluate).toHaveBeenCalledOnce();
  });
});
