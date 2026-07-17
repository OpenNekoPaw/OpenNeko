import { describe, expect, it } from 'vitest';
import { projectAmbientCanvasContext, projectInputAreaUi } from '../input-area-presenter';

describe('input area presenter', () => {
  it('hides creative authoring controls for Character Dialogue conversations', () => {
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
        availableMediaModelCount: 0,
        currentSessionMediaModelCount: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        canSend: true,
        showSessionModeSelector: false,
        showChatModelSelector: false,
        showSessionMediaModelSelector: false,
        showGenerationParams: false,
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
        availableMediaModelCount: 1,
        currentSessionMediaModelCount: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        showSessionModeSelector: true,
        showChatModelSelector: true,
        showGenerationParams: true,
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
        availableMediaModelCount: 0,
        currentSessionMediaModelCount: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        showSessionModeSelector: true,
        showChatModelSelector: true,
        showSessionMediaModelSelector: false,
        showGenerationParams: false,
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
        availableMediaModelCount: 0,
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
        availableMediaModelCount: 0,
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

  it('hides creative authoring controls for Embody Character conversations', () => {
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
        availableMediaModelCount: 1,
        currentSessionMediaModelCount: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        showSessionModeSelector: false,
        showChatModelSelector: false,
        showGenerationParams: false,
        showExecutionModeSelector: false,
        showMediaCallCount: false,
      }),
    );
  });

  it('summarizes ambient canvas selection and recommends generation actions', () => {
    expect(
      projectAmbientCanvasContext([
        { nodeId: 'shot-1', type: 'shot', summary: '#1 wide shot' },
        { nodeId: 'shot-2', type: 'shot', summary: '#2 close-up' },
        { nodeId: 'scene-1', type: 'scene', summary: 'Scene 1: Gate' },
      ]),
    ).toMatchObject({
      selectedCount: 3,
      shotCount: 2,
      sceneCount: 1,
      counts: [
        { type: 'shot', count: 2 },
        { type: 'scene', count: 1 },
      ],
      actions: [
        { id: 'batch-generate-images' },
        { id: 'optimize-selection' },
        { id: 'understand-selection' },
      ],
    });
  });

  it('projects a single selected canvas node without inventing batch actions', () => {
    expect(
      projectAmbientCanvasContext([{ nodeId: 'shot-1', type: 'shot', summary: '#1 wide shot' }]),
    ).toMatchObject({
      selectedCount: 1,
      titleNodeSummary: '#1 wide shot',
      actions: [{ id: 'generate-image' }, { id: 'understand-selection' }],
    });
  });
});
