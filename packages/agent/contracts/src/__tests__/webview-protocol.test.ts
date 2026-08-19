import { describe, expect, it } from 'vitest';
import {
  buildInjectContextMessage,
  buildQueuedMessageReleasedMessage,
  buildQueuedMessageEditRequestedMessage,
  parseAmbientCanvasUpdateNodes,
  parseSendMessageWebviewMessage,
  parseAgentWebviewToHostMessage,
} from '../webview-protocol';

const contentLocator = {
  kind: 'document-entry' as const,
  source: {
    kind: 'workspace-file' as const,
    path: 'books/a.epub',
    fingerprint: { strategy: 'provider' as const, value: 'book-a' },
  },
  entryPath: 'models/character.glb',
};

describe('webview protocol parser', () => {
  it('parses sendMessage canvasTurnTarget exact and rejects invalid target', () => {
    const target = {
      workspaceId: 'workspace-1',
      target: {
        kind: 'exact-canvas' as const,
        workspaceId: 'workspace-1',
        canvasId: 'neko/boards/a.nkc',
      },
      summary: { canvasId: 'neko/boards/a.nkc', name: 'A' },
    };
    const message = parseSendMessageWebviewMessage({
      type: 'sendMessage',
      conversationId: 'conv-1',
      message: 'hi',
      sessionMode: 'agent',
      canvasTurnTarget: target,
    });
    expect(message?.canvasTurnTarget).toEqual(target);
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hi',
        sessionMode: 'agent',
        canvasTurnTarget: {
          workspaceId: 'workspace-1',
          target: { kind: 'exact-canvas', workspaceId: 'workspace-1', canvasId: 'x' },
        },
      }),
    ).toBeNull();
  });

  it('accepts canonical ambient Canvas nodes and rejects removed node types', () => {
    expect(
      parseAmbientCanvasUpdateNodes([
        { nodeId: 'markdown-1', type: 'markdown', summary: 'Creative brief' },
        { nodeId: 'job-1', type: 'job', summary: 'Generate keyframes' },
      ]),
    ).toEqual([
      { nodeId: 'markdown-1', type: 'markdown', summary: 'Creative brief' },
      { nodeId: 'job-1', type: 'job', summary: 'Generate keyframes' },
    ]);

    expect(() =>
      parseAmbientCanvasUpdateNodes([
        { nodeId: 'shot-1', type: 'shot', summary: 'Storyboard shot' },
      ]),
    ).toThrow('not a canonical Canvas node type');
  });

  it('preserves complete explicit Cut target identity in plugin transfers', () => {
    expect(
      parseAgentWebviewToHostMessage({
        type: 'sendToPlugin',
        target: 'cut',
        payload: {
          kind: 'singleAsset',
          asset: { path: '/workspace/neko/generated/video/shot.mp4', mediaType: 'video' },
          target: {
            projectId: 'project-1',
            workspaceId: 'workspace-1',
            kind: 'file',
            documentUri: 'file:///workspace/edit.otio',
            trackId: 'track-1',
            clipId: 'clip-1',
          },
        },
      }),
    ).toMatchObject({
      payload: {
        target: {
          projectId: 'project-1',
          workspaceId: 'workspace-1',
          kind: 'file',
          documentUri: 'file:///workspace/edit.otio',
          trackId: 'track-1',
          clipId: 'clip-1',
        },
      },
    });

    expect(
      parseAgentWebviewToHostMessage({
        type: 'sendToPlugin',
        target: 'cut',
        payload: {
          kind: 'singleAsset',
          asset: { path: '/workspace/neko/generated/video/shot.mp4', mediaType: 'video' },
          target: {
            kind: 'file',
            documentUri: 'file:///workspace/edit.otio',
            unexpectedField: 'x',
          },
        },
      }),
    ).toBeNull();
  });

  it('accepts explicit projection endpoint discovery', () => {
    expect(
      parseAgentWebviewToHostMessage({
        type: 'projectionEndpointDiscover',
        realmId: 'realm-1',
      }),
    ).toEqual({
      type: 'projectionEndpointDiscover',
      realmId: 'realm-1',
    });
    expect(parseAgentWebviewToHostMessage({ type: 'projectionEndpointDiscover' })).toBeNull();
    expect(
      parseAgentWebviewToHostMessage({
        type: 'projectionEndpointDiscover',
        [['protocol', 'Version'].join('')]: 1,
        realmId: 'realm-1',
      }),
    ).toBeNull();
    expect(
      parseAgentWebviewToHostMessage({
        type: 'projectionEndpointDiscover',
        realmId: '',
      }),
    ).toBeNull();
  });

  it('accepts projection attachment lifecycle messages with complete identity', () => {
    const key = {
      attachmentId: 'attachment-1',
      tabId: 'tab-1',
      conversationId: 'conv-1',
    };

    expect(parseAgentWebviewToHostMessage({ type: 'projectionAttach', key })).toEqual({
      type: 'projectionAttach',
      key,
    });
    expect(
      parseAgentWebviewToHostMessage({
        type: 'projectionSnapshotAck',
        key,
        sequence: 0,
      }),
    ).toEqual({
      type: 'projectionSnapshotAck',
      key,
      sequence: 0,
    });
    expect(
      parseAgentWebviewToHostMessage({
        type: 'projectionDetach',
        key,
        reason: 'endpoint-replaced',
      }),
    ).toEqual({ type: 'projectionDetach', key, reason: 'endpoint-replaced' });
  });

  it('rejects the removed Timeline snapshot recovery message', () => {
    expect(
      parseAgentWebviewToHostMessage({
        type: 'requestAgentTurnTimelineSnapshot',
        conversationId: 'conv-1',
        turnId: 'turn-1',
        messageId: 'msg-1',
      }),
    ).toBeNull();
  });

  it('rejects malformed projection attachment lifecycle messages', () => {
    const key = {
      attachmentId: 'attachment-1',
      tabId: 'tab-1',
      conversationId: 'conv-1',
    };

    for (const field of ['attachmentId', 'tabId', 'conversationId'] as const) {
      expect(
        parseAgentWebviewToHostMessage({
          type: 'projectionAttach',
          key: { ...key, [field]: '' },
        }),
      ).toBeNull();
    }
    expect(
      parseAgentWebviewToHostMessage({
        type: 'projectionSnapshotAck',
        key,
        sequence: 1,
      }),
    ).toBeNull();
    expect(
      parseAgentWebviewToHostMessage({
        type: 'projectionSnapshotAck',
        key,
        sequence: 0,
        [['projection', 'Version'].join('')]: 1,
      }),
    ).toBeNull();
    expect(
      parseAgentWebviewToHostMessage({
        type: 'projectionDetach',
        key,
        reason: 'visibility-changed',
      }),
    ).toBeNull();
  });
  it('accepts tabless project search purposes and rejects unknown search purposes', () => {
    expect(
      parseAgentWebviewToHostMessage({
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
      parseAgentWebviewToHostMessage({
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
      parseAgentWebviewToHostMessage({
        type: 'searchProjectFiles',
        filter: '',
      }),
    ).toBeNull();
    expect(
      parseAgentWebviewToHostMessage({
        type: 'searchProjectFiles',
        filter: '',
        conversationId: 'conv-1',
        purpose: 'unknown',
      }),
    ).toBeNull();
  });

  it('requires explicit conversation scope for settings reads and writes', () => {
    expect(
      parseAgentWebviewToHostMessage({
        type: 'getSettings',
        conversationId: 'conv-1',
      }),
    ).toEqual({ type: 'getSettings', conversationId: 'conv-1' });
    expect(parseAgentWebviewToHostMessage({ type: 'getSettings' })).toBeNull();
    expect(
      parseAgentWebviewToHostMessage({
        type: 'getConversationSnapshot',
        conversationId: 'conv-1',
      }),
    ).toEqual({ type: 'getConversationSnapshot', conversationId: 'conv-1' });
    expect(parseAgentWebviewToHostMessage({ type: 'getConversationSnapshot' })).toBeNull();
    expect(
      parseAgentWebviewToHostMessage({
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
      parseAgentWebviewToHostMessage({
        type: 'updateSettings',
        settings: { executionMode: 'auto' },
      }),
    ).toBeNull();
  });

  it('rejects the retired free-form Character Dialogue launch messages', () => {
    expect(
      parseAgentWebviewToHostMessage({
        type: 'startCharacterDialogueFromSlash',
        args: 'entity:char-xiaoju --roleplay',
      }),
    ).toBeNull();
    expect(
      parseAgentWebviewToHostMessage({
        type: 'confirmRoleplayCandidate',
        projectSearchItemId: 'entity-projection:semantic-xiaoju',
        initialUserMessage: '你好，小橘',
      }),
    ).toBeNull();
  });

  it('accepts message queue commands with explicit conversation and item scope', () => {
    expect(
      parseAgentWebviewToHostMessage({
        type: 'getMessageQueue',
        conversationId: 'conv-1',
      }),
    ).toEqual({
      type: 'getMessageQueue',
      conversationId: 'conv-1',
    });

    expect(
      parseAgentWebviewToHostMessage({
        type: 'sendQueuedMessageNow',
        conversationId: 'conv-1',
        queueItemId: 'queue-1',
      }),
    ).toEqual({
      type: 'sendQueuedMessageNow',
      conversationId: 'conv-1',
      queueItemId: 'queue-1',
    });

    expect(
      parseAgentWebviewToHostMessage({
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
      parseAgentWebviewToHostMessage({
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
          paused: false,
          sequence: 2,
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
          paused: false,
          sequence: 2,
          items: [],
        },
      }),
    ).toThrow('queuedMessageEditRequested requires non-empty tabId');
  });

  it('binds an exact released queue item to its post-release snapshot', () => {
    const item = {
      id: 'queue-released-1',
      conversationId: 'conv-1',
      content: 'continue visibly',
      createdAt: 1,
      source: 'composer' as const,
    };
    expect(
      buildQueuedMessageReleasedMessage({
        item,
        snapshot: {
          conversationId: 'conv-1',
          pendingCount: 0,
          paused: false,
          sequence: 2,
          items: [],
        },
      }),
    ).toEqual({
      type: 'messageQueued',
      conversationId: 'conv-1',
      releasedItem: item,
      snapshot: {
        conversationId: 'conv-1',
        pendingCount: 0,
        paused: false,
        sequence: 2,
        items: [],
      },
    });
    expect(() =>
      buildQueuedMessageReleasedMessage({
        item,
        snapshot: {
          conversationId: 'conv-1',
          pendingCount: 1,
          paused: false,
          sequence: 1,
          items: [item],
        },
      }),
    ).toThrow('released item must not remain');
  });

  it('rejects message queue commands without required explicit scope', () => {
    expect(parseAgentWebviewToHostMessage({ type: 'getMessageQueue' })).toBeNull();
    expect(
      parseAgentWebviewToHostMessage({
        type: 'sendQueuedMessageNow',
        queueItemId: 'queue-1',
      }),
    ).toBeNull();
    expect(
      parseAgentWebviewToHostMessage({
        type: 'cancelQueuedMessage',
        conversationId: 'conv-1',
      }),
    ).toBeNull();
    expect(
      parseAgentWebviewToHostMessage({
        type: 'editQueuedMessage',
        conversationId: 'conv-1',
        queueItemId: 'queue-1',
      }),
    ).toBeNull();
    expect(
      parseAgentWebviewToHostMessage({
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

  it('accepts canonical attachment paths and rejects local path authority', () => {
    const base = {
      type: 'sendMessage',
      conversationId: 'conv-1',
      message: 'inspect',
      sessionMode: 'agent',
    };
    expect(
      parseSendMessageWebviewMessage({
        ...base,
        attachments: [
          {
            id: 'attachment-1',
            name: 'hero.png',
            type: 'image',
            path: 'assets/hero.png',
            size: 1024,
          },
        ],
      }),
    ).toMatchObject({
      attachments: [{ path: 'assets/hero.png', type: 'image' }],
    });

    for (const attachment of [
      { id: 'a', name: 'a', type: 'file', path: '/tmp/a.txt' },
      { id: 'a', name: 'a', type: 'file', path: 'C:\\tmp\\a.txt' },
      { id: 'a', name: 'a', type: 'file', path: 'file:///tmp/a.txt' },
      { id: 'a', name: 'a', type: 'file', path: '../a.txt' },
      { id: 'a', name: 'a', type: 'file', resolvedPath: '/tmp/a.txt' },
    ]) {
      expect(
        parseSendMessageWebviewMessage({
          ...base,
          attachments: [attachment],
        }),
      ).toBeNull();
    }
  });

  it('accepts canonical content routes and rejects unsafe locators', () => {
    const contentLocator = { kind: 'workspace-file', path: 'books/a.pdf' };
    const locator = { kind: 'page', pageNumber: 2, pageIndex: 1 };
    expect(
      parseAgentWebviewToHostMessage({
        type: 'openFile',
        contentLocator,
        options: { preview: true, line: 4 },
      }),
    ).toEqual({
      type: 'openFile',
      contentLocator,
      options: { preview: true, line: 4 },
    });
    expect(
      parseAgentWebviewToHostMessage({
        type: 'revealDocumentLocator',
        contentLocator,
        locator,
      }),
    ).toEqual({
      type: 'revealDocumentLocator',
      contentLocator,
      locator,
    });
    expect(
      parseAgentWebviewToHostMessage({
        type: 'revealFile',
        contentLocator,
      }),
    ).toEqual({
      type: 'revealFile',
      contentLocator,
    });

    for (const payload of [
      {
        type: 'openFile',
        contentLocator: { kind: 'workspace-file', path: '/tmp/a.pdf' },
      },
      {
        type: 'revealFile',
        contentLocator: { kind: 'workspace-file', path: '../a.pdf' },
      },
    ]) {
      expect(parseAgentWebviewToHostMessage(payload)).toBeNull();
    }
  });

  it('rejects unknown message types', () => {
    expect(
      parseAgentWebviewToHostMessage({
        type: 'futureAgentRoute',
        unsupportedField: true,
      }),
    ).toBeNull();
  });

  it('rejects path authority and non-string values in context navigation data', () => {
    const base = {
      type: 'revealContextSource',
      contextType: 'media',
      contextId: 'media-1',
      contentLocator: { kind: 'workspace-file', path: 'assets/hero.png' },
    };
    expect(
      parseAgentWebviewToHostMessage({
        ...base,
        navigationData: { partition: 'media-library' },
      }),
    ).toEqual({
      ...base,
      navigationData: { partition: 'media-library' },
    });

    for (const navigationData of [
      { filePath: '/tmp/a.png' },
      { path: 'assets/a.png' },
      { resolvedPath: '/tmp/a.png' },
      { portablePath: '${ASSETS}/a.png' },
      { projectRoot: '/workspace' },
      { partition: 1 },
    ]) {
      expect(
        parseAgentWebviewToHostMessage({
          ...base,
          navigationData,
        }),
      ).toBeNull();
    }
  });

  it('accepts a validated purpose-aware 3D reference context', () => {
    const data = {
      staging: {
        sessionId: 'session-1',
        subject: {
          kind: 'builtin-preset',
          presetId: 'guide-neutral-mannequin',
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
          requestId: 'request-pose',
          controlImage: contentLocator,
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
            id: '3d-reference:session-1',
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
    const unsupportedContext = unsupportedModelPreviewContextData();
    expect(
      parseSendMessageWebviewMessage({
        ...base,
        contextPayloads: [
          {
            type: 'model-scene',
            id: 'unsupported',
            label: 'Unsupported',
            summary: '',
            data: {},
          },
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
            data: unsupportedContext,
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
            data: { intent: { actionId: 'future-action', target: { nodeId: 'shot' } } },
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

  it('rejects audio direct mode even when the media model category matches', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'compose',
        sessionMode: 'audio',
        mediaModel: { providerId: 'suno', modelId: 'chirp', category: 'audio' },
      }),
    ).toBeNull();
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
      parseAgentWebviewToHostMessage({
        type: 'updateTabState',
        openTabs,
        activeTabId: 'tab-embody',
      }),
    ).toEqual({
      type: 'updateTabState',
      openTabs: [
        expect.objectContaining({
          kind: 'embody-character',
          embodyCharacterSession: expect.objectContaining({ sessionId: 'embody-session-1' }),
        }),
      ],
      activeTabId: 'tab-embody',
    });

    expect(
      parseAgentWebviewToHostMessage({
        type: 'updateTabState',
        openTabs: [
          {
            id: 'tab-embody',
            title: 'Embody: 小橘',
            conversationId: 'embody-session-1',
            kind: 'embody-character',
            embodyCharacterContext: {
              contextId: 'removed-hidden-context',
            },
          },
        ],
        activeTabId: 'tab-embody',
      }),
    ).toEqual({
      type: 'updateTabState',
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

  it('rejects unknown Tab fields without rejecting canonical sibling messages', () => {
    const tabState = {
      openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conversation-1' }],
      activeTabId: 'tab-1',
    };

    expect(
      parseAgentWebviewToHostMessage({
        type: 'activateConversation',
        activationId: 1,
        conversationId: 'conversation-1',
        tabId: 'tab-1',
        tabState,
        unsupportedField: true,
      }),
    ).toBeNull();
    expect(
      parseAgentWebviewToHostMessage({
        type: 'updateTabState',
        openTabs: tabState.openTabs,
        activeTabId: tabState.activeTabId,
        unsupportedField: true,
      }),
    ).toBeNull();

    expect(
      parseAgentWebviewToHostMessage({
        type: 'activateConversation',
        activationId: 2,
        conversationId: 'conversation-1',
        tabId: 'tab-1',
        tabState,
      }),
    ).toEqual({
      type: 'activateConversation',
      activationId: 2,
      conversationId: 'conversation-1',
      tabId: 'tab-1',
      tabState,
    });
    expect(
      parseAgentWebviewToHostMessage({
        type: 'updateTabState',
        openTabs: tabState.openTabs,
        activeTabId: tabState.activeTabId,
      }),
    ).toEqual({
      type: 'updateTabState',
      openTabs: tabState.openTabs,
      activeTabId: tabState.activeTabId,
    });
  });
});

function unsupportedModelPreviewContextData(): Record<string, unknown> {
  return {
    source: contentLocator,
    format: 'glb',
    unsupportedField: true,
  };
}
