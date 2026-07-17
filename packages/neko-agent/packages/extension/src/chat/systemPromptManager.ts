/**
 * System Prompt Manager
 *
 * Delegates prompt building to @neko/agent's SystemPromptBuilder.
 * Extension layer only manages:
 * - Execution-mode-aware base prompt selection
 * - AGENTS.md loading trigger
 * - Platform prompt registry bridge
 *
 * All prompt content (builtin defaults, plan mode, locale variants)
 * lives in @neko/agent — no duplicates here.
 */

import * as vscode from 'vscode';
import type { Platform } from '@neko/platform';
import {
  createSystemPromptBuilder,
  runSystemPromptAgentsFileLoadRuntime,
  type SystemPromptBuilder,
} from '@neko/agent';

// =============================================================================
// SystemPromptManager
// =============================================================================

export class SystemPromptManager {
  private _platform?: Platform;
  private _builder: SystemPromptBuilder;

  constructor(platform?: Platform) {
    this._platform = platform;
    this._builder = createSystemPromptBuilder({ locale: 'en' });
  }

  /**
   * Set or update Platform reference
   */
  setPlatform(platform: Platform): void {
    this._platform = platform;
  }

  /**
   * Set locale for built-in prompts
   */
  setLocale(locale: string): void {
    this._builder.setLocale(locale.toLowerCase().startsWith('zh') ? 'zh' : 'en');
  }

  /**
   * Load AGENTS.md content (call this during initialization)
   */
  async loadAgentsFile(): Promise<void> {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    await runSystemPromptAgentsFileLoadRuntime({ workspacePath }, { builder: this._builder });
  }

  /**
   * Reload AGENTS.md content (call when file changes)
   */
  async reloadAgentsFile(): Promise<void> {
    await this.loadAgentsFile();
  }

  /**
   * Get AGENTS.md content
   */
  getAgentsContent(): string | null {
    return this._builder.getAgentsContent();
  }

  /**
   * Get AGENTS.md source
   */
  getAgentsSource(): 'personal' | 'project' | null {
    return this._builder.getAgentsSource();
  }

  /**
   * Get current base system prompt.
   *
   * AGENTS.md is loaded by this manager but projected as an environment-layer
   * overlay by the runtime session. It must not replace the base protocol.
   */
  getPrompt(executionMode: 'auto' | 'ask' | 'plan'): string {
    return this._builder.buildForExecutionMode(executionMode);
  }

  /**
   * Get prompt by ID from Platform
   */
  getPlatformPrompt(promptId: string, variables?: Record<string, unknown>): string | undefined {
    if (!this._platform) return undefined;

    const prompt = this._platform.prompts.get(promptId);
    if (!prompt) return undefined;

    if (variables) {
      const rendered = this._platform.prompts.render(promptId, variables);
      return rendered.content;
    }

    return prompt.template;
  }

  /**
   * Register a custom prompt to Platform
   */
  registerPrompt(prompt: {
    id: string;
    name: string;
    description: string;
    template: string;
    variables?: Array<{
      name: string;
      description: string;
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      required: boolean;
      default?: unknown;
    }>;
  }): void {
    if (!this._platform) return;

    this._platform.prompts.register({
      id: prompt.id,
      name: prompt.name,
      description: prompt.description,
      category: 'custom',
      template: prompt.template,
      variables: prompt.variables || [],
      version: '1.0.0',
    });
  }
}
