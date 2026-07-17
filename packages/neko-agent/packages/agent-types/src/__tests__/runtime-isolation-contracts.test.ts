import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createConversationConfigState,
  createTurnConfigSnapshot,
  updateConversationConfigState,
} from '../runtime-config';
import {
  formatChildRunScope,
  validateChildRunScope,
  validateRuntimeScopeOwner,
} from '../runtime-scope';
import { isSameProjectionAttachment } from '../projection-attachment';

describe('Agent runtime isolation contracts', () => {
  it('requires complete child ownership and permits equal local IDs in different conversations', () => {
    const first = validateChildRunScope({
      conversationId: 'conversation-a',
      runId: 'run-a',
      parentRunId: 'parent-a',
      childRunId: 'worker-1',
      childKind: 'subagent',
    });
    const second = validateChildRunScope({
      conversationId: 'conversation-b',
      runId: 'run-b',
      parentRunId: 'parent-b',
      childRunId: 'worker-1',
      childKind: 'subagent',
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('Expected valid child scopes.');
    expect(formatChildRunScope(first.scope)).not.toBe(formatChildRunScope(second.scope));
    expect(validateRuntimeScopeOwner(first.scope, second.scope)).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostic: expect.objectContaining({ code: 'runtime-scope-owner-mismatch' }),
      }),
    );
  });

  it('rejects bare child IDs at the contract boundary', () => {
    expect(validateChildRunScope({ childRunId: 'worker-1' })).toEqual(
      expect.objectContaining({
        ok: false,
        diagnostic: expect.objectContaining({ code: 'invalid-runtime-scope' }),
      }),
    );
  });

  it('freezes a turn snapshot independently from future conversation updates', () => {
    const initial = createConversationConfigState({
      conversationId: 'conversation-a',
      config: { providerId: 'provider-a', modelId: 'model-a', temperature: 0.2 },
    });
    const turn = createTurnConfigSnapshot({
      scope: { conversationId: 'conversation-a', runId: 'run-1' },
      conversationConfig: initial,
    });
    const updated = updateConversationConfigState(initial, {
      providerId: 'provider-b',
      modelId: 'model-b',
      temperature: 0.8,
    });

    expect(turn.config).toEqual({
      providerId: 'provider-a',
      modelId: 'model-a',
      temperature: 0.2,
    });
    expect(updated.revision).toBe(1);
    expect(updated.config.modelId).toBe('model-b');
    expect(Object.isFrozen(turn)).toBe(true);
    expect(Object.isFrozen(turn.config)).toBe(true);
  });

  it('treats endpoint, attachment, tab, and conversation as one attachment identity', () => {
    const key = {
      endpointEpoch: 'endpoint-1',
      attachmentId: 'attachment-1',
      tabId: 'tab-1',
      conversationId: 'conversation-1',
    };
    expect(isSameProjectionAttachment(key, { ...key })).toBe(true);
    expect(isSameProjectionAttachment(key, { ...key, tabId: 'tab-2' })).toBe(false);
    expect(isSameProjectionAttachment(key, { ...key, endpointEpoch: 'endpoint-2' })).toBe(false);
  });

  it('keeps Layer-0 isolation contracts free of host and renderer dependencies', () => {
    const sources = ['runtime-scope.ts', 'runtime-config.ts', 'projection-attachment.ts'].map(
      (name) => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8'),
    );
    const forbidden = [
      /from\s+['"]vscode['"]/,
      /from\s+['"]react['"]/,
      /@neko-agent\/extension/,
      /@neko-agent\/webview/,
      /@neko-agent\/cli-tui/,
    ];

    for (const source of sources) {
      for (const pattern of forbidden) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});
