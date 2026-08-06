import { describe, expect, it, vi } from 'vitest';
import type { AgentWebviewToHostMessage } from '@neko/agent-contracts';
import {
  tryHandleAgentConfigControllerRoute,
  type AgentConfigControllerEffectPort,
  type AgentHostRouteEffectContext,
} from '..';

function createContext(): AgentHostRouteEffectContext {
  return {
    identity: {
      hostKind: 'electron',
      applicationId: 'app-1',
      windowId: 'window-1',
      viewId: 'view-1',
      workspaceId: 'workspace-1',
      connectionId: 'connection-1',
    },
    post: vi.fn(),
  };
}

function createEffects(): AgentConfigControllerEffectPort {
  return {
    readSettings: vi.fn(),
    readConfig: vi.fn(),
    refreshConfig: vi.fn(),
    openUserConfig: vi.fn(),
    openHostConfig: vi.fn(),
    readTabState: vi.fn(),
    updateSettings: vi.fn(),
    updateTabState: vi.fn(),
  };
}

async function dispatch(
  message: AgentWebviewToHostMessage,
  effects: AgentConfigControllerEffectPort,
  context: AgentHostRouteEffectContext,
): Promise<void> {
  const operation = tryHandleAgentConfigControllerRoute(message, effects, context);
  if (!operation) {
    throw new Error(`Expected shared config controller to handle ${message.type}.`);
  }
  await operation;
}

describe('Agent config controller', () => {
  it('routes global, conversation and View config operations through narrow effects', async () => {
    const effects = createEffects();
    const context = createContext();
    const settings = Object.freeze({ executionMode: 'ask' });
    const tabStateMessage = {
      type: 'updateTabState' as const,
      openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conversation-1' }],
      activeTabId: 'tab-1',
    };

    await dispatch({ type: 'getSettings', conversationId: 'conversation-1' }, effects, context);
    await dispatch({ type: 'getConfig' }, effects, context);
    await dispatch({ type: 'refreshConfigSnapshot' }, effects, context);
    await dispatch({ type: 'openUserConfigFile' }, effects, context);
    await dispatch({ type: 'openConfigFile' }, effects, context);
    await dispatch({ type: 'getTabState' }, effects, context);
    await dispatch(
      { type: 'updateSettings', conversationId: 'conversation-1', settings },
      effects,
      context,
    );
    await dispatch(tabStateMessage, effects, context);

    expect(effects.readSettings).toHaveBeenCalledWith('conversation-1', context);
    expect(effects.readConfig).toHaveBeenCalledWith(context);
    expect(effects.refreshConfig).toHaveBeenCalledWith(context);
    expect(effects.openUserConfig).toHaveBeenCalledWith(context);
    expect(effects.openHostConfig).toHaveBeenCalledWith(context);
    expect(effects.readTabState).toHaveBeenCalledWith(context);
    expect(effects.updateSettings).toHaveBeenCalledWith(
      { conversationId: 'conversation-1', settings },
      context,
    );
    expect(effects.updateTabState).toHaveBeenCalledWith(tabStateMessage, context);
  });

  it('rejects conversation settings without explicit identity', async () => {
    const effects = createEffects();
    const context = createContext();

    await dispatch({ type: 'getSettings', conversationId: '' }, effects, context);
    await dispatch(
      { type: 'updateSettings', conversationId: '', settings: { executionMode: 'auto' } },
      effects,
      context,
    );

    expect(effects.readSettings).not.toHaveBeenCalled();
    expect(effects.updateSettings).not.toHaveBeenCalled();
    expect(context.post).toHaveBeenNthCalledWith(1, {
      type: 'globalError',
      message: 'Cannot get settings without an explicit conversationId.',
    });
    expect(context.post).toHaveBeenNthCalledWith(2, {
      type: 'globalError',
      message: 'Cannot update settings without an explicit conversationId.',
    });
  });

  it('does not claim another controller partition', () => {
    const effects = createEffects();
    const context = createContext();

    expect(tryHandleAgentConfigControllerRoute({ type: 'getSkills' }, effects, context)).toBeNull();
  });
});
