/**
 * Command Handlers Index
 *
 * Exports all command handlers.
 */

export {
  handleHelp,
  handleStatus,
  handleClear,
  handleExit,
  generateExtensionStatusData,
} from './core-handlers';

export {
  handleConfig,
  handleModel,
  handleSettings,
  handlePermissions,
  handleInit,
} from './config-handlers';

export { handleNew, handleResume, handleCompact, handlePlan } from './session-handlers';

export {
  handleSkills,
  handleCommands,
  handleTools,
  handleTasks,
  handleMcp,
} from './resource-handlers';
