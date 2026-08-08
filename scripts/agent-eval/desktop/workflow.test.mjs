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
      observeWorkflowStep: vi.fn(async ({ afterEventOffset }) => ({
        conversationId: 'conversation-1',
        messages: [],
        messageQueue: {
          conversationId: 'conversation-1',
          pendingCount: afterEventOffset === 4 ? 1 : 0,
          sequence: 1,
          pausedAfterCancel: false,
          items: [],
        },
        queued: afterEventOffset === 4,
        projectionEvents: [],
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
    expect(result.conversationId).toBe('conversation-1');
    expect(result.terminalIdle.identity).toEqual(identity);
    expect(Object.isFrozen(result.receipts)).toBe(true);
    expect(result.steps).toHaveLength(6);
    expect(result.steps[1]).toMatchObject({
      id: 'queue',
      method: 'message.submit',
      queued: true,
      snapshot: { messageQueue: { pendingCount: 1 } },
    });
    expect(checkpoints).toHaveLength(6);
  });

  it('binds a visible first submission and application restart to the established conversation', async () => {
    const identity = { conversationId: 'conversation-1', turnId: 'turn-2', runId: 'run-2' };
    const driver = {
      submit: vi.fn(async (command) => ({
        accepted: true,
        eventOffset: 3,
        conversationId: command.conversationId ?? 'conversation-1',
      })),
      waitForIdle: vi.fn(async () => ({ identity })),
      restart: vi.fn(async () => ({
        accepted: true,
        snapshot: { id: 'conversation-1', messages: [{ role: 'user', content: 'first' }] },
      })),
    };

    const result = await executeDesktopAgentWorkflow({
      driver,
      defaultTimeoutMs: 30_000,
      steps: [
        { id: 'submit', kind: 'submit', prompt: 'first' },
        { id: 'idle-1', kind: 'wait-for-idle', timeoutMs: 1000 },
        { id: 'restart', kind: 'restart', conversationRef: 'current' },
        { id: 'continue', kind: 'submit', prompt: 'continue' },
        { id: 'idle-2', kind: 'wait-for-idle', timeoutMs: 1000 },
      ],
    });

    expect(driver.submit).toHaveBeenNthCalledWith(1, { prompt: 'first' });
    expect(driver.restart).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      timeoutMs: 30_000,
    });
    expect(driver.submit).toHaveBeenNthCalledWith(2, {
      conversationId: 'conversation-1',
      prompt: 'continue',
    });
    expect(result.conversationId).toBe('conversation-1');
    expect(result.receipts.restart.snapshot.messages).toHaveLength(1);
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
      submit: vi.fn(async () => ({
        accepted: true,
        eventOffset: 0,
        conversationId: 'conversation-1',
      })),
      waitForIdentity: vi.fn(async () => identity),
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

  it('projects explicit per-Turn model snapshots and typed Session input receipts', async () => {
    let turn = 0;
    const driver = {
      submit: vi.fn(async () => ({ accepted: true, eventOffset: turn++ })),
      waitForIdle: vi.fn(async (conversationId) => ({
        identity: { conversationId, turnId: `turn-${turn}`, runId: `run-${turn}` },
      })),
      readFacts: vi.fn(async (identity) => ({
        status: 'facts',
        facts: { identity, configuration: { effective: { values: {} } } },
      })),
      invokeInput: vi.fn(async (command) => ({
        accepted: true,
        trigger: command.trigger,
        name: command.name,
        result: { type: command.resultEvent, conversationId: command.conversationId },
      })),
    };
    const modelProfiles = [
      {
        id: 'model-a',
        selection: 'explicit',
        chat: { providerId: 'provider', modelId: 'model-a' },
      },
      {
        id: 'model-b',
        selection: 'explicit',
        chat: { providerId: 'provider', modelId: 'model-b' },
      },
    ];

    const result = await executeDesktopAgentWorkflow({
      driver,
      conversationId: 'conversation-1',
      defaultTimeoutMs: 1000,
      modelProfiles,
      steps: [
        { id: 'first', kind: 'submit', prompt: 'first', modelProfileId: 'model-a' },
        { id: 'first-idle', kind: 'wait-for-idle', timeoutMs: 1000 },
        {
          id: 'compact',
          kind: 'invoke-input',
          trigger: 'command',
          name: 'compact',
          resultEvent: 'compressionResult',
          timeoutMs: 1000,
        },
        { id: 'second', kind: 'submit', prompt: 'second', modelProfileId: 'model-b' },
        { id: 'second-idle', kind: 'wait-for-idle', timeoutMs: 1000 },
      ],
    });

    expect(driver.submit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        chatModel: { providerId: 'provider', modelId: 'model-a', category: 'llm' },
      }),
    );
    expect(driver.submit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        chatModel: { providerId: 'provider', modelId: 'model-b', category: 'llm' },
      }),
    );
    expect(result.receipts['first-idle'].facts.identity.turnId).toBe('turn-1');
    expect(result.receipts.compact.result.type).toBe('compressionResult');
    expect(result.steps[2]).toMatchObject({ method: 'agent-input.invoke', accepted: true });
  });

  it('preserves Draft rejection receipts and updates future-Turn configuration while running', async () => {
    const identity = { conversationId: 'conversation-1', turnId: 'turn-1', runId: 'run-1' };
    const driver = {
      bindDraft: vi.fn(async () => ({ accepted: true, catalogRef: 'assistant-binding' })),
      submitDraft: vi.fn(async () => ({
        accepted: false,
        status: 'rejected',
        catalogRef: 'initial',
      })),
      prepareSessionAfterDraft: vi.fn(async () => ({ reloading: true })),
      submit: vi.fn(async () => ({
        accepted: true,
        eventOffset: 0,
        conversationId: 'conversation-1',
      })),
      waitForIdentity: vi.fn(async () => identity),
      updateConfiguration: vi.fn(async () => ({
        accepted: true,
        status: 'applied',
        conversationId: 'conversation-1',
        providerId: 'provider',
        modelId: 'model-b',
      })),
      waitForIdle: vi.fn(async () => ({ identity })),
    };

    const result = await executeDesktopAgentWorkflow({
      driver,
      defaultTimeoutMs: 1000,
      steps: [
        { id: 'assistant-binding', kind: 'draft-bind', target: 'assistant' },
        {
          id: 'stale-submit',
          kind: 'draft-submit',
          catalogRef: 'initial',
          input: { kind: 'message', text: 'hello' },
          expectedStatus: 'rejected',
        },
        { id: 'first', kind: 'submit', prompt: 'first' },
        {
          id: 'model-update',
          kind: 'update-configuration',
          afterStepId: 'first',
          providerId: 'provider',
          modelId: 'model-b',
          expectedStatus: 'applied',
          turnState: 'running',
          timeoutMs: 1000,
        },
        { id: 'idle', kind: 'wait-for-idle', timeoutMs: 1000 },
      ],
    });

    expect(driver.prepareSessionAfterDraft).toHaveBeenCalledOnce();
    expect(driver.updateConfiguration).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      providerId: 'provider',
      modelId: 'model-b',
      expectedStatus: 'applied',
      turnState: 'running',
      runningTurnIdentity: identity,
      timeoutMs: 1000,
    });
    expect(result.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'stale-submit', method: 'draft.input.submit' }),
        expect.objectContaining({
          id: 'model-update',
          method: 'conversation.configuration.update',
        }),
      ]),
    );
  });
});
