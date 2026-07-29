import { describe, expect, it, vi } from 'vitest';
import type { AgentWebviewToHostMessage } from '@neko-agent/types';
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
      rendererEpoch: 'renderer-1',
      connectionId: 'connection-1',
    },
    post: vi.fn(),
  };
}

function createEffects(): AgentSkillControllerEffectPort {
  return {
    listSkills: vi.fn(),
    invokeSlashCommand: vi.fn(),
    invokeSkill: vi.fn(),
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
  it('routes the catalog, explicit Skill/slash turns and context controls', async () => {
    const effects = createEffects();
    const context = createContext();

    await dispatch({ type: 'getSkills' }, effects, context);
    await dispatch(
      {
        type: 'invokeSlashCommand',
        command: 'status',
        args: '--verbose',
        conversationId: 'conversation-1',
      },
      effects,
      context,
    );
    await dispatch(
      {
        type: 'invokeSkill',
        skillName: 'quality-review',
        args: 'changed files',
        conversationId: 'conversation-1',
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

    expect(effects.listSkills).toHaveBeenCalledWith(context);
    expect(effects.invokeSlashCommand).toHaveBeenCalledWith(
      {
        conversationId: 'conversation-1',
        command: 'status',
        args: '--verbose',
      },
      context,
    );
    expect(effects.invokeSkill).toHaveBeenCalledWith(
      {
        conversationId: 'conversation-1',
        skillName: 'quality-review',
        args: 'changed files',
      },
      context,
    );
    expect(effects.readContextTokenCount).toHaveBeenCalledWith('conversation-1', context);
    expect(effects.compressContext).toHaveBeenCalledWith('conversation-1', context);
  });

  it('rejects Skill and context operations without explicit conversation identity', async () => {
    const effects = createEffects();
    const context = createContext();

    await dispatch(
      {
        type: 'invokeSkill',
        skillName: 'quality-review',
        conversationId: '',
      },
      effects,
      context,
    );
    await dispatch({ type: 'compressContext', conversationId: '' }, effects, context);

    expect(effects.invokeSkill).not.toHaveBeenCalled();
    expect(effects.compressContext).not.toHaveBeenCalled();
    expect(context.post).toHaveBeenNthCalledWith(1, {
      type: 'globalError',
      message: 'Cannot invoke skill without an explicit conversationId.',
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
