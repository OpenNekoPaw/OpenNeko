import { describe, expect, it } from 'vitest';

import {
  parseDshPermissionChangedEvent,
  parseDshPermissionHostRequest,
  parseDshPermissionHostResult,
} from './dsh-permission-host';
import {
  internalVersionFields,
  nullableExecutionIdentityFields,
  retiredIdentityAliasFields,
} from './testing/dsh-contract-negative-fixtures';

const identity = {
  conversationId: 'conversation-1',
  dshSessionId: 'session-1',
  turn: 3,
  toolCallId: 'tool-1',
};

describe('DSH permission Host contract', () => {
  it('decodes exact list, decision, and cancel requests', () => {
    expect(
      parseDshPermissionHostRequest({
        requestId: 'request-list',
        operation: 'list',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        conversationId: identity.conversationId,
      }),
    ).toMatchObject({ operation: 'list', conversationId: identity.conversationId });
    expect(
      parseDshPermissionHostRequest({
        requestId: 'request-decide',
        operation: 'decide',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        ...identity,
        optionId: 'allow-once',
      }),
    ).toMatchObject({ operation: 'decide', ...identity, optionId: 'allow-once' });
    expect(
      parseDshPermissionHostRequest({
        requestId: 'request-cancel',
        operation: 'cancel',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        ...identity,
      }),
    ).toMatchObject({ operation: 'cancel', ...identity });
  });

  it('rejects missing identity and extra compatibility fields', () => {
    for (const { field, value } of [...retiredIdentityAliasFields, ...internalVersionFields]) {
      expect(() =>
        parseDshPermissionHostRequest({
          requestId: 'request-decide',
          operation: 'decide',
          windowId: 'window-1',
          rendererSessionId: 'renderer-1',
          ...identity,
          optionId: 'allow-once',
          [field]: value,
        }),
      ).toThrow(/keys mismatch/);
    }
    for (const field of nullableExecutionIdentityFields) {
      expect(() =>
        parseDshPermissionHostRequest({
          requestId: 'request-decide',
          operation: 'decide',
          windowId: 'window-1',
          rendererSessionId: 'renderer-1',
          ...identity,
          optionId: 'allow-once',
          [field]: null,
        }),
      ).toThrow();
    }
    expect(() =>
      parseDshPermissionHostRequest({
        requestId: 'request-decide',
        operation: 'decide',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        ...identity,
        optionId: 'allow-once',
        runId: 'retired-run',
      }),
    ).toThrow(/keys mismatch/);
    expect(() =>
      parseDshPermissionHostRequest({
        requestId: 'request-cancel',
        operation: 'cancel',
        windowId: 'window-1',
        rendererSessionId: 'renderer-1',
        conversationId: identity.conversationId,
      }),
    ).toThrow(/dshSessionId/);
  });

  it('decodes only ACP-advertised permission option shapes', () => {
    expect(
      parseDshPermissionHostResult(
        {
          requestId: 'request-list',
          conversationId: identity.conversationId,
          pending: [
            {
              ...identity,
              title: 'Write canvas',
              options: [{ optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }],
            },
          ],
        },
        'request-list',
      ),
    ).toMatchObject({ pending: [{ ...identity }] });
    expect(() =>
      parseDshPermissionHostResult(
        {
          requestId: 'request-list',
          conversationId: identity.conversationId,
          pending: [
            {
              ...identity,
              title: 'Write canvas',
              options: [{ optionId: 'yes', name: 'Yes', kind: 'default_allow' }],
            },
          ],
        },
        'request-list',
      ),
    ).toThrow(/kind/);
  });

  it('decodes exact change notifications', () => {
    expect(parseDshPermissionChangedEvent({ conversationId: 'conversation-1' })).toEqual({
      conversationId: 'conversation-1',
    });
  });
});
