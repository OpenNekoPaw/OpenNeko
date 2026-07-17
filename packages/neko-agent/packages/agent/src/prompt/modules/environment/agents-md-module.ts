/**
 * AgentsMdModule — projects user-authored AGENTS.md content into the
 * environment layer at priority 80 (above project/global memory).
 *
 * Wiring: the session initializer reads `config.agentsOverride` (populated
 * by agentRunner from `SystemPromptBuilder.buildAgentsOverlay()`) and, if
 * non-empty, calls `setContent(...)` + `renderSync()` + composer.setSection.
 * Prior to PR3b AGENTS.md was passed through `SystemPromptBuilder.build()`
 * and replaced the base entirely; this module restores the base protocol by
 * layering the user's overrides on top instead.
 *
 * No heading wrapper: AGENTS.md is already a complete user document (often
 * with its own top-level headings), so the module emits the content verbatim.
 */
import type {
  PromptModule,
  PromptModuleManifest,
  PromptModuleSection,
} from '../../registry/module-manifest';

export class AgentsMdModule implements PromptModule {
  readonly manifest: PromptModuleManifest = {
    id: 'agents-md',
    layers: ['environment'],
    requires: [],
    priority: 80,
    cost: 'free',
  };

  private _content: string | null = null;

  setContent(content: string | null): void {
    const trimmed = content?.trim();
    this._content = trimmed ? trimmed : null;
  }

  getContent(): string | null {
    return this._content;
  }

  async render(): Promise<readonly PromptModuleSection[] | null> {
    return this.renderSync();
  }

  /**
   * Sync variant matching the pattern used by other PR2 projection modules,
   * so the initializer can write the section without a microtask boundary.
   */
  renderSync(): readonly PromptModuleSection[] | null {
    if (!this._content) return null;
    return [
      {
        sectionId: 'agents-md:override',
        layer: 'environment',
        content: this._content,
        priority: 80,
      },
    ];
  }
}
