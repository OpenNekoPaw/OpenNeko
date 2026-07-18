import { describe, expect, it } from 'vitest';
import { createResourceFingerprint, createResourceRef, type TaskRunScope } from '@neko/shared';
import {
  AGENT_WEBVIEW_PROTOCOL_VERSION,
  buildAmbientCanvasUpdateMessage,
  buildAgentPhaseMessage,
  buildAgentCapabilityActivationProgressMessage,
  buildAgentSessionDiagnosticMessage,
  buildAgentStateSnapshotMessage,
  buildErrorMessage,
  buildExternalInputMessage,
  buildHistoryClearedMessage,
  buildInjectContextMessage,
  buildMediaTaskCreatedMessage,
  buildMediaTaskProgressMessage,
  buildMessageCancelledMessage,
  buildMessageQueueErrorMessage,
  buildMessageQueueSnapshotMessage,
  buildQueuedMessageEditRequestedMessage,
  buildPluginCommandsMessage,
  buildPluginSlashCommandInvocation,
  buildPluginsAvailableMessage,
  buildStreamTextMessage,
  buildSubAgentEventMessage,
  buildTaskCreatedMessage,
  buildTaskRemovedMessage,
  buildTaskUpdatedMessage,
  buildTasksUpdatedMessage,
  buildThinkingMessage,
  buildToolConfirmationMessage,
  parseSendMessageWebviewMessage,
  parseWebviewToExtensionMessage,
} from '../webview-protocol';
import type { MessageQueuedMessage } from '../webview-protocol';
import type { AgentTurnTimelineAssistantTextItem } from '../agent-turn-timeline';

const cacheResourceRef = createResourceRef({
  scope: 'project',
  provider: 'document-archive',
  kind: 'document',
  source: {
    kind: 'document',
    document: { filePath: '/books/a.epub', format: 'epub' },
    filePath: '/books/a.epub',
  },
  locator: { kind: 'document', entryPath: 'models/character.glb' },
  fingerprint: createResourceFingerprint({
    strategy: 'provider',
    value: 'book-a:character',
    providerId: 'document-archive',
  }),
});

describe('webview protocol parser', () => {
  it('preserves explicit Cut target identity and revision in plugin transfers', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'cut',
        payload: {
          kind: 'singleAsset',
          asset: { path: '/workspace/neko/generated/video/shot.mp4', mediaType: 'video' },
          target: {
            kind: 'file',
            documentUri: 'file:///workspace/edit.nkv',
            expectedProjectRevision: 'revision-1',
          },
        },
      }),
    ).toMatchObject({
      payload: {
        target: {
          kind: 'file',
          documentUri: 'file:///workspace/edit.nkv',
          expectedProjectRevision: 'revision-1',
        },
      },
    });
  });

  it('accepts explicit projection endpoint discovery', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'projectionEndpointDiscover',
        protocolVersion: AGENT_WEBVIEW_PROTOCOL_VERSION,
        realmId: 'realm-1',
      }),
    ).toEqual({
      type: 'projectionEndpointDiscover',
      protocolVersion: AGENT_WEBVIEW_PROTOCOL_VERSION,
      realmId: 'realm-1',
    });
    expect(parseWebviewToExtensionMessage({ type: 'projectionEndpointDiscover' })).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'projectionEndpointDiscover',
        protocolVersion: AGENT_WEBVIEW_PROTOCOL_VERSION + 1,
        realmId: 'realm-1',
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'projectionEndpointDiscover',
        protocolVersion: AGENT_WEBVIEW_PROTOCOL_VERSION,
        realmId: '',
      }),
    ).toBeNull();
  });

  it('accepts projection attachment lifecycle messages with complete identity', () => {
    const key = {
      endpointEpoch: 'endpoint-1',
      attachmentId: 'attachment-1',
      tabId: 'tab-1',
      conversationId: 'conv-1',
    };

    expect(parseWebviewToExtensionMessage({ type: 'projectionAttach', key })).toEqual({
      type: 'projectionAttach',
      key,
    });
    expect(
      parseWebviewToExtensionMessage({
        type: 'projectionSnapshotAck',
        key,
        sequence: 0,
        projectionVersion: 3,
      }),
    ).toEqual({
      type: 'projectionSnapshotAck',
      key,
      sequence: 0,
      projectionVersion: 3,
    });
    expect(
      parseWebviewToExtensionMessage({
        type: 'projectionDetach',
        key,
        reason: 'endpoint-replaced',
      }),
    ).toEqual({ type: 'projectionDetach', key, reason: 'endpoint-replaced' });
  });

  it('rejects the removed Timeline snapshot recovery message', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'requestAgentTurnTimelineSnapshot',
        schemaVersion: 2,
        connectionEpoch: 'epoch-1',
        conversationId: 'conv-1',
        turnId: 'turn-1',
        messageId: 'msg-1',
        reason: 'revision-gap',
        lastAppliedDeliveryRevision: 1,
      }),
    ).toBeNull();
  });

  it('rejects malformed projection attachment lifecycle messages', () => {
    const key = {
      endpointEpoch: 'endpoint-1',
      attachmentId: 'attachment-1',
      tabId: 'tab-1',
      conversationId: 'conv-1',
    };

    for (const field of ['endpointEpoch', 'attachmentId', 'tabId', 'conversationId'] as const) {
      expect(
        parseWebviewToExtensionMessage({
          type: 'projectionAttach',
          key: { ...key, [field]: '' },
        }),
      ).toBeNull();
    }
    expect(
      parseWebviewToExtensionMessage({
        type: 'projectionSnapshotAck',
        key,
        sequence: 1,
        projectionVersion: 3,
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'projectionSnapshotAck',
        key,
        sequence: 0,
        projectionVersion: -1,
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'projectionSnapshotAck',
        key,
        sequence: 0,
        projectionVersion: 1.5,
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'projectionDetach',
        key,
        reason: 'visibility-changed',
      }),
    ).toBeNull();
  });
  it('accepts tabless project search purposes and rejects unknown search purposes', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'searchProjectFiles',
        filter: '',
        purpose: 'roleplay',
      }),
    ).toEqual({
      type: 'searchProjectFiles',
      filter: '',
      purpose: 'roleplay',
    });
    expect(
      parseWebviewToExtensionMessage({
        type: 'searchProjectFiles',
        filter: 'hero',
        purpose: 'entry',
      }),
    ).toEqual({
      type: 'searchProjectFiles',
      filter: 'hero',
      purpose: 'entry',
    });
    expect(
      parseWebviewToExtensionMessage({
        type: 'searchProjectFiles',
        filter: '',
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'searchProjectFiles',
        filter: '',
        conversationId: 'conv-1',
        purpose: 'unknown',
      }),
    ).toBeNull();
  });

  it('requires explicit conversation scope for settings reads and writes', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'getSettings',
        conversationId: 'conv-1',
      }),
    ).toEqual({ type: 'getSettings', conversationId: 'conv-1' });
    expect(parseWebviewToExtensionMessage({ type: 'getSettings' })).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'getConversationSnapshot',
        conversationId: 'conv-1',
      }),
    ).toEqual({ type: 'getConversationSnapshot', conversationId: 'conv-1' });
    expect(parseWebviewToExtensionMessage({ type: 'getConversationSnapshot' })).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'updateSettings',
        conversationId: 'conv-1',
        settings: { executionMode: 'auto' },
      }),
    ).toEqual({
      type: 'updateSettings',
      conversationId: 'conv-1',
      settings: { executionMode: 'auto' },
    });
    expect(
      parseWebviewToExtensionMessage({
        type: 'updateSettings',
        settings: { executionMode: 'auto' },
      }),
    ).toBeNull();
  });

  it('accepts starting Character Dialogue from slash args without conversation scope', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'startCharacterDialogueFromSlash',
        args: 'entity:char-xiaoju --roleplay',
      }),
    ).toEqual({
      type: 'startCharacterDialogueFromSlash',
      args: 'entity:char-xiaoju --roleplay',
    });
  });

  it('accepts an explicit roleplay Candidate confirmation with stable Search identity', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'confirmRoleplayCandidate',
        projectSearchItemId: 'entity-projection:semantic-xiaoju',
        initialUserMessage: '你好，小橘',
      }),
    ).toEqual({
      type: 'confirmRoleplayCandidate',
      projectSearchItemId: 'entity-projection:semantic-xiaoju',
      initialUserMessage: '你好，小橘',
    });
    expect(
      parseWebviewToExtensionMessage({
        type: 'confirmRoleplayCandidate',
        projectSearchItemId: '',
      }),
    ).toBeNull();
  });

  it('accepts message queue commands with explicit conversation and item scope', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'getMessageQueue',
        conversationId: 'conv-1',
      }),
    ).toEqual({
      type: 'getMessageQueue',
      conversationId: 'conv-1',
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'promoteQueuedMessage',
        conversationId: 'conv-1',
        queueItemId: 'queue-1',
      }),
    ).toEqual({
      type: 'promoteQueuedMessage',
      conversationId: 'conv-1',
      queueItemId: 'queue-1',
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'cancelQueuedMessage',
        conversationId: 'conv-1',
        queueItemId: 'queue-1',
      }),
    ).toEqual({
      type: 'cancelQueuedMessage',
      conversationId: 'conv-1',
      queueItemId: 'queue-1',
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'editQueuedMessage',
        tabId: 'tab-1',
        conversationId: 'conv-1',
        queueItemId: 'queue-1',
      }),
    ).toEqual({
      type: 'editQueuedMessage',
      tabId: 'tab-1',
      conversationId: 'conv-1',
      queueItemId: 'queue-1',
    });
  });

  it('requires exact Tab ownership for context injection', () => {
    const payload = {
      type: 'canvas-node' as const,
      id: 'node-1',
      label: 'Selected node',
      summary: 'Selected Canvas node',
      data: { nodeId: 'node-1' },
    };

    expect(
      buildInjectContextMessage(payload, {
        tabId: 'tab-1',
        conversationId: 'conv-1',
      }),
    ).toEqual({
      type: 'injectContext',
      tabId: 'tab-1',
      conversationId: 'conv-1',
      payload,
    });
    expect(() =>
      buildInjectContextMessage(payload, { tabId: '', conversationId: 'conv-1' }),
    ).toThrow('injectContext requires non-empty tabId');
    expect(() =>
      buildInjectContextMessage(payload, { tabId: 'tab-1', conversationId: '' }),
    ).toThrow('injectContext requires non-empty conversationId');
  });

  it('correlates queued edit responses to the requesting Tab', () => {
    expect(
      buildQueuedMessageEditRequestedMessage({
        tabId: 'tab-1',
        conversationId: 'conv-1',
        item: {
          id: 'queue-1',
          conversationId: 'conv-1',
          content: 'continue',
          createdAt: 1,
          source: 'composer',
        },
        snapshot: {
          conversationId: 'conv-1',
          pendingCount: 0,
          version: 2,
          items: [],
        },
      }),
    ).toMatchObject({
      type: 'queuedMessageEditRequested',
      tabId: 'tab-1',
      conversationId: 'conv-1',
    });
    expect(() =>
      buildQueuedMessageEditRequestedMessage({
        tabId: '',
        conversationId: 'conv-1',
        item: {
          id: 'queue-1',
          conversationId: 'conv-1',
          content: 'continue',
          createdAt: 1,
          source: 'composer',
        },
        snapshot: {
          conversationId: 'conv-1',
          pendingCount: 0,
          version: 2,
          items: [],
        },
      }),
    ).toThrow('queuedMessageEditRequested requires non-empty tabId');
  });

  it('requires the complete Task run scope and preserves optional displayed result refs', () => {
    const scope = taskScope('task-1');
    expect(
      parseWebviewToExtensionMessage({
        type: 'viewTaskResult',
        taskScope: scope,
        resultRef: 'generated-assets/asset-1.png',
      }),
    ).toEqual({
      type: 'viewTaskResult',
      taskScope: scope,
      resultRef: 'generated-assets/asset-1.png',
    });
  });

  it('rejects legacy Task action identities even when conversationId is present', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'cancelTask',
        conversationId: 'conv-1',
        taskId: 'task-1',
      }),
    ).toBeNull();
    expect(parseWebviewToExtensionMessage({ type: 'cancelTask', taskId: 'task-1' })).toBeNull();
  });

  it('rejects message queue commands without required explicit scope', () => {
    expect(parseWebviewToExtensionMessage({ type: 'getMessageQueue' })).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'promoteQueuedMessage',
        queueItemId: 'queue-1',
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'cancelQueuedMessage',
        conversationId: 'conv-1',
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'editQueuedMessage',
        conversationId: 'conv-1',
        queueItemId: 'queue-1',
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'editQueuedMessage',
        tabId: 'tab-1',
        conversationId: 'conv-1',
        queueItemId: '',
      }),
    ).toBeNull();
  });

  it('accepts agent-mode purpose models as flat explicit model refs', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'Generate mixed media',
        sessionMode: 'agent',
        chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
        purposeModels: {
          'image.generate': { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
          'video.generate': { providerId: 'runway', modelId: 'gen-4', category: 'video' },
          'audio.generate': { providerId: 'suno', modelId: 'v4', category: 'audio' },
          'image.understand': { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'sendMessage',
        conversationId: 'conv-1',
        sessionMode: 'agent',
        purposeModels: {
          'image.generate': { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
          'video.generate': { providerId: 'runway', modelId: 'gen-4', category: 'video' },
          'audio.generate': { providerId: 'suno', modelId: 'v4', category: 'audio' },
          'image.understand': { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
        },
      }),
    );
  });

  it('accepts agent model slots and normalized LLM config for agent messages', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'develop the opening scene',
        sessionMode: 'agent',
        agentModels: {
          primary: { providerId: 'openai', modelId: 'gpt-5.5', category: 'llm' },
          deep: { providerId: 'openai', modelId: 'gpt-5.5-pro', category: 'llm' },
        },
        llmConfig: {
          reasoningPreset: 'balanced',
          verbosityPreset: 'standard',
          creativityPreset: 'creative',
          advanced: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 4096,
            reasoningEffort: 'medium',
            thinkingBudget: 2048,
            verbosity: 'medium',
            serviceTier: 'default',
          },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'sendMessage',
        conversationId: 'conv-1',
        sessionMode: 'agent',
        agentModels: {
          primary: { providerId: 'openai', modelId: 'gpt-5.5', category: 'llm' },
          deep: { providerId: 'openai', modelId: 'gpt-5.5-pro', category: 'llm' },
        },
        llmConfig: {
          reasoningPreset: 'balanced',
          verbosityPreset: 'standard',
          creativityPreset: 'creative',
          advanced: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 4096,
            reasoningEffort: 'medium',
            thinkingBudget: 2048,
            verbosity: 'medium',
            serviceTier: 'default',
          },
        },
      }),
    );
  });

  it('rejects unknown agent model slots and non-LLM slot refs', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        agentModels: {
          judge: { providerId: 'openai', modelId: 'gpt-5.5', category: 'llm' },
        },
      }),
    ).toBeNull();

    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        agentModels: {
          primary: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        },
      }),
    ).toBeNull();
  });

  it('rejects invalid agent LLM config preset and advanced values', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        llmConfig: { reasoningPreset: 'maximum' },
      }),
    ).toBeNull();

    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        llmConfig: { advanced: { maxOutputTokens: -1 } },
      }),
    ).toBeNull();
  });

  it('rejects agent LLM config payloads outside agent mode', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'draw',
        sessionMode: 'image',
        mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        llmConfig: { reasoningPreset: 'fast' },
      }),
    ).toBeNull();
  });

  it('rejects legacy raw LLM parameter fields at the sendMessage boundary', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        temperature: 0.7,
      }),
    ).toBeNull();
  });

  it('accepts structured context payloads on sendMessage', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'summarize',
        sessionMode: 'agent',
        contextPayloads: [
          {
            type: 'document-selection',
            id: 'selection-1',
            label: 'Selection',
            summary: 'Selected document text',
            data: { selectedText: 'hello' },
          },
        ],
      }),
    ).toMatchObject({
      type: 'sendMessage',
      conversationId: 'conv-1',
      contextPayloads: [
        {
          type: 'document-selection',
          id: 'selection-1',
          label: 'Selection',
          summary: 'Selected document text',
          data: { selectedText: 'hello' },
        },
      ],
    });
  });

  it('accepts a validated purpose-aware 3D reference context', () => {
    const data = {
      contractVersion: 1,
      staging: {
        schemaVersion: 1,
        sessionId: 'session-1',
        revision: 2,
        subject: {
          kind: 'builtin-preset',
          presetId: 'guide-neutral-mannequin',
          presetVersion: 1,
          fingerprint: 'preset-fingerprint',
          presetKind: 'mannequin',
          appearancePolicy: 'guide-only',
          allowedPurposes: ['pose', 'camera'],
        },
        selectedPurposes: ['pose'],
        camera: {
          cameraId: 'camera-front',
          position: { x: 0, y: 1.4, z: 4 },
          target: { x: 0, y: 1, z: 0 },
          fieldOfViewDeg: 45,
          aspectRatio: 1,
        },
        pose: {
          poseId: 'pose-standing',
          joints: [{ jointId: 'hips', rotation: { x: 0, y: 0, z: 0, order: 'XYZ' } }],
        },
      },
      outputs: [
        {
          kind: 'pose',
          sessionId: 'session-1',
          revision: 2,
          controlImage: cacheResourceRef,
          controlMode: 'pose',
          joints: [{ jointId: 'hips', rotation: { x: 0, y: 0, z: 0, order: 'XYZ' } }],
        },
      ],
    };

    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'Use this pose',
        sessionMode: 'agent',
        contextPayloads: [
          {
            type: '3d-reference',
            id: '3d-reference:session-1:2',
            label: 'Neutral mannequin',
            summary: 'Pose reference',
            data,
          },
        ],
      }),
    ).toMatchObject({
      type: 'sendMessage',
      contextPayloads: [{ type: '3d-reference', data }],
    });
  });

  it('accepts Canvas storyboard action intent context payloads on sendMessage', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'handle storyboard action',
        sessionMode: 'agent',
        contextPayloads: [
          {
            type: 'canvas-storyboard-action-intent',
            id: 'shot-1:generate-video',
            label: 'Storyboard action: generate-video',
            summary: 'Canvas storyboard action generate-video for shot-1',
            data: {
              intent: {
                version: 1,
                actionId: 'generate-video',
                target: { nodeId: 'shot-1', sceneNodeId: 'scene-1', shotNumber: 1 },
              },
            },
          },
        ],
      }),
    ).toMatchObject({
      type: 'sendMessage',
      contextPayloads: [
        {
          type: 'canvas-storyboard-action-intent',
          id: 'shot-1:generate-video',
        },
      ],
    });
  });

  it('rejects removed model context discriminators on sendMessage', () => {
    const base = {
      type: 'sendMessage',
      conversationId: 'conversation-1',
      message: 'Use this model',
      sessionMode: 'agent',
    };
    const legacyContext = legacyModelPreviewContextData();
    expect(
      parseSendMessageWebviewMessage({
        ...base,
        contextPayloads: [
          { type: 'model-scene', id: 'legacy', label: 'Legacy', summary: '', data: {} },
        ],
      }),
    ).toBeNull();
    expect(
      parseSendMessageWebviewMessage({
        ...base,
        contextPayloads: [
          {
            type: 'model-preview',
            id: 'model',
            label: 'Model',
            summary: '',
            data: legacyContext,
          },
        ],
      }),
    ).toBeNull();
  });

  it('rejects unknown context types while keeping package-owned context data opaque', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'summarize',
        sessionMode: 'agent',
        contextPayloads: [
          {
            type: 'unknown-context',
            id: 'selection-1',
            label: 'Selection',
            summary: 'Selected document text',
            data: {},
          },
        ],
      }),
    ).toBeNull();

    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'handle storyboard action',
        sessionMode: 'agent',
        contextPayloads: [
          {
            type: 'canvas-storyboard-action-intent',
            id: 'bad',
            label: 'Bad storyboard action',
            summary: 'Bad storyboard action',
            data: { intent: { version: 1, actionId: 'future-action', target: { nodeId: 'shot' } } },
          },
        ],
      }),
    ).toMatchObject({
      type: 'sendMessage',
      contextPayloads: [
        {
          type: 'canvas-storyboard-action-intent',
          id: 'bad',
          data: { intent: { actionId: 'future-action' } },
        },
      ],
    });
  });

  it('rejects sendMessage payloads without explicit conversation scope', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        message: 'hello',
        sessionMode: 'agent',
      }),
    ).toBeNull();
  });

  it('rejects legacy provider/model fields at the shared boundary', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        providerId: 'openai',
        modelId: 'gpt-4.1',
      }),
    ).toBeNull();
  });

  it('rejects purposeModels outside agent mode', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'draw',
        sessionMode: 'image',
        mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        purposeModels: {
          'image.generate': { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        },
      }),
    ).toBeNull();
  });

  it('rejects agent purpose model selections with mismatched categories', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'Generate mixed media',
        sessionMode: 'agent',
        purposeModels: {
          'image.generate': { providerId: 'runway', modelId: 'gen-4', category: 'video' },
        },
      }),
    ).toBeNull();
  });

  it('requires non-agent mediaModel category to match session mode', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'draw',
        sessionMode: 'image',
        mediaModel: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
      }),
    ).toBeNull();
  });

  it('rejects top-level music session mode and model category', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'compose',
        sessionMode: 'music',
        mediaModel: { providerId: 'suno', modelId: 'chirp', category: 'music' },
      }),
    ).toBeNull();

    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'Generate mixed media',
        sessionMode: 'agent',
        purposeModels: {
          'audio.generate': { providerId: 'suno', modelId: 'chirp', category: 'music' },
        },
      }),
    ).toBeNull();
  });

  it('accepts music-capable audio models as audio media model refs', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'compose',
        sessionMode: 'audio',
        mediaModel: { providerId: 'suno', modelId: 'chirp', category: 'audio' },
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'sendMessage',
        conversationId: 'conv-1',
        sessionMode: 'audio',
        mediaModel: { providerId: 'suno', modelId: 'chirp', category: 'audio' },
      }),
    );
  });

  it('rejects single mediaModel in agent mode', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'draw',
        sessionMode: 'agent',
        mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
      }),
    ).toBeNull();
  });

  it('accepts Embody Character tabs only with session projections', () => {
    const openTabs = [
      {
        id: 'tab-embody',
        title: 'Embody: 小橘',
        conversationId: 'embody-session-1',
        kind: 'embody-character' as const,
        embodyCharacterSession: {
          sessionId: 'embody-session-1',
          entityId: 'char-xiaoju',
          displayName: '小橘',
          profile: {
            entityRef: {
              entityId: 'char-xiaoju',
              entityKind: 'character' as const,
              projectRoot: '/workspace',
              source: 'neko-entity',
            },
            displayName: '小橘',
            aliases: [],
            facts: [],
            sparsity: 'thin' as const,
          },
          scopeSummary: ['project: current project'],
          summary: 'User embodies 小橘.',
          startedAt: '2026-06-02T00:00:00.000Z',
          status: 'active' as const,
        },
      },
    ];

    expect(
      parseWebviewToExtensionMessage({
        type: 'updateTabState',
        expectedTabStateRevision: 3,
        openTabs,
        activeTabId: 'tab-embody',
      }),
    ).toEqual({
      type: 'updateTabState',
      expectedTabStateRevision: 3,
      openTabs: [
        expect.objectContaining({
          kind: 'embody-character',
          embodyCharacterSession: expect.objectContaining({ sessionId: 'embody-session-1' }),
        }),
      ],
      activeTabId: 'tab-embody',
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'updateTabState',
        expectedTabStateRevision: 3,
        openTabs: [
          {
            id: 'tab-embody',
            title: 'Embody: 小橘',
            conversationId: 'embody-session-1',
            kind: 'embody-character',
            embodyCharacterContext: {
              contextId: 'legacy-hidden-context',
            },
          },
        ],
        activeTabId: 'tab-embody',
      }),
    ).toEqual({
      type: 'updateTabState',
      expectedTabStateRevision: 3,
      openTabs: [
        {
          id: 'tab-embody',
          title: 'Embody: 小橘',
          conversationId: 'embody-session-1',
          kind: 'embody-character',
        },
      ],
      activeTabId: 'tab-embody',
    });
  });
});

function legacyModelPreviewContextData(): Record<string, unknown> {
  const camera = {
    id: 'camera-default',
    label: 'Default',
    position: { x: 3, y: 2, z: 3 },
    target: { x: 0, y: 0, z: 0 },
    fieldOfViewDeg: 45,
  };
  const staging = {
    schemaVersion: 3,
    sessionId: 'session-legacy',
    sourceFingerprint: 'legacy-fingerprint',
    revision: 1,
    transformPatches: [],
    cameraPresets: [camera],
    activeCameraId: camera.id,
    lightRig: {
      environmentIntensity: 1,
      lights: [
        { id: 'key', color: '#fff', intensity: 3, position: { x: 1, y: 2, z: 3 } },
        { id: 'fill', color: '#fff', intensity: 1, position: { x: -1, y: 1, z: 2 } },
        { id: 'rim', color: '#fff', intensity: 2, position: { x: 0, y: 2, z: -2 } },
      ],
    },
    background: '#1e1e1e',
    capture: { width: 1024, height: 1024 },
  };
  return {
    contractVersion: 1,
    source: cacheResourceRef,
    sourceFingerprint: 'legacy-fingerprint',
    format: 'glb',
    facts: {
      bounds: {
        min: { x: -1, y: -1, z: -1 },
        max: { x: 1, y: 1, z: 1 },
        center: { x: 0, y: 0, z: 0 },
        size: { x: 2, y: 2, z: 2 },
        radius: 1.7,
      },
      nodeCount: 2,
      meshCount: 1,
      materialCount: 1,
      animationCount: 0,
    },
    staging,
    previewImage: cacheResourceRef,
    capture: {
      sessionId: staging.sessionId,
      sourceFingerprint: staging.sourceFingerprint,
      revision: staging.revision,
      mimeType: 'image/png',
      width: 1024,
      height: 1024,
      cameraId: camera.id,
    },
  };
}

function makeTimelineTextItem(input: {
  itemId: string;
  sequence: number;
  content: string;
}): AgentTurnTimelineAssistantTextItem {
  return {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
    itemId: input.itemId,
    sequence: input.sequence,
    itemRevision: 1,
    kind: 'assistant_text',
    status: 'streaming',
    payload: {
      content: input.content,
      format: 'markdown',
      sourceGeneration: 1,
    },
    createdAt: 1777392000000 + input.sequence,
    updatedAt: 1777392000000 + input.sequence,
  };
}

function taskScope(childRunId: string): TaskRunScope {
  return {
    conversationId: 'conv-1',
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'task',
  };
}
