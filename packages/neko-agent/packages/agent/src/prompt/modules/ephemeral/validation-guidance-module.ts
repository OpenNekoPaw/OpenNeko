import type {
  PromptModule,
  PromptModuleManifest,
  PromptModuleSection,
} from '../../registry/module-manifest';
import type { PromptContext } from '../../context';

/**
 * ValidationGuidanceModule — projects validation/recovery guidance emitted by
 * skill-owned validation policy into the next turn's ephemeral prompt layer.
 *
 * The content is intentionally short-lived: AgentSession keeps it around for
 * one turn after a validation cycle, then clears it unless a newer cycle
 * replaces it. That gives us a concrete intent -> generate -> evaluate ->
 * decide -> next-turn-control loop without permanently polluting memory.
 */
export class ValidationGuidanceModule implements PromptModule {
  readonly manifest: PromptModuleManifest = {
    id: 'validation.guidance',
    layers: ['ephemeral'],
    requires: [],
    priority: 45,
    cost: 'free',
    dependsOn: [],
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

  renderSync(ctx?: PromptContext): readonly PromptModuleSection[] | null {
    if (!this._content) {
      return null;
    }

    const heading = ctx?.locale === 'zh' ? '## 验证指导' : '## Validation Guidance';
    return [
      {
        sectionId: 'validation-guidance',
        layer: 'ephemeral',
        content: `${heading}\n\n${this._content}`,
        priority: 45,
      },
    ];
  }
}
