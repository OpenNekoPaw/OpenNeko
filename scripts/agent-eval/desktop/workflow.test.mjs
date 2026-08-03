import { describe, expect, it, vi } from 'vitest';
import { executeDesktopAgentWorkflow } from './workflow.mjs';

describe('Desktop Agent workflow interpreter', () => {
  it('executes queue, cancel and feedback through one driver contract', async () => {
    const identity = { conversationId: 'conversation-1', turnId: 'turn-1', runId: 'run-1' };
    const driver = {
      submit: vi
        .fn()
        .mockResolvedValueOnce({ accepted: true, eventOffset: 3 })
        .mockResolvedValueOnce({ accepted: true, eventOffset: 9 }),
      queue: vi.fn(async () => ({ accepted: true, eventOffset: 4 })),
      waitForIdentity: vi.fn(async () => identity),
      cancel: vi.fn(async () => ({ accepted: true, identity })),
      waitForIdle: vi.fn(async () => ({ identity })),
      resume: vi.fn(async () => ({
        accepted: true,
        snapshot: {
          messages: [{ id: 'assistant-1', role: 'assistant', content: 'previous answer' }],
        },
      })),
    };
    const checkpoints = [];
    const result = await executeDesktopAgentWorkflow({
      driver,
      conversationId: 'conversation-1',
      defaultTimeoutMs: 30_000,
      checkpoint: (name, detail) => checkpoints.push({ name, detail }),
      steps: [
        { id: 'submit', kind: 'submit', prompt: 'start' },
        { id: 'queue', kind: 'queue', afterStepId: 'submit', prompt: 'queued' },
        { id: 'cancel', kind: 'cancel', afterStepId: 'queue' },
        { id: 'idle-1', kind: 'wait-for-idle', timeoutMs: 1000 },
        {
          id: 'feedback',
          kind: 'feedback',
          afterStepId: 'idle-1',
          prompt: 'Improve: ${lastAssistant}',
        },
        { id: 'idle-2', kind: 'wait-for-idle', timeoutMs: 1000 },
      ],
    });

    expect(driver.waitForIdentity).toHaveBeenCalledWith('conversation-1', 4, 30_000);
    expect(driver.submit).toHaveBeenLastCalledWith({
      conversationId: 'conversation-1',
      prompt: 'Improve: previous answer',
    });
    expect(result.terminalIdle.identity).toEqual(identity);
    expect(Object.isFrozen(result.receipts)).toBe(true);
    expect(checkpoints).toHaveLength(6);
  });

  it('binds Tool confirmation to public projection identity and supports resume', async () => {
    const identity = { conversationId: 'conversation-1', turnId: 'turn-1', runId: 'run-1' };
    const driver = {
      submit: vi.fn(async () => ({ accepted: true, eventOffset: 3 })),
      waitForPendingTool: vi.fn(async () => ({
        ...identity,
        toolCallId: 'tool-1',
        toolName: 'Write',
      })),
      confirm: vi.fn(async (command) => ({
        accepted: true,
        identity,
        toolCallId: command.toolCallId,
      })),
      waitForIdle: vi.fn(async () => ({ identity })),
      resume: vi.fn(async () => ({
        accepted: true,
        snapshot: {
          messages: [{ id: 'assistant-1', role: 'assistant', content: 'complete' }],
        },
      })),
    };

    const result = await executeDesktopAgentWorkflow({
      driver,
      conversationId: 'conversation-1',
      defaultTimeoutMs: 30_000,
      steps: [
        { id: 'submit', kind: 'submit', prompt: 'start' },
        {
          id: 'confirm',
          kind: 'confirm',
          afterStepId: 'submit',
          toolName: 'Write',
          approved: true,
          timeoutMs: 1000,
        },
        { id: 'idle-1', kind: 'wait-for-idle', timeoutMs: 1000 },
        { id: 'resume', kind: 'resume', conversationRef: 'current' },
        { id: 'idle-2', kind: 'wait-for-idle', timeoutMs: 1000 },
      ],
    });

    expect(driver.waitForPendingTool).toHaveBeenCalledWith('conversation-1', 'Write', 3, 1000);
    expect(driver.confirm).toHaveBeenCalledWith({
      ...identity,
      toolCallId: 'tool-1',
      toolName: 'Write',
      approved: true,
    });
    expect(result.receipts.resume.snapshot.messages).toHaveLength(1);
  });

  it('fails visibly when feedback has no assistant response to reference', async () => {
    const driver = {
      submit: vi.fn(async () => ({ accepted: true, eventOffset: 0 })),
      waitForIdle: vi.fn(async () => ({
        identity: { conversationId: 'conversation-1', turnId: 'turn-1', runId: 'run-1' },
      })),
      resume: vi.fn(async () => ({ accepted: true, snapshot: { messages: [] } })),
    };
    await expect(
      executeDesktopAgentWorkflow({
        driver,
        conversationId: 'conversation-1',
        defaultTimeoutMs: 1000,
        steps: [
          { id: 'submit', kind: 'submit', prompt: 'start' },
          { id: 'idle', kind: 'wait-for-idle', timeoutMs: 1000 },
          {
            id: 'feedback',
            kind: 'feedback',
            afterStepId: 'idle',
            prompt: '${lastAssistant}',
          },
        ],
      }),
    ).rejects.toThrow('requires a non-empty last assistant response');
  });
});
