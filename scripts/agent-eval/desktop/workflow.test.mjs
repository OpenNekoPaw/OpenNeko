import { describe, expect, it, vi } from 'vitest';
import { executeDesktopAgentWorkflow } from './workflow.mjs';

describe('Desktop Agent workflow interpreter', () => {
  it('binds a visible first submission and application restart to the established conversation', async () => {
    const identity = { conversationId: 'conversation-1', dshSessionId: 'dsh-session-1', turn: 2 };
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
    const identity = { conversationId: 'conversation-1', dshSessionId: 'dsh-session-1', turn: 1 };
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
      waitForIdentity: vi.fn(async () => ({
        conversationId: 'conversation-1',
        dshSessionId: 'dsh-session-1',
        turn: 1,
      })),
      waitForIdle: vi.fn(async () => ({
        identity: { conversationId: 'conversation-1', dshSessionId: 'dsh-session-1', turn: 1 },
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
        identity: { conversationId, dshSessionId: 'dsh-session-1', turn },
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
    expect(result.receipts['first-idle'].facts.identity.turn).toBe(1);
    expect(result.receipts.compact.result.type).toBe('compressionResult');
    expect(result.steps[2]).toMatchObject({ method: 'agent-input.invoke', accepted: true });
  });

  it('updates the exact idle Session configuration', async () => {
    const identity = { conversationId: 'conversation-1', dshSessionId: 'dsh-session-1', turn: 1 };
    const driver = {
      submit: vi.fn(async () => ({
        accepted: true,
        eventOffset: 0,
        conversationId: 'conversation-1',
      })),
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
        { id: 'first', kind: 'submit', prompt: 'first' },
        { id: 'first-idle', kind: 'wait-for-idle', timeoutMs: 1000 },
        {
          id: 'model-update',
          kind: 'update-configuration',
          providerId: 'provider',
          modelId: 'model-b',
          expectedStatus: 'applied',
          turnState: 'idle',
          timeoutMs: 1000,
        },
        { id: 'second', kind: 'submit', prompt: 'second' },
        { id: 'second-idle', kind: 'wait-for-idle', timeoutMs: 1000 },
      ],
    });

    expect(driver.updateConfiguration).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      providerId: 'provider',
      modelId: 'model-b',
      expectedStatus: 'applied',
      turnState: 'idle',
      timeoutMs: 1000,
    });
    expect(result.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'model-update',
          method: 'conversation.configuration.update',
        }),
      ]),
    );
  });

  it('binds an explicit follow-up model to an active-session Composer workflow', async () => {
    const identity = { conversationId: 'conversation-1', dshSessionId: 'dsh-session-1', turn: 2 };
    const driver = {
      submitWithFollowup: vi.fn(async () => ({ accepted: true })),
      waitForIdle: vi.fn(async () => ({ identity })),
    };

    await executeDesktopAgentWorkflow({
      driver,
      conversationId: 'conversation-1',
      defaultTimeoutMs: 1000,
      modelProfiles: [
        {
          id: 'next-model',
          selection: 'explicit',
          chat: { providerId: 'provider', modelId: 'model-b' },
        },
      ],
      steps: [
        {
          id: 'active-followup',
          kind: 'submit-with-followup',
          prompt: 'first',
          followupPrompt: 'second',
          followupModelProfileId: 'next-model',
          delivery: 'send-now',
          activeTimeoutMs: 1000,
        },
        { id: 'idle', kind: 'wait-for-idle', timeoutMs: 1000 },
      ],
    });

    expect(driver.submitWithFollowup).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      prompt: 'first',
      followupPrompt: 'second',
      delivery: 'send-now',
      activeTimeoutMs: 1000,
      followupChatModel: { providerId: 'provider', modelId: 'model-b', category: 'llm' },
    });
  });
});
