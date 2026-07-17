import { describe, expect, it } from 'vitest';
import { parseSendMessageWebviewMessage, parseWebviewToExtensionMessage } from '@neko-agent/types';
import type { TaskRunScope } from '@neko/shared';

describe('parseSendMessageWebviewMessage', () => {
  it('accepts explicit conversation and model refs', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
        purposeModels: {
          'image.generate': { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        conversationId: 'conv-1',
        chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
      }),
    );
  });

  it('accepts agent-scoped understanding purposes as flat model refs', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'analyze this video',
        sessionMode: 'agent',
        purposeModels: {
          'video.understand': {
            providerId: 'google',
            modelId: 'gemini-video-pro',
            category: 'llm',
          },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        purposeModels: {
          'video.understand': {
            providerId: 'google',
            modelId: 'gemini-video-pro',
            category: 'llm',
          },
        },
      }),
    );
  });

  it('rejects purpose model refs outside agent mode', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'draw',
        sessionMode: 'image',
        mediaModel: { providerId: 'openai', modelId: 'gpt-image', category: 'image' },
        purposeModels: {
          'image.understand': {
            providerId: 'google',
            modelId: 'gemini-image',
            category: 'llm',
          },
        },
      }),
    ).toBeNull();
  });

  it('rejects missing conversationId', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        message: 'hello',
        sessionMode: 'agent',
      }),
    ).toBeNull();
  });

  it('rejects legacy top-level providerId/modelId shape', () => {
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

  it('rejects legacy nested media model selections', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'draw',
        sessionMode: 'agent',
        mediaModels: {
          image: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        },
      }),
    ).toBeNull();
  });

  it('requires mediaModel category to match non-agent sessionMode', () => {
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
});

describe('parseWebviewToExtensionMessage', () => {
  it('delegates valid sendMessage payloads to the explicit model-ref parser', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'sendMessage',
        conversationId: 'conv-1',
        chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
      }),
    );
  });

  it('rejects legacy sendMessage provider/model fields at the shared boundary', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        providerId: 'openai',
        modelId: 'gpt-4.1',
      }),
    ).toBeNull();
  });

  it('accepts Task actions only with a complete run scope', () => {
    const scope = taskScope('task-1');
    expect(
      parseWebviewToExtensionMessage({
        type: 'cancelTask',
        taskScope: scope,
      }),
    ).toEqual({ type: 'cancelTask', taskScope: scope });
  });

  it('accepts conversation-scoped message queue commands', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'getMessageQueue',
        conversationId: 'conv-1',
      }),
    ).toEqual({ type: 'getMessageQueue', conversationId: 'conv-1' });

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

  it('accepts conversation-scoped plugin slash commands', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'invokePluginSlashCommand',
        extensionId: 'neko.canvas',
        commandId: 'batch',
        conversationId: 'conv-1',
        args: 'scene 1',
      }),
    ).toEqual({
      type: 'invokePluginSlashCommand',
      extensionId: 'neko.canvas',
      commandId: 'batch',
      conversationId: 'conv-1',
      args: 'scene 1',
    });
  });

  it('rejects conversation-bound messages without conversationId', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'cancelTask',
        taskId: 'task-1',
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'cancelTask',
        conversationId: 'conv-1',
        taskId: 'task-1',
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'getMessageQueue',
      }),
    ).toBeNull();
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
  });

  it.each([
    ['confirm tool approvals', { type: 'confirmTool', toolCallId: 'tool-1', approved: true }],
    ['history clearing', { type: 'clearHistory' }],
    ['message cancellation', { type: 'cancelMessage' }],
    ['task refresh', { type: 'getTasks' }],
    ['context token refresh', { type: 'getContextTokenCount' }],
    ['context compression', { type: 'compressContext' }],
    ['conversation deletion', { type: 'deleteConversation' }],
    ['queued message promotion', { type: 'promoteQueuedMessage', queueItemId: 'queue-1' }],
    ['queued message cancellation', { type: 'cancelQueuedMessage', queueItemId: 'queue-1' }],
    [
      'queued message editing',
      { type: 'editQueuedMessage', tabId: 'tab-1', queueItemId: 'queue-1' },
    ],
    ['task cancellation', { type: 'cancelTask', taskId: 'task-1' }],
    ['task retry', { type: 'retryTask', taskId: 'task-1' }],
    ['task result viewing', { type: 'viewTaskResult', taskId: 'task-1' }],
    [
      'capability lifecycle invocation',
      {
        type: 'invokeAgentCapabilityLifecycle',
        requestId: 'request-1',
        invocation: { capabilityId: 'canvas.createStoryboardFromMarkdown', phase: 'apply' },
      },
    ],
    [
      'canvas authoring handoff',
      {
        type: 'requestCanvasAuthoringHandoff',
        requestId: 'request-1',
        sourceKind: 'generated-text',
        content: 'Create a Canvas scene note.',
      },
    ],
    [
      'Mermaid error feedback',
      {
        type: 'mermaidError',
        error: 'Syntax error',
        code: 'ParseError',
        feedbackMessage: 'Fix the Mermaid diagram.',
      },
    ],
    ['builtin slash command', { type: 'invokeSlashCommand', command: 'clear' }],
    ['Skill invocation', { type: 'invokeSkill', skillName: 'storyboard' }],
    [
      'plugin slash command',
      { type: 'invokePluginSlashCommand', extensionId: 'neko.canvas', commandId: 'batch' },
    ],
  ])('rejects %s without explicit conversation scope', (_name, payload) => {
    expect(parseWebviewToExtensionMessage(payload)).toBeNull();
  });

  it('rejects plugin slash commands without conversationId', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'invokePluginSlashCommand',
        extensionId: 'neko.canvas',
        commandId: 'batch',
      }),
    ).toBeNull();
  });

  it('accepts webview keyboard ownership messages without conversation scope', () => {
    expect(parseWebviewToExtensionMessage({ type: 'webviewKeyboardFocus', focused: true })).toEqual(
      {
        type: 'webviewKeyboardFocus',
        focused: true,
      },
    );
    expect(
      parseWebviewToExtensionMessage({ type: 'webviewKeyboardEditable', editable: true }),
    ).toEqual({
      type: 'webviewKeyboardEditable',
      editable: true,
    });
  });

  it('accepts canonical Storyboard Canvas handoff without flattening scene or media ownership', () => {
    const canonicalStoryboard = createCanonicalStoryboardHandoffFixture();
    expect(
      parseWebviewToExtensionMessage({
        type: 'requestCanvasAuthoringHandoff',
        requestId: 'request-storyboard-1',
        conversationId: 'conv-1',
        sourceKind: 'structured-content',
        sourceFormat: 'composite-artifact',
        content: 'Canonical Storyboard: Cats',
        canonicalStoryboard,
      }),
    ).toEqual(
      expect.objectContaining({
        canonicalStoryboard: expect.objectContaining({
          revision: expect.objectContaining({ revisionId: 'storyboard-rev-1' }),
          scenes: [
            expect.objectContaining({
              sceneId: 'scene-1',
              shots: [
                expect.objectContaining({
                  shotId: 'shot-1',
                  imagePrompt: 'cat keyframe',
                  videoPrompt: 'cat scene motion',
                  sourceMediaRefs: [
                    expect.objectContaining({
                      refId: 'source-image-1',
                      resourceRef: expect.objectContaining({ id: 'source-image-resource' }),
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      }),
    );
  });

  it('rejects flat Storyboard rows instead of reconstructing canonical scene ownership', () => {
    const canonicalStoryboard = createCanonicalStoryboardHandoffFixture();
    const shot = canonicalStoryboard.scenes[0]!.shots[0]!;

    expect(
      parseWebviewToExtensionMessage({
        type: 'requestCanvasAuthoringHandoff',
        requestId: 'request-storyboard-flat-scenes',
        conversationId: 'conv-1',
        sourceKind: 'structured-content',
        content: 'invalid flat Storyboard',
        canonicalStoryboard: {
          ...canonicalStoryboard,
          scenes: [
            {
              ...shot,
              sceneId: 'scene-1',
              sceneTitle: 'Opening',
            },
          ],
        },
      }),
    ).toBeNull();
  });

  it('rejects malformed or runtime-only canonical Storyboard Canvas handoffs', () => {
    const canonicalStoryboard = createCanonicalStoryboardHandoffFixture();
    expect(
      parseWebviewToExtensionMessage({
        type: 'requestCanvasAuthoringHandoff',
        requestId: 'request-storyboard-invalid-revision',
        conversationId: 'conv-1',
        sourceKind: 'structured-content',
        content: 'invalid canonical Storyboard',
        canonicalStoryboard: { ...canonicalStoryboard, revision: undefined },
      }),
    ).toBeNull();

    const scene = canonicalStoryboard.scenes[0]!;
    const shot = scene.shots[0]!;
    expect(
      parseWebviewToExtensionMessage({
        type: 'requestCanvasAuthoringHandoff',
        requestId: 'request-storyboard-runtime-ref',
        conversationId: 'conv-1',
        sourceKind: 'structured-content',
        content: 'invalid canonical Storyboard',
        canonicalStoryboard: {
          ...canonicalStoryboard,
          scenes: [
            {
              ...scene,
              shots: [
                {
                  ...shot,
                  sourceMediaRefs: [
                    {
                      refId: 'runtime-image',
                      role: 'source',
                      locator: { type: 'workspace-path', path: '/tmp/neko-cache/panel.png' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
    ).toBeNull();
  });

  it('accepts tab state updates with explicit tab-to-conversation mapping', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'updateTabState',
        expectedTabStateRevision: 3,
        openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
        activeTabId: 'tab-1',
      }),
    ).toEqual({
      type: 'updateTabState',
      expectedTabStateRevision: 3,
      openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
      activeTabId: 'tab-1',
    });
  });
});

function createCanonicalStoryboardHandoffFixture() {
  return {
    schemaVersion: 1 as const,
    kind: 'storyboard-table' as const,
    contractVersion: 1 as const,
    sourceProfile: 'from-script' as const,
    revision: {
      revisionId: 'storyboard-rev-1',
      sequence: 1,
      contentDigest: 'storyboard-rev-1',
      createdAt: '2026-07-12T00:00:00.000Z',
    },
    sourceTrace: [
      {
        traceId: 'trace-1',
        sourceProfile: 'from-script' as const,
        sourceRef: {
          id: 'story-source-resource',
          scope: 'project' as const,
          provider: 'workspace',
          kind: 'document' as const,
          source: { kind: 'file' as const, projectRelativePath: 'scripts/story.md' },
          locator: { kind: 'file' as const, path: '${WORKSPACE}/scripts/story.md' },
          fingerprint: { strategy: 'hash' as const, value: 'story-source' },
        },
      },
    ],
    title: 'Cats',
    scenes: [
      {
        sceneId: 'scene-1',
        sceneTitle: 'Hallway',
        shots: [
          {
            shotId: 'shot-1',
            shotNumber: 1,
            duration: 3,
            visualDescription: 'A cat enters.',
            characterAction: 'The cat walks.',
            imageStrategy: 'use-as-reference' as const,
            imagePrompt: 'cat keyframe',
            videoPrompt: 'cat scene motion',
            sourceMediaRefs: [
              {
                refId: 'source-image-1',
                role: 'source' as const,
                locator: {
                  type: 'workspace-path' as const,
                  path: '${WORKSPACE}/assets/cat.png',
                },
                resourceRef: {
                  id: 'source-image-resource',
                  scope: 'project' as const,
                  provider: 'workspace',
                  kind: 'media' as const,
                  source: { kind: 'file' as const, projectRelativePath: 'assets/cat.png' },
                  locator: { kind: 'file' as const, path: '${WORKSPACE}/assets/cat.png' },
                  fingerprint: { strategy: 'hash' as const, value: 'cat-source' },
                },
              },
            ],
          },
        ],
      },
    ],
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
