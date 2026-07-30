/**
 * Settings Hook Loader
 *
 * Loads hooks from settings.json (Claude Code compatible format)
 *
 * Configuration locations:
 * - Project: .neko/settings.json
 * - Personal: ~/.neko/settings.json
 * - Local: .neko/settings.local.json
 */

import type {
  HookEvent,
  NekoSettings,
  SettingsHookConfig,
  SettingsHookAction,
  HookInput,
  HookOutput,
} from '@neko/shared';
import { matchHookMatcher } from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('SettingsHookLoader');

// =============================================================================
// Types
// =============================================================================

export interface SettingsHookLoaderOptions {
  /** File system interface */
  fs: ISettingsFileSystem;
  /** Shell executor interface */
  shell: IShellExecutor;
}

export interface ISettingsFileSystem {
  readFile(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
}

export interface IShellExecutor {
  /**
   * Execute a shell command with stdin input
   * @returns { exitCode, stdout, stderr }
   */
  execute(
    command: string,
    stdin?: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export interface LoadedSettingsHook {
  event: HookEvent;
  matcher: string;
  action: SettingsHookAction;
  source: 'project' | 'personal' | 'local';
}

export interface SettingsHookLoadResult {
  hooks: LoadedSettingsHook[];
  errors: Array<{ file: string; message: string }>;
}

export interface HookExecutionResult {
  success: boolean;
  blocked: boolean;
  reason?: string;
  updatedInput?: Record<string, unknown>;
  stdout?: string;
  stderr?: string;
}

// =============================================================================
// SettingsHookLoader
// =============================================================================

export class SettingsHookLoader {
  private fs: ISettingsFileSystem;
  private shell: IShellExecutor;
  private hooks: LoadedSettingsHook[] = [];

  constructor(options: SettingsHookLoaderOptions) {
    this.fs = options.fs;
    this.shell = options.shell;
  }

  /**
   * Load hooks from settings files
   * Priority: local > project > personal
   */
  async loadFromSettings(
    projectPath: string,
    personalPath: string,
  ): Promise<SettingsHookLoadResult> {
    const result: SettingsHookLoadResult = {
      hooks: [],
      errors: [],
    };

    // Load in order: personal (lowest) -> project -> local (highest)
    const sources: Array<{ path: string; source: 'project' | 'personal' | 'local' }> = [
      { path: personalPath, source: 'personal' },
      { path: `${projectPath}/settings.json`, source: 'project' },
      { path: `${projectPath}/settings.local.json`, source: 'local' },
    ];

    for (const { path, source } of sources) {
      try {
        const exists = await this.fs.exists(path);
        if (!exists) continue;

        const content = await this.fs.readFile(path);
        const settings = JSON.parse(content) as NekoSettings;

        if (settings.hooks) {
          const hooks = this.parseHooksConfig(settings.hooks, source);
          result.hooks.push(...hooks);
        }
      } catch (error) {
        result.errors.push({
          file: path,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.hooks = result.hooks;
    return result;
  }

  /**
   * Parse hooks configuration into LoadedSettingsHook array
   */
  private parseHooksConfig(
    hooksConfig: Partial<Record<HookEvent, SettingsHookConfig[]>>,
    source: 'project' | 'personal' | 'local',
  ): LoadedSettingsHook[] {
    const hooks: LoadedSettingsHook[] = [];

    for (const [eventStr, configs] of Object.entries(hooksConfig)) {
      const event = eventStr as HookEvent;
      if (!configs) continue;

      for (const config of configs) {
        for (const action of config.hooks) {
          hooks.push({
            event,
            matcher: config.matcher,
            action,
            source,
          });
        }
      }
    }

    return hooks;
  }

  /**
   * Get hooks for a specific event
   */
  getHooksForEvent(event: HookEvent): LoadedSettingsHook[] {
    return this.hooks.filter((h) => h.event === event);
  }

  /**
   * Execute hooks for PreToolUse event
   * Returns whether the tool call should be blocked
   */
  async executePreToolUse(
    toolName: string,
    toolInput: Record<string, unknown>,
  ): Promise<HookExecutionResult> {
    const hooks = this.getHooksForEvent('PreToolUse').filter((h) =>
      matchHookMatcher(h.matcher, toolName),
    );

    if (hooks.length === 0) {
      return { success: true, blocked: false };
    }

    const input: HookInput = {
      tool_name: toolName,
      tool_input: toolInput,
      timestamp: new Date().toISOString(),
    };

    for (const hook of hooks) {
      const result = await this.executeHook(hook, input);

      // Check if hook wants to block
      if (!result.success || result.blocked) {
        return result;
      }

      // Check if hook modified input
      if (result.updatedInput) {
        Object.assign(toolInput, result.updatedInput);
      }
    }

    return { success: true, blocked: false };
  }

  /**
   * Execute hooks for UserPromptSubmit event
   * Returns whether the message should be blocked, and any additional context to prepend
   */
  async executeUserPromptSubmit(message: string): Promise<HookExecutionResult> {
    const hooks = this.getHooksForEvent('UserPromptSubmit');

    if (hooks.length === 0) {
      return { success: true, blocked: false };
    }

    const input: HookInput = {
      message,
      timestamp: new Date().toISOString(),
    };

    let combinedStdout = '';

    for (const hook of hooks) {
      const result = await this.executeHook(hook, input);

      // Accumulate stdout for context injection
      if (result.stdout?.trim()) {
        combinedStdout += (combinedStdout ? '\n' : '') + result.stdout.trim();
      }

      // Check if hook wants to block
      if (!result.success || result.blocked) {
        return result;
      }
    }

    return { success: true, blocked: false, stdout: combinedStdout || undefined };
  }

  /**
   * Execute hooks for PostToolUse event
   */
  async executePostToolUse(
    toolName: string,
    toolInput: Record<string, unknown>,
    success: boolean,
    output?: string,
  ): Promise<void> {
    const event = success ? 'PostToolUse' : 'PostToolUseFailure';
    const hooks = this.getHooksForEvent(event).filter((h) => matchHookMatcher(h.matcher, toolName));

    if (hooks.length === 0) return;

    const input: HookInput = {
      tool_name: toolName,
      tool_input: toolInput,
      success,
      output,
      timestamp: new Date().toISOString(),
    };

    for (const hook of hooks) {
      await this.executeHook(hook, input);
    }
  }

  /**
   * Execute a single hook
   */
  private async executeHook(
    hook: LoadedSettingsHook,
    input: HookInput,
  ): Promise<HookExecutionResult> {
    if (hook.action.type !== 'command') {
      return { success: true, blocked: false };
    }

    try {
      const stdinJson = JSON.stringify(input);
      const { exitCode, stdout, stderr } = await this.shell.execute(hook.action.command, stdinJson);

      // Parse stdout as JSON if possible
      let output: HookOutput | null = null;
      if (stdout.trim()) {
        try {
          output = JSON.parse(stdout.trim()) as HookOutput;
        } catch {
          // stdout is not JSON, that's OK
        }
      }

      // Check exit code and output decision
      const blocked = exitCode !== 0 || output?.decision === 'block' || output?.decision === 'deny';

      return {
        success: exitCode === 0,
        blocked,
        reason: output?.reason,
        updatedInput: output?.updatedInput,
        stdout,
        stderr,
      };
    } catch (error) {
      logger.error('Hook execution failed', { error });
      return {
        success: false,
        blocked: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get all loaded hooks
   */
  getAllHooks(): LoadedSettingsHook[] {
    return [...this.hooks];
  }

  /**
   * Clear loaded hooks
   */
  clear(): void {
    this.hooks = [];
  }
}

/**
 * Create a SettingsHookLoader with provided options
 */
export function createSettingsHookLoader(options: SettingsHookLoaderOptions): SettingsHookLoader {
  return new SettingsHookLoader(options);
}
