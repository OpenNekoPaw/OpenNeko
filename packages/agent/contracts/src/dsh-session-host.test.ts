import { describe, expect, it } from 'vitest';

import {
  parseDshComposerConfigurationHostResult,
  parseDshComposerConfigurationProjection,
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

  it('accepts the canonical prompt request and bounded projection', () => {
    expect(
      parseDshSessionHostRequest({
        requestId: 'request-1',
        operation: 'prompt',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        conversationId: 'conversation-1',
        text: 'hello',
      }),
    ).toMatchObject({ operation: 'prompt', text: 'hello' });
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
      { kind: 'message', role: 'assistant', text: 'hello', messageId: 'message-1' },
      { kind: 'tool', toolCallId: 'tool-1', turn: 1, status: 'pending', title: 'Generate' },
    ],
  };
}
