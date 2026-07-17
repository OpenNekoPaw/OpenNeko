/**
 * MemoryRecallModule — projects per-turn memory recall results into the
 * ephemeral layer.
 *
 * Unlike the project memory module which is event-driven, recall is triggered
 * per turn by the AgentSession runtime. The caller performs the
 * relevance-scored lookup and passes the already-formatted content string to
 * `setContent(...)`.
 *
 * The module does no recall I/O itself — it is a pure projection. This keeps
 * the expensive memory-search pipeline in one place (the runtime caller) and
 * avoids duplicating it inside render.
 */
import type {
  PromptModule,
  PromptModuleManifest,
  PromptModuleSection,
} from '../../registry/module-manifest';
import type { PromptContext } from '../../context';
import { localizeMemoryContentForPrompt } from './memory-locale-projection';

export class MemoryRecallModule implements PromptModule {
  readonly manifest: PromptModuleManifest = {
    id: 'memory.recall',
    layers: ['ephemeral'],
    requires: [],
    priority: 40,
    cost: 'cheap',
    dependsOn: ['validation.guidance'],
  };

  private _content: string | null = null;

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

  /** Sync variant — see MemoryProjectModule.renderSync. */
  renderSync(ctx?: PromptContext): readonly PromptModuleSection[] | null {
    if (!this._content) return null;
    const locale = ctx?.locale ?? 'en';
    const heading = locale === 'zh' ? '## 回忆记忆' : '## Recalled Memories';
    const content = localizeMemoryContentForPrompt(this._content, locale);
    return [
      {
        sectionId: 'memory:recall',
        layer: 'ephemeral',
        content: `${heading}\n\n${content}`,
        priority: 40,
      },
    ];
  }
}
