import { describe, expect, it, vi } from 'vitest';
import type { AgentWebviewToHostMessage } from '@neko/agent-contracts';
import {
  tryHandleAgentSkillControllerRoute,
  type AgentHostRouteEffectContext,
  type AgentSkillControllerEffectPort,
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

function createEffects(): AgentSkillControllerEffectPort {
  return {
    readInputCatalog: vi.fn(),
    invokeInput: vi.fn(),
    readContextTokenCount: vi.fn(),
    compressContext: vi.fn(),
  };
}

async function dispatch(
  message: AgentWebviewToHostMessage,
  effects: AgentSkillControllerEffectPort,
  context: AgentHostRouteEffectContext,
): Promise<void> {
  const operation = tryHandleAgentSkillControllerRoute(message, effects, context);
  if (!operation) {
    throw new Error(`Expected shared Skill controller to handle ${message.type}.`);
  }
  await operation;
}

describe('Agent Skill controller', () => {
  it('routes the exact catalog, typed invocation and context controls', async () => {
    const effects = createEffects();
    const context = createContext();

    await dispatch(
      { type: 'getAgentInputCatalog', conversationId: 'conversation-1' },
      effects,
      context,
    );
    await dispatch(
      {
        type: 'invokeAgentInput',
        conversationId: 'conversation-1',
        input: {
          kind: 'skill',
          catalogEntryId: 'skill:project:quality-review',
          skillName: 'quality-review',
          activationId: 'skill:project:skill:quality-review-fingerprint',
          args: 'changed files',
        },
      },
      effects,
      context,
    );
    await dispatch(
      { type: 'getContextTokenCount', conversationId: 'conversation-1' },
      effects,
      context,
    );
    await dispatch({ type: 'compressContext', conversationId: 'conversation-1' }, effects, context);

    expect(effects.readInputCatalog).toHaveBeenCalledWith('conversation-1', context);
    expect(effects.invokeInput).toHaveBeenCalledWith(
      {
        conversationId: 'conversation-1',
        input: {
          kind: 'skill',
          catalogEntryId: 'skill:project:quality-review',
          skillName: 'quality-review',
          activationId: 'skill:project:skill:quality-review-fingerprint',
          args: 'changed files',
        },
      },
      context,
    );
    expect(effects.readContextTokenCount).toHaveBeenCalledWith('conversation-1', context);
    expect(effects.compressContext).toHaveBeenCalledWith('conversation-1', context);
  });

  it('rejects typed input and context operations without explicit conversation identity', async () => {
    const effects = createEffects();
    const context = createContext();

    await dispatch(
      {
        type: 'invokeAgentInput',
        conversationId: '',
        input: {
          kind: 'skill',
          catalogEntryId: 'skill:project:quality-review',
          skillName: 'quality-review',
          activationId: 'skill:project:skill:quality-review-fingerprint',
        },
      },
      effects,
      context,
    );
    await dispatch({ type: 'compressContext', conversationId: '' }, effects, context);

    expect(effects.invokeInput).not.toHaveBeenCalled();
    expect(effects.compressContext).not.toHaveBeenCalled();
    expect(context.post).toHaveBeenNthCalledWith(1, {
      type: 'globalError',
      message: 'Cannot invoke Agent input without an explicit conversationId.',
    });
    expect(context.post).toHaveBeenNthCalledWith(2, {
      type: 'globalError',
      message: 'Cannot compress context without an explicit conversationId.',
    });
  });

  it('does not claim another controller partition', () => {
    const effects = createEffects();
    const context = createContext();

    expect(tryHandleAgentSkillControllerRoute({ type: 'getConfig' }, effects, context)).toBeNull();
  });
});
