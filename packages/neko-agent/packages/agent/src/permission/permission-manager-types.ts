/**
 * IPermissionManager — State management interface for permission system
 *
 * Separates the state management concern (mode, rules, confirmations) from
 * the ExecutorHooks concern (onToolCall interception). This allows consumers
 * like AgentSession and SkillInjectionCoordinator to depend on the management
 * interface without coupling to the hook implementation.
 *
 * Implemented by: PermissionHooks (which also implements ExecutorHooks)
 */

import type { PermissionMode, PermissionRules, ToolConfirmationRequest } from './types';

export interface IPermissionManager {
  /** Set execution mode (plan/ask/auto) */
  setMode(mode: PermissionMode): void;

  /** Get current mode */
  getMode(): PermissionMode;

  /** Update permission rules */
  updateRules(rules: PermissionRules): void;

  /** Add a dynamic allow rule (e.g., from skill injection or "Allow Always") */
  addAllowRule(pattern: string): void;

  /** Remove a dynamic allow rule (e.g., when clearing skill injection) */
  removeAllowRule(pattern: string): void;

  /** Get current rules */
  getRules(): PermissionRules;

  /** Confirm a pending tool call externally by confirmation token */
  confirmTool(confirmationToken: string, approved: boolean, allowAlways?: boolean): void;

  /** Get all pending confirmation requests */
  getPendingConfirmations(): ToolConfirmationRequest[];
}
