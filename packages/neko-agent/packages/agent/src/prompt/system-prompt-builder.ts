/**
 * System Prompt Builder — Initialization-phase prompt construction from static sources
 *
 * Responsibility: load AGENTS.md environment content, select locale/mode, and
 * produce the exact base system prompt supplied to the Pi runtime.
 *
 * Usage:
 * ```typescript
 * const builder = new SystemPromptBuilder({ locale: 'en' });
 * await builder.loadAgentsFile('/path/to/project', '/home/user/.neko');
 * const systemPrompt = builder.build();
 * ```
 */

import { createHash } from 'node:crypto';
import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';

import type {
  SystemPromptBuilderConfig,
  PromptExecutionMode,
  PromptLocale,
  AgentsSource,
  AgentsLoadResult,
} from './system-prompt-builder-types';
import type { PromptCompositionFragmentProjection } from './prompt-composition-projection';

import { BUILTIN_PROMPTS } from './builtin-prompts';

// =============================================================================
// Constants
// =============================================================================

/** AGENTS.md filename */
const AGENTS_FILENAME = 'AGENTS.md';

/** Config directory name */
const CONFIG_DIR = '.neko';

// =============================================================================
// SystemPromptBuilder Implementation
// =============================================================================

/**
 * System Prompt Builder
 */
export class SystemPromptBuilder {
  private _locale: PromptLocale;
  private _executionMode: PromptExecutionMode;
  private _customDefaultPrompt?: string;
  private _customPlanPrompt?: string;
  private _agentsContent: string | null = null;
  private _agentsSource: AgentsSource = null;

  constructor(config: SystemPromptBuilderConfig = {}) {
    this._locale = this._normalizeLocale(config.locale);
    this._executionMode = config.executionMode ?? 'ask';
    this._customDefaultPrompt = config.customDefaultPrompt;
    this._customPlanPrompt = config.customPlanPrompt;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setLocale(locale: PromptLocale | string): void {
    this._locale = this._normalizeLocale(locale);
  }

  getLocale(): PromptLocale {
    return this._locale;
  }

  setExecutionMode(mode: PromptExecutionMode): void {
    this._executionMode = mode;
  }

  getExecutionMode(): PromptExecutionMode {
    return this._executionMode;
  }

  // ---------------------------------------------------------------------------
  // AGENTS.md Management
  // ---------------------------------------------------------------------------

  async loadAgentsFile(
    projectPath?: string,
    personalPath?: string,
  ): Promise<AgentsLoadResult | null> {
    // Try project AGENTS.md first (higher priority)
    if (projectPath) {
      const projectAgentsPath = path.join(projectPath, CONFIG_DIR, AGENTS_FILENAME);
      const result = await this._tryLoadFile(projectAgentsPath, 'project');
      if (result) {
        this._agentsContent = result.content;
        this._agentsSource = result.source;
        return result;
      }
    }

    // Try personal AGENTS.md
    if (personalPath) {
      const personalAgentsPath = path.join(personalPath, AGENTS_FILENAME);
      const result = await this._tryLoadFile(personalAgentsPath, 'personal');
      if (result) {
        this._agentsContent = result.content;
        this._agentsSource = result.source;
        return result;
      }
    }

    // No AGENTS.md found
    this._agentsContent = null;
    this._agentsSource = null;
    return null;
  }

  setAgentsContent(content: string | null, source: AgentsSource = null): void {
    this._agentsContent = content;
    this._agentsSource = source;
  }

  getAgentsContent(): string | null {
    return this._agentsContent;
  }

  getAgentsSource(): AgentsSource {
    return this._agentsSource;
  }

  // ---------------------------------------------------------------------------
  // Prompt Building
  // ---------------------------------------------------------------------------

  build(): string {
    return this._buildForExecutionMode(this._executionMode);
  }

  buildForExecutionMode(mode: PromptExecutionMode): string {
    return this._buildForExecutionMode(mode);
  }

  projectCompositionForExecutionMode(
    mode: PromptExecutionMode,
  ): readonly PromptCompositionFragmentProjection[] {
    const base = this._baseForExecutionMode(mode);
    const fragments: PromptCompositionFragmentProjection[] = [
      {
        id: 'base',
        source: 'base',
        order: 0,
        hash: hashPromptFragment(base),
      },
    ];
    if (this._agentsContent !== null) {
      fragments.push({
        id: 'agents-md:override',
        source: 'agents-md',
        order: 1,
        hash: hashPromptFragment(this._agentsContent),
      });
    }
    return Object.freeze(fragments.map((fragment) => Object.freeze(fragment)));
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private _normalizeLocale(locale?: PromptLocale | string): PromptLocale {
    if (!locale) return 'en';
    const lower = locale.toLowerCase();
    return lower.startsWith('zh') ? 'zh' : 'en';
  }

  private _getDefaultPrompt(): string {
    if (this._customDefaultPrompt) {
      return this._customDefaultPrompt;
    }
    const key = `default-${this._locale}` as const;
    return BUILTIN_PROMPTS[key];
  }

  private _getPlanPrompt(): string {
    if (this._customPlanPrompt) {
      return this._customPlanPrompt;
    }
    const key = `plan-${this._locale}` as const;
    return BUILTIN_PROMPTS[key];
  }

  private _buildForExecutionMode(mode: PromptExecutionMode): string {
    const base = this._baseForExecutionMode(mode);
    if (this._agentsContent === null) return base;
    return `${base}\n\n# Environment Instructions\n\n${this._agentsContent}`;
  }

  private _baseForExecutionMode(mode: PromptExecutionMode): string {
    if (mode === 'plan') {
      return this._getPlanPrompt();
    }

    return this._getDefaultPrompt();
  }

  private async _tryLoadFile(
    filePath: string,
    source: 'project' | 'personal',
  ): Promise<AgentsLoadResult | null> {
    try {
      const content = await fsp.readFile(filePath, 'utf-8');
      return { content, source, path: filePath };
    } catch {
      return null;
    }
  }
}

function hashPromptFragment(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a system prompt builder
 */
export function createSystemPromptBuilder(config?: SystemPromptBuilderConfig): SystemPromptBuilder {
  return new SystemPromptBuilder(config);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get default personal config path
 */
export function getDefaultPersonalPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, CONFIG_DIR);
}

/**
 * Check if AGENTS.md exists in a directory
 */
export function hasAgentsFile(dirPath: string): boolean {
  const agentsPath = path.join(dirPath, CONFIG_DIR, AGENTS_FILENAME);
  return fs.existsSync(agentsPath);
}
