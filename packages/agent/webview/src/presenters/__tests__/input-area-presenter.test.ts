import { describe, expect, it } from 'vitest';
import type { AgentConfigurationPolicyProjection } from '@neko/agent-contracts';
import { projectAmbientCanvasContext, projectInputAreaUi } from '../input-area-presenter';

describe('input area presenter', () => {
  it('shows execution mode on Entry while a local prerequisite blocks only send', () => {
    expect(
      projectInputAreaUi({
        presentation: 'entry',
        inputValue: 'keep editing',
        attachedFileCount: 0,
        contextChipCount: 0,
        ambientNodeCount: 0,
        mediaModelCallCount: 0,
        isThinking: false,
        disabled: false,
        submissionBlocked: true,
        sessionMode: 'agent',
        conversationKind: 'chat',
        currentSessionMediaModelCount: 0,
      }),
    ).toMatchObject({
      hasText: true,
      canSend: false,
      showExecutionModeSelector: true,
    });
  });

  it('uses projected Character policy to hide unavailable configuration controls', () => {
    expect(
      projectInputAreaUi({
        inputValue: 'hello',
        attachedFileCount: 0,
        contextChipCount: 0,
        ambientNodeCount: 0,
        mediaModelCallCount: 3,
        isThinking: false,
        disabled: false,
        sessionMode: 'agent',
        conversationKind: 'character-dialogue',
        configurationPolicy: characterConfigurationPolicy(),
        currentSessionMediaModelCount: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        canSend: true,
        showModelConfig: false,
        showExecutionModeSelector: false,
        showMediaCallCount: false,
      }),
    );
  });

  it('keeps ordinary chat controls visible in agent mode with media models', () => {
    expect(
      projectInputAreaUi({
        inputValue: '',
        attachedFileCount: 0,
        contextChipCount: 0,
        ambientNodeCount: 0,
        mediaModelCallCount: 1,
        isThinking: false,
        disabled: false,
        sessionMode: 'agent',
        conversationKind: 'chat',
        currentSessionMediaModelCount: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        showModelConfig: true,
        showExecutionModeSelector: true,
        showMediaCallCount: true,
      }),
    );
  });

  it('hides generation controls when no media models are configured', () => {
    expect(
      projectInputAreaUi({
        inputValue: '',
        attachedFileCount: 0,
        contextChipCount: 0,
        ambientNodeCount: 0,
        mediaModelCallCount: 0,
        isThinking: false,
        disabled: false,
        sessionMode: 'agent',
        conversationKind: 'chat',
        currentSessionMediaModelCount: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        showModelConfig: true,
        showExecutionModeSelector: true,
      }),
    );
  });

  it('allows plain Agent text to queue while a response is running', () => {
    expect(
      projectInputAreaUi({
        inputValue: 'next',
        attachedFileCount: 0,
        contextChipCount: 0,
        ambientNodeCount: 0,
        mediaModelCallCount: 0,
        isThinking: true,
        queuedMessageCount: 2,
        disabled: false,
        sessionMode: 'agent',
        conversationKind: 'chat',
        currentSessionMediaModelCount: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        canSend: true,
        canQueue: true,
        canCancel: true,
        queuedMessageCount: 2,
        showQueuedMessages: true,
        inputPlaceholderKey: 'chat.input.queuePlaceholder',
        sendTitleKey: 'chat.input.queue',
      }),
    );
  });

  it('hides the locked Agent mode in the compact Desktop composer', () => {
    expect(
      projectInputAreaUi({
        inputValue: '',
        attachedFileCount: 0,
        contextChipCount: 0,
        ambientNodeCount: 0,
        mediaModelCallCount: 0,
        isThinking: false,
        disabled: false,
        sessionMode: 'agent',
        conversationKind: 'chat',
        currentSessionMediaModelCount: 0,
        compactControls: true,
      }),
    ).toEqual(
      expect.objectContaining({
        showModelConfig: true,
        showExecutionModeSelector: true,
      }),
    );
  });

  it('does not expose queue for rich context while a response is running', () => {
    expect(
      projectInputAreaUi({
        inputValue: 'next',
        attachedFileCount: 1,
        contextChipCount: 0,
        ambientNodeCount: 0,
        mediaModelCallCount: 0,
        isThinking: true,
        disabled: false,
        sessionMode: 'agent',
        conversationKind: 'chat',
        currentSessionMediaModelCount: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        canSend: false,
        canQueue: false,
        canCancel: true,
        sendTitleKey: 'chat.input.send',
      }),
    );
  });

  it('uses the same projected policy for Embody Character configuration controls', () => {
    expect(
      projectInputAreaUi({
        inputValue: '',
        attachedFileCount: 0,
        contextChipCount: 0,
        ambientNodeCount: 0,
        mediaModelCallCount: 1,
        isThinking: false,
        disabled: false,
        sessionMode: 'agent',
        conversationKind: 'embody-character',
        configurationPolicy: characterConfigurationPolicy(),
        currentSessionMediaModelCount: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        showModelConfig: false,
        showExecutionModeSelector: false,
        showMediaCallCount: false,
      }),
    );
  });

  it('summarizes canonical canvas selection and offers the JobCard workflow', () => {
    expect(
      projectAmbientCanvasContext([
        { nodeId: 'markdown-1', type: 'markdown', summary: 'Brief' },
        { nodeId: 'media-1', type: 'media', summary: 'image: keyframe.png' },
        { nodeId: 'group-1', type: 'group', summary: 'Act one (2)' },
      ]),
    ).toMatchObject({
      selectedCount: 3,
      mediaCount: 1,
      jobCount: 0,
      counts: [
        { type: 'markdown', count: 1 },
        { type: 'media', count: 1 },
        { type: 'group', count: 1 },
      ],
      actions: [{ id: 'create-job' }, { id: 'understand-selection' }],
    });
  });

  it('projects a single selected JobCard without old generation actions', () => {
    expect(
      projectAmbientCanvasContext([{ nodeId: 'job-1', type: 'job', summary: 'Draft [queued]' }]),
    ).toMatchObject({
      selectedCount: 1,
      titleNodeSummary: 'Draft [queued]',
      jobCount: 1,
      actions: [{ id: 'create-job' }, { id: 'understand-selection' }],
    });
  });
});

function characterConfigurationPolicy(): AgentConfigurationPolicyProjection {
  const unavailable = {
    status: 'unavailable' as const,
    owner: 'character-version-lin',
    reason: 'Character policy does not expose this configuration field.',
  };
  return {
    request: null,
    fields: {
      model: { effectiveValue: null, source: 'domain-policy', policy: unavailable },
      executionMode: { effectiveValue: null, source: 'domain-policy', policy: unavailable },
      temperature: { effectiveValue: null, source: 'domain-policy', policy: unavailable },
      maximumOutputTokens: { effectiveValue: null, source: 'domain-policy', policy: unavailable },
      thinkingBudget: { effectiveValue: null, source: 'domain-policy', policy: unavailable },
    },
  };
}
