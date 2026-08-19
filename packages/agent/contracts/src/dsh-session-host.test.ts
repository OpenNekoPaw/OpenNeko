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

const createRequest = {
  requestId: 'request:create',
  operation: 'create' as const,
  windowId: 'window:one',
  rendererSessionId: 'renderer:one',
  workbenchInstanceId: 'workbench:one',
  agentSurfaceId: 'surface:one',
};

describe('DSH Session Host contract', () => {
  it('strictly accepts model and execution-mode composer operations', () => {
    expect(
      parseDshSessionHostRequest({
        ...createRequest,
        operation: 'composer-model',
        modelOptionId: 'deepseek-official:deepseek-v4',
      }),
    ).toMatchObject({
      operation: 'composer-model',
      modelOptionId: 'deepseek-official:deepseek-v4',
    });
    expect(
      parseDshSessionHostRequest({
        ...createRequest,
        operation: 'composer-mode',
        mode: 'auto',
      }),
    ).toMatchObject({ operation: 'composer-mode', mode: 'auto' });
    expect(() =>
      parseDshSessionHostRequest({ ...createRequest, operation: 'composer-mode', mode: 'legacy' }),
    ).toThrow(/execution mode/u);
  });

  it('rejects incomplete, duplicated, or out-of-catalog composer projections', () => {
    const configuration = {
      models: [
        {
          id: 'deepseek-official:deepseek-v4',
          label: 'DeepSeek V4',
          providerId: 'deepseek-official',
          modelId: 'deepseek-v4',
        },
      ],
      selectedModelOptionId: 'deepseek-official:deepseek-v4',
      executionMode: 'ask',
      modes: [
        { id: 'plan', available: false, diagnostic: 'Unavailable.' },
        { id: 'ask', available: true },
        { id: 'auto', available: true },
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
        modes: [...configuration.modes, { id: 'ask', available: true }],
      }),
    ).toThrow(/mode 'ask' is duplicated/u);
  });

  it('accepts create with only sender and exact Agent Surface identity', () => {
    expect(parseDshSessionHostRequest(createRequest)).toEqual(createRequest);
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
