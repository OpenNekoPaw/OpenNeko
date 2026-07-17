/**
 * Prompt Manager - Simple implementation for Platform
 *
 * This is a lightweight PromptManager for the platform layer.
 * Skill prompt-chains are natural-language guidance interpreted by the Agent
 * inside IDC, not runtime chain-executor workflows.
 */

import type { Prompt, PromptCategory, RenderedPrompt, IPromptManager } from '@neko/shared';

/**
 * Platform Prompt Manager implementation
 */
export class PromptManager implements IPromptManager {
  private prompts: Map<string, Prompt> = new Map();

  /**
   * List all prompts
   */
  list(): Prompt[] {
    return Array.from(this.prompts.values());
  }

  /**
   * List prompts by category
   */
  listByCategory(category: PromptCategory): Prompt[] {
    return this.list().filter((p) => p.category === category);
  }

  /**
   * Get prompt by ID
   */
  get(id: string): Prompt | undefined {
    return this.prompts.get(id);
  }

  /**
   * Render prompt with variables
   */
  render(id: string, variables: Record<string, unknown>): RenderedPrompt {
    const prompt = this.prompts.get(id);
    if (!prompt) {
      throw new Error(`Prompt '${id}' not found`);
    }

    const warnings: string[] = [];
    let content = prompt.template;

    // Check for missing required variables
    for (const varDef of prompt.variables) {
      const value = variables[varDef.name];

      if (value === undefined || value === null) {
        if (varDef.required && varDef.default === undefined) {
          warnings.push(`Missing required variable: ${varDef.name}`);
        }
      }
    }

    // Substitute variables
    content = content.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const varDef = prompt.variables.find((v) => v.name === varName);
      let value = variables[varName];

      if (value === undefined || value === null) {
        if (varDef?.default !== undefined) {
          value = varDef.default;
        } else {
          return match; // Keep placeholder if no value
        }
      }

      return this.formatValue(value, varDef?.type || 'string');
    });

    return {
      content,
      variables,
      warnings,
    };
  }

  /**
   * Register a prompt
   */
  register(prompt: Prompt): void {
    this.prompts.set(prompt.id, prompt);
  }

  /**
   * Unregister a prompt
   */
  unregister(id: string): void {
    this.prompts.delete(id);
  }

  /**
   * Check if a prompt exists
   */
  has(id: string): boolean {
    return this.prompts.has(id);
  }

  /**
   * Get prompt count
   */
  get size(): number {
    return this.prompts.size;
  }

  /**
   * Clear all prompts
   */
  clear(): void {
    this.prompts.clear();
  }

  private formatValue(value: unknown, type: string): string {
    switch (type) {
      case 'string':
        return String(value);
      case 'number':
        return String(value);
      case 'boolean':
        return value ? 'true' : 'false';
      case 'object':
      case 'array':
        return JSON.stringify(value, null, 2);
      default:
        return String(value);
    }
  }
}
