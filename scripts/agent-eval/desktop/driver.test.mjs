import { describe, expect, it, vi } from 'vitest';
import { createDesktopAgentDriver, driverExpression } from './driver.mjs';

describe('Desktop Agent external driver adapter', () => {
  it('uses only the renderer/preload public Agent bridge for every operation', async () => {
    const evaluate = vi.fn(async () => ({ accepted: true }));
    const driver = createDesktopAgentDriver({ evaluate });
    await driver.connect({ projectId: 'project-1', viewId: 'view-1', viewEpoch: 1 });
    await driver.createConversation();
    await driver.submit({
      conversationId: 'conversation-1',
      prompt: 'hello',
      contextPayloads: [
        {
          type: 'cut-clip',
          id: 'cut:clip-1',
          label: 'Clip 1',
          summary: 'Explicit Cut Clip',
          data: { clipId: 'clip-1' },
        },
      ],
    });
    await driver.queue({ conversationId: 'conversation-1', prompt: 'follow up' });
    await driver.cancel({ conversationId: 'conversation-1', turnId: 'turn-1', runId: 'run-1' });
    await driver.confirm({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
      toolCallId: 'tool-call-1',
      approved: true,
    });
    await driver.resume({ conversationId: 'conversation-1' });
    await driver.readProjection('conversation-1');
    await driver.waitForIdle('conversation-1', 30_000);
    await driver.readFacts({
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
    });
    await driver.reloadRenderer();
    await driver.closeApplication();
    await driver.dispose();

    expect(evaluate).toHaveBeenCalledTimes(13);
    const expressions = evaluate.mock.calls.map(([expression]) => expression).join('\n');
    expect(expressions).toContain('window.openNekoDesktop?.agent');
    expect(expressions).toContain("type: 'sendMessage'");
    expect(expressions).toContain('contextPayloads');
    expect(expressions).toContain("type: 'newConversation'");
    expect(expressions).toContain("type: 'confirmTool'");
    expect(expressions).toContain("kind: 'wait-for-idle'");
    expect(expressions).toContain("kind: 'read-facts'");
    expect(expressions).toContain("kind: 'reload-renderer'");
    expect(expressions).toContain("kind: 'close-application'");
    expect(expressions).not.toMatch(
      /ipcRenderer|DesktopAgentWorkspaceRuntime|PiConversationRuntime|AgentSession/iu,
    );
  });

  it('keeps cancel and confirmation bound to observed conversation/turn/run identity', () => {
    const expression = driverExpression({
      kind: 'confirm',
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      runId: 'run-1',
      toolCallId: 'tool-call-1',
      approved: false,
    });
    expect(expression).toContain('assertObservedIdentity(state, command)');
    expect(expression).toContain('operation identity was not observed');
  });

  it('fails as infrastructure-blocked when no renderer evaluator exists', () => {
    expect(() => createDesktopAgentDriver({})).toThrow('requires a CDP renderer evaluate function');
  });
});
