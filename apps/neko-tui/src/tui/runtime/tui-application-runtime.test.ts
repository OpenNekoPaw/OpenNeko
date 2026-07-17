import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_CLI_CONFIG } from '../core/types';
import { InMemoryUserCredentialPersistence } from '@neko/agent/pi';
import { createAgentTuiApplicationRuntime } from './tui-application-runtime';

describe('AgentTuiApplicationRuntime', () => {
  it('keeps mutable store ownership out of module-level bound hooks', () => {
    const srcRoot = resolve(import.meta.dirname, '..');
    for (const relativePath of [
      'stores/agent-store.ts',
      'stores/config-store.ts',
      'stores/conversation-store.ts',
      'stores/ui-store.ts',
    ]) {
      const source = readFileSync(resolve(srcRoot, relativePath), 'utf8');
      expect(source).not.toMatch(/export const use(?:Agent|Config|Conversation|UI)Store/u);
    }
  });

  it('creates independent mutable state for two TUI application roots', () => {
    const applicationA = createTestApplication('application-a');
    const applicationB = createTestApplication('application-b');
    const runtimeA = applicationA.createConversation({
      runtimeId: 'runtime-a',
      conversationId: 'conversation-a',
      config: { ...DEFAULT_CLI_CONFIG, model: 'model-a' },
    });
    const runtimeB = applicationB.createConversation({
      runtimeId: 'runtime-b',
      conversationId: 'conversation-b',
      config: { ...DEFAULT_CLI_CONFIG, model: 'model-b' },
    });

    runtimeA.stores.conversation.getState().addUserMessage('message-a');
    runtimeA.stores.agent.getState().setRunning();
    runtimeA.stores.config.getState().setConfig({ model: 'model-a-next' });
    runtimeA.stores.ui.getState().setScrollLimit(12);
    runtimeA.stores.ui.getState().scrollUp(4);

    expect(runtimeB.stores.conversation.getState().messages).toEqual([]);
    expect(runtimeB.stores.agent.getState().status).toBe('idle');
    expect(runtimeB.stores.config.getState().config.model).toBe('model-b');
    expect(runtimeB.stores.ui.getState().scrollOffset).toBe(0);

    applicationA.dispose();
    expect(runtimeB.lifecycle).toBe('ready');
    runtimeB.stores.conversation.getState().addUserMessage('message-b');
    expect(runtimeB.stores.conversation.getState().messages[0]?.content).toBe('message-b');
  });

  it('switches active conversations without copying or rebinding their state', () => {
    const application = createTestApplication('application');
    const runtimeA = application.createConversation({
      runtimeId: 'runtime-a',
      conversationId: 'conversation-a',
      config: { ...DEFAULT_CLI_CONFIG, model: 'model-a' },
    });
    const runtimeB = application.createConversation({
      runtimeId: 'runtime-b',
      conversationId: 'conversation-b',
      config: { ...DEFAULT_CLI_CONFIG, model: 'model-b' },
      activate: false,
    });
    runtimeA.stores.conversation.getState().addUserMessage('message-a');
    runtimeB.stores.conversation.getState().addUserMessage('message-b');

    application.activateConversation('conversation-b');
    expect(application.requireActiveConversation()).toBe(runtimeB);
    expect(runtimeA.stores.conversation.getState().messages[0]?.content).toBe('message-a');

    application.activateConversation('conversation-a');
    expect(application.requireActiveConversation()).toBe(runtimeA);
    expect(runtimeB.stores.conversation.getState().messages[0]?.content).toBe('message-b');
  });

  it('binds an initializing runtime once and rejects duplicate conversation ownership', () => {
    const application = createTestApplication('application');
    const runtime = application.createConversation({
      runtimeId: 'runtime-a',
      config: DEFAULT_CLI_CONFIG,
    });

    runtime.bindConversationId('conversation-a');
    expect(application.requireConversation('conversation-a')).toBe(runtime);
    expect(() => runtime.bindConversationId('conversation-b')).toThrowError(
      expect.objectContaining({ code: 'conversation-owner-mismatch' }),
    );
    expect(() =>
      application.createConversation({
        runtimeId: 'runtime-b',
        conversationId: 'conversation-a',
        config: DEFAULT_CLI_CONFIG,
      }),
    ).toThrowError(expect.objectContaining({ code: 'duplicate-conversation-owner' }));
  });

  it('rejects mutations through a disposed conversation runtime', () => {
    const application = createTestApplication('application');
    const runtime = application.createConversation({
      runtimeId: 'runtime-a',
      conversationId: 'conversation-a',
      config: DEFAULT_CLI_CONFIG,
    });
    const addUserMessage = runtime.stores.conversation.getState().addUserMessage;

    application.disposeConversation(runtime.runtimeId);

    expect(() => addUserMessage('late message')).toThrowError(
      expect.objectContaining({ code: 'conversation-runtime-disposed' }),
    );
    expect(() => application.requireConversation('conversation-a')).toThrowError(
      expect.objectContaining({ code: 'conversation-not-found' }),
    );
  });
});

function createTestApplication(applicationId: string) {
  return createAgentTuiApplicationRuntime(
    new InMemoryUserCredentialPersistence(),
    applicationId,
  );
}
