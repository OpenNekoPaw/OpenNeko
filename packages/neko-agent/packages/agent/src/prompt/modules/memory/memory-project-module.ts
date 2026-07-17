/**
 * MemoryProjectModule — projects project-level memory content into the
 * environment layer as a single section.
 *
 * Wiring: the initializer subscribes to ProjectMemoryManager.on('change')
 * and calls `setContent(...)` with the latest project memory, then triggers
 * `orchestrator.applyOne(...)`. The module itself is a pure projection —
 * it does no I/O and is event-driven.
 *
 * Section contract: id `memory:project`, layer `environment`, priority 60,
 * heading `## Project Memory`.
 */
import type {
  PromptModule,
  PromptModuleManifest,
  PromptModuleSection,
} from '../../registry/module-manifest';
import type { PromptContext } from '../../context';
import { localizeMemoryContentForPrompt } from './memory-locale-projection';

export class MemoryProjectModule implements PromptModule {
  readonly manifest: PromptModuleManifest = {
    id: 'memory.project',
    layers: ['environment'],
    requires: [],
    priority: 60,
    cost: 'free',
    dependsOn: ['subpackage.fragments'],
  };

  private _content: string | null = null;

  /**
   * Update the project memory content. Pass null (or whitespace-only) to
   * clear the section on next render.
   */
  setContent(content: string | null): void {
    const trimmed = content?.trim();
    this._content = trimmed ? trimmed : null;
  }

  getContent(): string | null {
    return this._content;
  }

  async render(ctx?: PromptContext): Promise<readonly PromptModuleSection[] | null> {
    return this.renderSync(ctx);
  }

  /**
   * Sync variant for sync-only callers (event handlers that must finish before
   * the next composer read). Identical output to render().
   */
  renderSync(ctx?: PromptContext): readonly PromptModuleSection[] | null {
    if (!this._content) return null;
    const locale = ctx?.locale ?? 'en';
    const heading = locale === 'zh' ? '## 项目记忆' : '## Project Memory';
    const content = localizeMemoryContentForPrompt(this._content, locale);
    return [
      {
        sectionId: 'memory:project',
        layer: 'environment',
        content: `${heading}\n\n${content}`,
        priority: 60,
      },
    ];
  }
}
