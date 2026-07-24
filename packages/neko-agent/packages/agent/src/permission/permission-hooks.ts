/**
 * Permission Hooks - ExecutorHooks implementation for permission management
 *
 * Implements Claude Code compatible permission model:
 * - Integrates with AgentExecutor via hooks system
 * - Supports deny/allow/ask rules
 * - Handles plan/ask/auto execution modes
 * - Provides confirmation callback for ask decisions
 */

import type { ExecutorHooks, ToolCallInfo, ToolResultWithMeta, ToolResult } from '@neko/shared';
import type {
  PermissionConfig,
  PermissionMode,
  PermissionRules,
  ConfirmToolCallback,
  ToolConfirmationRequest,
} from './types';
import type { IPermissionManager } from './permission-manager-types';
import { DEFAULT_PERMISSION_CONFIG } from './types';
import { PermissionRuleMatcher, normalizeToolCall } from './rule-matcher';
import type { ToolTraitsRegistry } from './tool-traits-registry';
import type { SettingsHookLoader } from '../hook-loader/settings-hook-loader';
import { getLogger } from '../utils/logger';

const logger = getLogger('PermissionHooks');

/**
 * Permission hooks options
 */
export interface PermissionHooksOptions {
  /** Initial permission config */
  config?: PermissionConfig;

  /** Callback for tool confirmation (ask mode) */
  onConfirmTool?: ConfirmToolCallback;

  /** Callback when tool is denied */
  onToolDenied?: (toolCall: ToolCallInfo, reason: string) => void;

  /** Callback when tool is allowed */
  onToolAllowed?: (toolCall: ToolCallInfo, reason: string) => void;

  /** Callback when entering ask flow */
  onToolAskStarted?: (request: ToolConfirmationRequest) => void;

  /** Shell hook loader for executing PreToolUse hooks from settings.json */
  settingsHookLoader?: SettingsHookLoader;

  /** Tool traits registry for conditional auto mode (creative scenarios) */
  traitsRegistry?: ToolTraitsRegistry;
}

/**
 * Permission Hooks - Implements permission checking in agent execution
 */
export class PermissionHooks implements ExecutorHooks, IPermissionManager {
  name = 'permission';

  private matcher: PermissionRuleMatcher;
  private onConfirmTool?: ConfirmToolCallback;
  private onToolDenied?: (toolCall: ToolCallInfo, reason: string) => void;
  private onToolAllowed?: (toolCall: ToolCallInfo, reason: string) => void;
  private onToolAskStarted?: (request: ToolConfirmationRequest) => void;
  private settingsHookLoader?: SettingsHookLoader;

  // Pending confirmations
  private pendingConfirmations = new Map<
    string,
    {
      resolve: (approved: boolean) => void;
      request: ToolConfirmationRequest;
    }
  >();

  // Token counter for unique confirmation IDs
  private tokenCounter = 0;

  constructor(options: PermissionHooksOptions = {}) {
    const config = options.config || DEFAULT_PERMISSION_CONFIG;
    this.matcher = new PermissionRuleMatcher(config, options.traitsRegistry);
    this.onConfirmTool = options.onConfirmTool;
    this.onToolDenied = options.onToolDenied;
    this.onToolAllowed = options.onToolAllowed;
    this.onToolAskStarted = options.onToolAskStarted;
    this.settingsHookLoader = options.settingsHookLoader;
  }

  /**
   * Update permission configuration
   */
  updateConfig(config: Partial<PermissionConfig>): void {
    this.matcher.updateConfig(config);
  }

  /**
   * Set execution mode
   */
  setMode(mode: PermissionMode): void {
    this.matcher.updateConfig({ mode });
  }

  /**
   * Get current mode
   */
  getMode(): PermissionMode {
    return this.matcher.getMode() as PermissionMode;
  }

  /**
   * Update rules
   */
  updateRules(rules: PermissionRules): void {
    this.matcher.updateConfig({ rules });
  }

  /**
   * Add a rule dynamically (e.g., from "Allow Always" action)
   */
  addAllowRule(pattern: string): void {
    if (isPersistentShellAllowRuleForbidden(pattern)) {
      throw new Error(
        `Persistent shell allow rules are disabled for creative Agent sessions: ${pattern}`,
      );
    }
    this.matcher.addRule('allow', pattern);
  }

  /**
   * Remove an allow rule dynamically (e.g., when clearing skill injection)
   */
  removeAllowRule(pattern: string): void {
    this.matcher.removeRule('allow', pattern);
  }

  /**
   * Get current rules
   */
  getRules(): PermissionRules {
    return this.matcher.getRules();
  }

  /**
   * Confirm a pending tool call externally
   */
  confirmTool(confirmationToken: string, approved: boolean, allowAlways?: boolean): void {
    logger.debug('confirmTool called', {
      confirmationToken,
      approved,
      allowAlways,
      hasPending: this.pendingConfirmations.has(confirmationToken),
      pendingCount: this.pendingConfirmations.size,
    });

    const pending = this.pendingConfirmations.get(confirmationToken);
    if (pending) {
      // If allowAlways, add to allow rules
      if (approved && allowAlways) {
        const pattern = normalizeToolCall(pending.request.toolCall);
        if (!isPersistentShellAllowRuleForbidden(pattern)) {
          this.addAllowRule(pattern);
        }
      }

      logger.debug('Resolving Promise for tool', { toolName: pending.request.toolCall.name });
      pending.resolve(approved);
      this.pendingConfirmations.delete(confirmationToken);
    } else {
      logger.warn('No pending confirmation found for token', { confirmationToken });
    }
  }

  /**
   * Get pending confirmations
   */
  getPendingConfirmations(): ToolConfirmationRequest[] {
    return Array.from(this.pendingConfirmations.values()).map((p) => p.request);
  }

  /**
   * Hook: onToolCall - Main permission checking logic
   *
   * Called for each tool execution. Returns result or throws to block.
   */
  async onToolCall(
    info: ToolCallInfo,
    _execute: () => Promise<ToolResult>,
  ): Promise<ToolResultWithMeta | null> {
    // Execute shell hooks from settings.json (PreToolUse) before TS permission rules
    if (this.settingsHookLoader) {
      const hookResult = await this.settingsHookLoader.executePreToolUse(
        info.name,
        (info.arguments ?? {}) as Record<string, unknown>,
      );
      if (hookResult.blocked) {
        this.onToolDenied?.(info, hookResult.reason ?? 'Blocked by PreToolUse hook');
        return {
          success: false,
          error: hookResult.reason ?? 'Tool execution blocked by hook',
          callId: info.id,
          name: info.name,
        };
      }
    }

    // Check permission
    const result = this.matcher.check(info);

    logger.debug('onToolCall', {
      toolName: info.name,
      toolId: info.id,
      decision: result.decision,
      reason: result.reason,
      mode: this.matcher.getMode(),
    });

    switch (result.decision) {
      case 'deny':
        // Tool is denied - return error result without executing
        this.onToolDenied?.(info, result.reason);
        return {
          success: false,
          error: result.reason,
          callId: info.id,
          name: info.name,
        };

      case 'allow':
        // Tool is allowed - return null to let subsequent hooks (e.g. RetryHooks) handle execution
        this.onToolAllowed?.(info, result.reason);
        return null;

      case 'ask': {
        // Tool requires confirmation
        const approved = await this.requestConfirmation(info);

        if (approved) {
          // Approved - return null to let subsequent hooks handle execution
          this.onToolAllowed?.(info, 'User approved');
          return null;
        } else {
          this.onToolDenied?.(info, 'User denied');
          return {
            success: false,
            error: 'Tool execution denied by user',
            callId: info.id,
            name: info.name,
          };
        }
      }

      default:
        // Should not reach here - let subsequent hooks handle
        return null;
    }
  }

  /**
   * Request user confirmation for a tool call
   */
  private async requestConfirmation(toolCall: ToolCallInfo): Promise<boolean> {
    const confirmationToken = this.generateToken();
    const normalizedTool = normalizeToolCall(toolCall);

    const request: ToolConfirmationRequest = {
      toolCall,
      action: this.getActionDescription(toolCall),
      description: `Execute ${toolCall.name}`,
      details: createConfirmationDetails(toolCall, normalizedTool),
      confirmationToken,
    };

    logger.debug('requestConfirmation: Creating Promise', {
      toolName: toolCall.name,
      toolId: toolCall.id,
      confirmationToken,
    });

    // Notify that ask flow started
    this.onToolAskStarted?.(request);

    // If we have a callback, use it
    if (this.onConfirmTool) {
      logger.debug('Using onConfirmTool callback');
      const response = await this.onConfirmTool(request);

      // Handle allow always
      if (
        response.approved &&
        response.allowAlways &&
        !isPersistentShellAllowRuleForbidden(normalizedTool)
      ) {
        this.addAllowRule(normalizedTool);
      }

      return response.approved;
    }

    // Otherwise, wait for external confirmation via confirmTool()
    logger.debug('Waiting for external confirmation via confirmTool()');
    return new Promise<boolean>((resolve) => {
      // Timeout after 5 minutes - deny by default
      const timeoutId = setTimeout(
        () => {
          if (this.pendingConfirmations.has(confirmationToken)) {
            logger.warn('Confirmation timeout', { confirmationToken });
            this.pendingConfirmations.delete(confirmationToken);
            resolve(false);
          }
        },
        5 * 60 * 1000,
      );

      const wrappedResolve = (approved: boolean) => {
        clearTimeout(timeoutId);
        resolve(approved);
      };

      this.pendingConfirmations.set(confirmationToken, { resolve: wrappedResolve, request });
      logger.debug('Pending confirmations count', { count: this.pendingConfirmations.size });
    });
  }

  /**
   * Generate human-readable action description
   */
  private getActionDescription(toolCall: ToolCallInfo): string {
    const { name, arguments: args } = toolCall;

    switch (name) {
      case 'Bash':
        return `Run command: ${args?.command || 'unknown'}`;
      case 'Read':
        return `Read file: ${args?.file_path || args?.path || 'unknown'}`;
      case 'Write':
        return `Write file: ${args?.file_path || 'unknown'}`;
      case 'Edit':
        return `Edit file: ${args?.file_path || 'unknown'}`;
      case 'WebFetch':
        return formatExternalResearchFetchAction(args);
      case 'WebSearch':
        return formatExternalResearchSearchAction(args);
      default:
        return `Execute ${name}`;
    }
  }

  /**
   * Generate unique confirmation token
   */
  private generateToken(): string {
    return `perm_${Date.now()}_${++this.tokenCounter}`;
  }
}

function createConfirmationDetails(
  toolCall: ToolCallInfo,
  normalizedTool: string,
): Record<string, unknown> {
  const args = toolCall.arguments ?? {};
  if (toolCall.name === 'WebFetch' || toolCall.name === 'WebSearch') {
    return {
      normalizedTool,
      arguments: args,
      mode: args['mode'],
      providerId: args['providerId'],
      domain: args['domain'],
      query: args['query'],
      url: args['url'],
    };
  }
  return {
    normalizedTool,
    arguments: args,
  };
}

function formatExternalResearchFetchAction(args: Record<string, unknown> | undefined): string {
  const url = typeof args?.['url'] === 'string' ? args['url'] : 'unknown';
  const mode = typeof args?.['mode'] === 'string' ? args['mode'] : 'unknown-mode';
  const providerId =
    typeof args?.['providerId'] === 'string' ? args['providerId'] : 'unknown-provider';
  const domain = typeof args?.['domain'] === 'string' ? args['domain'] : safeDomainFromUrl(url);
  return `Fetch URL: ${url} (${mode}, ${providerId}, ${domain})`;
}

function formatExternalResearchSearchAction(args: Record<string, unknown> | undefined): string {
  const query = typeof args?.['query'] === 'string' ? args['query'] : 'unknown';
  const mode = typeof args?.['mode'] === 'string' ? args['mode'] : 'unknown-mode';
  const providerId =
    typeof args?.['providerId'] === 'string' ? args['providerId'] : 'unknown-provider';
  return `Search web: ${query} (${mode}, ${providerId})`;
}

function safeDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown-domain';
  }
}

/**
 * Create permission hooks with default options
 */
export function createPermissionHooks(options?: PermissionHooksOptions): PermissionHooks {
  return new PermissionHooks(options);
}

function isPersistentShellAllowRuleForbidden(pattern: string): boolean {
  const trimmed = pattern.trim();
  return trimmed === 'Bash' || /^Bash\(/.test(trimmed);
}
