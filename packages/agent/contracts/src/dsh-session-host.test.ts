import { describe, expect, it } from 'vitest';

import {
  parseDshComposerConfigurationHostResult,
  parseDshComposerConfigurationProjection,
  parseDshComposerMentionsHostResult,
  parseDshComposerMaterializedAssetHostResult,
  parseDshSessionHostProjection,
  parseDshSessionHostRequest,
  parseDshSessionHostResult,
} from './dsh-session-host';
import {
  internalVersionFields,
  retiredIdentityAliasFields,
} from './testing/dsh-contract-negative-fixtures';

const surfaceRequest = {
  requestId: 'request:create',
  windowId: 'window:one',
  rendererSessionId: 'renderer:one',
  workbenchInstanceId: 'workbench:one',
  agentSurfaceId: 'surface:one',
};

const createRequest = {
  ...surfaceRequest,
  operation: 'create' as const,
  permissionPresetId: 'workspace-write',
  target: { kind: 'surface' as const },
};

describe('DSH Session Host contract', () => {
  it('strictly accepts model, media-model, and permission-preset composer operations', () => {
    expect(
      parseDshSessionHostRequest({
        ...surfaceRequest,
        operation: 'composer-model',
        modelOptionId: 'deepseek-official:deepseek-v4',
      }),
    ).toMatchObject({
      operation: 'composer-model',
      modelOptionId: 'deepseek-official:deepseek-v4',
    });
    expect(
      parseDshSessionHostRequest({
        ...surfaceRequest,
        operation: 'composer-permission-preset',
        permissionPresetId: 'danger-full-access',
      }),
    ).toMatchObject({
      operation: 'composer-permission-preset',
      permissionPresetId: 'danger-full-access',
    });
    expect(
      parseDshSessionHostRequest({
        ...surfaceRequest,
        operation: 'composer-media-model',
        category: 'image',
        modelOptionId: 'nekoapi-media:gpt-image-2',
      }),
    ).toMatchObject({
      operation: 'composer-media-model',
      category: 'image',
      modelOptionId: 'nekoapi-media:gpt-image-2',
    });
    expect(() =>
      parseDshSessionHostRequest({
        ...surfaceRequest,
        operation: 'composer-media-model',
        category: 'llm',
        modelOptionId: 'deepseek-official:deepseek-v4',
      }),
    ).toThrow(/media category/u);
    expect(() =>
      parseDshSessionHostRequest({
        ...surfaceRequest,
        operation: 'composer-permission-preset',
        permissionPresetId: '',
      }),
    ).toThrow(/permissionPresetId/u);
  });

  it('rejects incomplete, duplicated, or out-of-catalog composer projections', () => {
    const configuration = {
      models: [
        {
          id: 'deepseek-official:deepseek-v4',
          label: 'DeepSeek V4',
          providerId: 'deepseek-official',
          modelId: 'deepseek-v4',
          providerLabel: 'DeepSeek',
          category: 'llm',
          capabilities: ['chat'],
        },
        {
          id: 'nekoapi-media:gpt-image-2',
          label: 'GPT Image 2',
          providerId: 'nekoapi-media',
          modelId: 'gpt-image-2',
          providerLabel: 'NekoAPI Media',
          category: 'image',
          capabilities: ['image.generate'],
        },
      ],
      selectedModelOptionId: 'deepseek-official:deepseek-v4',
      selectedMediaModelOptionIds: { image: 'nekoapi-media:gpt-image-2' },
      permissionPresetId: 'workspace-write',
      permissionPresets: [
        { id: 'read-only', label: 'read-only', selectable: true },
        { id: 'workspace-write', label: 'workspace-write', selectable: true },
        { id: 'danger-full-access', label: 'danger-full-access', selectable: true },
      ],
    };
    expect(
      parseDshComposerConfigurationHostResult(
        { requestId: 'request-composer', configuration },
        'request-composer',
      ).configuration,
    ).toEqual(configuration);
    expect(() =>
      parseDshComposerConfigurationProjection({
        ...configuration,
        selectedModelOptionId: 'unlisted:model',
      }),
    ).toThrow(/not in the projected catalog/u);
    expect(() =>
      parseDshComposerConfigurationProjection({
        ...configuration,
        permissionPresets: [
          ...configuration.permissionPresets,
          { id: 'workspace-write', label: 'duplicate', selectable: true },
        ],
      }),
    ).toThrow(/permission preset 'workspace-write' is duplicated/u);
    expect(() =>
      parseDshComposerConfigurationProjection({
        ...configuration,
        selectedMediaModelOptionIds: { video: 'nekoapi-media:gpt-image-2' },
      }),
    ).toThrow(/selected video model/u);
  });

  it('accepts create with sender, exact Agent Surface identity, and DSH preset', () => {
    expect(parseDshSessionHostRequest(createRequest)).toEqual(createRequest);
    expect(
      parseDshSessionHostRequest({
        ...createRequest,
        target: { kind: 'project', projectId: 'project-1' },
      }),
    ).toMatchObject({ target: { kind: 'project', projectId: 'project-1' } });
    expect(() =>
      parseDshSessionHostRequest({
        ...createRequest,
        target: { kind: 'project', projectId: '', workspaceId: 'forged' },
      }),
    ).toThrow();
  });

  it.each(['conversationId', 'workspaceId', 'cwd', 'provider', 'model', 'dshSessionId'])(
    'rejects Renderer-owned %s authority on create',
    (field) => {
      expect(() =>
        parseDshSessionHostRequest({ ...createRequest, [field]: `forged:${field}` }),
      ).toThrow(new RegExp(`unexpected=${field}`, 'u'));
    },
  );

  it('accepts the canonical submit request and bounded projection', () => {
    expect(
      parseDshSessionHostRequest({
        requestId: 'request-1',
        operation: 'submit',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        conversationId: 'conversation-1',
        input: { kind: 'message', text: 'hello', references: [], contextPayloads: [] },
      }),
    ).toMatchObject({
      operation: 'submit',
      input: { kind: 'message', text: 'hello', references: [], contextPayloads: [] },
    });
    expect(
      parseDshSessionHostResult(
        {
          requestId: 'request-1',
          stopReason: 'end_turn',
          projection: projection(),
        },
        'request-1',
      ),
    ).toMatchObject({ projection: { dshSessionId: 'session-1' } });
  });

  it('strictly decodes mention queries and authorized ContentLocator results', () => {
    expect(
      parseDshSessionHostRequest({
        ...surfaceRequest,
        operation: 'composer-mentions',
        filter: 'scene',
      }),
    ).toMatchObject({ operation: 'composer-mentions', filter: 'scene' });
    expect(
      parseDshComposerMentionsHostResult(
        {
          requestId: 'request-mentions',
          mentions: [
            {
              id: 'files:scene',
              kind: 'file',
              label: 'scene.md',
              contentLocator: { file: { authority: 'workspace', path: 'notes/scene.md' } },
              source: 'workspace',
              mediaType: 'text',
            },
            {
              id: 'assets:lighting',
              kind: 'asset',
              label: 'Lighting',
              assetId: 'asset-lighting',
              source: 'asset-library',
            },
          ],
        },
        'request-mentions',
      ).mentions,
    ).toEqual([
      {
        id: 'files:scene',
        kind: 'file',
        label: 'scene.md',
        contentLocator: { file: { authority: 'workspace', path: 'notes/scene.md' } },
        source: 'workspace',
        mediaType: 'text',
      },
      {
        id: 'assets:lighting',
        kind: 'asset',
        label: 'Lighting',
        assetId: 'asset-lighting',
        source: 'asset-library',
      },
    ]);
    expect(() =>
      parseDshComposerMentionsHostResult(
        {
          requestId: 'request-mentions',
          mentions: [
            {
              id: 'forged',
              kind: 'file',
              label: 'private',
              contentLocator: { file: { authority: 'workspace', path: '/private/file' } },
              source: 'workspace',
            },
          ],
        },
        'request-mentions',
      ),
    ).toThrow(/ContentLocator is invalid/u);

    expect(
      parseDshSessionHostRequest({
        ...surfaceRequest,
        operation: 'composer-materialize-asset',
        assetId: 'asset-lighting',
      }),
    ).toMatchObject({ operation: 'composer-materialize-asset', assetId: 'asset-lighting' });
    expect(
      parseDshComposerMaterializedAssetHostResult(
        {
          requestId: 'request-materialize',
          materialized: {
            assetId: 'asset-lighting',
            label: 'Lighting.png',
            contentLocator: {
              file: { authority: 'workspace', path: 'assets/Lighting.png' },
            },
            source: 'asset-library',
            mediaType: 'image',
          },
        },
        'request-materialize',
      ).materialized,
    ).toEqual({
      assetId: 'asset-lighting',
      label: 'Lighting.png',
      contentLocator: { file: { authority: 'workspace', path: 'assets/Lighting.png' } },
      source: 'asset-library',
      mediaType: 'image',
    });
  });

  it('rejects prompt and authority fields smuggled into command and Skill submits', () => {
    for (const input of [
      { kind: 'command', line: '/help', text: 'fallback prompt' },
      { kind: 'skill', skillName: 'story', displayText: '$story', line: '/story' },
      {
        kind: 'message',
        text: 'hello',
        references: [],
        contextPayloads: [],
        skillName: 'story',
      },
    ]) {
      expect(() =>
        parseDshSessionHostRequest({
          requestId: 'request-submit',
          operation: 'submit',
          windowId: 'window-1',
          rendererSessionId: 'renderer-1',
          conversationId: 'conversation-1',
          input,
        }),
      ).toThrow(/unexpected=/u);
    }
  });

  it('strictly accepts bounded context receipts and rejects duplicate or malformed context', () => {
    const contextPayload = {
      type: 'asset',
      id: 'asset-lighting',
      label: 'Lighting',
      summary: 'Soft studio lighting',
      data: { assetRef: { assetId: 'asset-lighting' } },
    };
    const submit = (contextPayloads: unknown[]) =>
      parseDshSessionHostRequest({
        requestId: 'request-context',
        operation: 'submit',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        conversationId: 'conversation-1',
        input: { kind: 'message', text: '', references: [], contextPayloads },
      });

    expect(submit([contextPayload])).toMatchObject({
      input: { kind: 'message', contextPayloads: [contextPayload] },
    });
    expect(() => submit([contextPayload, contextPayload])).toThrow(/duplicated/u);
    expect(() => submit([{ ...contextPayload, data: { invalid: undefined } }])).toThrow(
      /lossless JSON/u,
    );
  });

  it('rejects mention receipts whose kind does not match locator or context authority', () => {
    expect(() =>
      parseDshComposerMentionsHostResult(
        {
          requestId: 'request-mentions',
          mentions: [
            {
              id: 'forged-asset',
              kind: 'asset',
              label: 'Forged',
              contentLocator: { file: { authority: 'workspace', path: 'forged.png' } },
              source: 'workspace',
            },
          ],
        },
        'request-mentions',
      ),
    ).toThrow(/kind does not match/u);
  });

  it('decodes command activity without accepting Tool or turn fields', () => {
    expect(
      parseDshSessionHostProjection({
        ...projection(),
        events: [
          {
            kind: 'command',
            commandId: 'command-1',
            name: 'help',
            args: 'tools',
            status: 'completed',
            text: 'Available commands',
          },
        ],
      }).events,
    ).toEqual([
      {
        kind: 'command',
        commandId: 'command-1',
        name: 'help',
        args: 'tools',
        status: 'completed',
        text: 'Available commands',
      },
    ]);
    expect(() =>
      parseDshSessionHostProjection({
        ...projection(),
        events: [
          {
            kind: 'command',
            commandId: 'command-1',
            name: 'help',
            status: 'running',
            turn: 1,
          },
        ],
      }),
    ).toThrow(/unexpected=turn/u);
    expect(
      parseDshSessionHostProjection({
        ...projection(),
        events: [
          {
            kind: 'command',
            commandId: 'command-2',
            name: 'goal',
            args: '',
            status: 'running',
          },
        ],
      }).events,
    ).toEqual([
      {
        kind: 'command',
        commandId: 'command-2',
        name: 'goal',
        args: '',
        status: 'running',
      },
    ]);
    expect(() =>
      parseDshSessionHostProjection({
        ...projection(),
        events: [
          {
            kind: 'command',
            commandId: 'command-3',
            name: 'goal',
            args: 1,
            status: 'running',
          },
        ],
      }),
    ).toThrow(/event.args must be a string/u);
  });

  it('requires canonical DSH timing on exact turn boundaries', () => {
    expect(
      parseDshSessionHostProjection({
        ...projection(),
        events: [
          { kind: 'turn', turn: 1, phase: 'start', startedAt: 1_000 },
          {
            kind: 'turn',
            turn: 1,
            phase: 'end',
            startedAt: 1_000,
            completedAt: 2_500,
          },
        ],
      }).events,
    ).toEqual([
      { kind: 'turn', turn: 1, phase: 'start', startedAt: 1_000 },
      { kind: 'turn', turn: 1, phase: 'end', startedAt: 1_000, completedAt: 2_500 },
    ]);
    expect(() =>
      parseDshSessionHostProjection({
        ...projection(),
        events: [{ kind: 'turn', turn: 1, phase: 'end', completedAt: 2_500 }],
      }),
    ).toThrow(/startedAt/u);
    expect(() =>
      parseDshSessionHostProjection({
        ...projection(),
        events: [{ kind: 'turn', turn: 1, phase: 'end', startedAt: 3_000, completedAt: 2_500 }],
      }),
    ).toThrow(/must not precede/u);
  });

  it('accepts structured user resource blocks and rejects protocol URI fields', () => {
    const contentLocator = {
      file: { authority: 'workspace' as const, path: 'books/卷01.epub' },
    };
    expect(
      parseDshSessionHostProjection({
        ...projection(),
        events: [
          {
            kind: 'message',
            role: 'user',
            messageId: 'user-resource',
            content: [
              { type: 'text', text: '分析前10页' },
              { type: 'resource', label: '卷01.epub', contentLocator },
            ],
          },
        ],
      }).events,
    ).toEqual([
      {
        kind: 'message',
        role: 'user',
        messageId: 'user-resource',
        content: [
          { type: 'text', text: '分析前10页' },
          { type: 'resource', label: '卷01.epub', contentLocator },
        ],
      },
    ]);
    expect(() =>
      parseDshSessionHostProjection({
        ...projection(),
        events: [
          {
            kind: 'message',
            role: 'user',
            content: [
              {
                type: 'resource',
                label: '卷01.epub',
                contentLocator,
                uri: 'openneko-content:private',
              },
            ],
          },
        ],
      }),
    ).toThrow(/unexpected=uri/u);
  });

  it('rejects compatibility fields and accepts only bounded JSON Tool payloads', () => {
    for (const { field, value } of [...retiredIdentityAliasFields, ...internalVersionFields]) {
      expect(() =>
        parseDshSessionHostRequest({
          requestId: 'request-1',
          operation: 'snapshot',
          windowId: 'window-1',
          rendererSessionId: 'renderer-1',
          conversationId: 'conversation-1',
          [field]: value,
        }),
      ).toThrow(new RegExp(`unexpected=${field}`, 'u'));
    }
    expect(() =>
      parseDshSessionHostRequest({
        requestId: 'request-1',
        operation: 'snapshot',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        conversationId: 'conversation-1',
        runId: 'retired',
      }),
    ).toThrow(/unexpected=runId/u);
    expect(() =>
      parseDshSessionHostProjection({
        ...projection(),
        events: [
          {
            kind: 'tool',
            toolCallId: 'tool-1',
            turn: 1,
            status: 'pending',
            rawInput: { path: '/private/workspace' },
          },
        ],
      }),
    ).not.toThrow();
  });
});

function projection() {
  return {
    conversationId: 'conversation-1',
    dshSessionId: 'session-1',
    currentTurn: 1,
    events: [
      {
        kind: 'message',
        role: 'assistant',
        turn: 1,
        step: 0,
        text: 'hello',
        messageId: 'message-1',
        state: 'streaming',
      },
      { kind: 'tool', toolCallId: 'tool-1', turn: 1, status: 'pending', title: 'Generate' },
    ],
  };
}
