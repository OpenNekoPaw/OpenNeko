import type { AgentSkillControllerEffectPort } from '@neko/agent/runtime';
import type { VSCodeAgentHostControllerDeps } from './types';

export function createVSCodeSkillControllerEffects(
  deps: VSCodeAgentHostControllerDeps,
): AgentSkillControllerEffectPort {
  return {
    listSkills: () => deps.skillHandler.sendSkillsList(deps.webview),
    invokeSlashCommand: ({ command, args, conversationId }) =>
      deps.slashCommandHandler.handleCommand(deps.webview, command, args, conversationId),
    invokeSkill: ({ skillName, args, conversationId }) =>
      deps.skillHandler.handleSkillInvocation(deps.webview, skillName, conversationId, args),
    readContextTokenCount: (conversationId) =>
      deps.contextHandler.getTokenCount(deps.webview, conversationId),
    compressContext: (conversationId) =>
      deps.contextHandler.compressContext(deps.webview, conversationId),
  };
}
