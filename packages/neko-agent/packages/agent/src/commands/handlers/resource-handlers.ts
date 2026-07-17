/**
 * Resource Command Handlers
 *
 * Shared handlers expose typed resource semantics. Surface Presenters own all
 * human-readable output.
 */

import {
  executeAgentTerminalCommandsSemantic,
  executeAgentTerminalSkillsSemantic,
  executeAgentTerminalToolsSemantic,
} from '../terminal-semantics';
import type { CommandHandler } from '../types';

/** Handle /skills command. */
export const handleSkills: CommandHandler = (args, context) => ({
  handled: true,
  continueExecution: true,
  semantic: {
    family: 'skills',
    result: executeAgentTerminalSkillsSemantic(args, context),
  },
});

/** Handle /commands command. */
export const handleCommands: CommandHandler = (args, context) => ({
  handled: true,
  continueExecution: true,
  semantic: {
    family: 'commands',
    result: executeAgentTerminalCommandsSemantic(args, context),
  },
});

/** Handle /tools command. */
export const handleTools: CommandHandler = (args, context) => ({
  handled: true,
  continueExecution: true,
  semantic: {
    family: 'tools',
    result: executeAgentTerminalToolsSemantic(args, context),
  },
});

/** Handle /tasks command (extension only). */
export const handleTasks: CommandHandler = () => ({
  handled: true,
  continueExecution: true,
  action: 'showTasks',
});

/** Handle /mcp command (extension only). */
export const handleMcp: CommandHandler = () => ({
  handled: true,
  continueExecution: true,
  action: 'showMCPServers',
});
