/**
 * SubpackageFragmentsModule — projects `PromptFragment` contributions from
 * AgentCapabilityProvider instances into the L3 environment layer.
 *
 * Section layout: one composer section per fragment, id `fragment:${f.id}`.
 * The module is stateless I/O-wise — the session initializer calls
 * setFragments(config.promptFragments) once at construction time and
 * AgentSession may re-invoke it later when the capability-provider set changes.
 *
 * Duplicate ids: dropped (first-writer-wins) to keep composed output
 * deterministic across provider registration order. If this causes real
 * confusion we add a logger warn in a follow-up PR.
 *
 * Activation (PR3e scope): unconditional — every provided fragment gets
 * injected. Conditional activation (by skill / stage / tool) is deferred until
 * a concrete use case justifies the runtime complexity. Locale selection is
 * applied during render so both initializer and live-update paths share the
 * same final model-facing projection.
 */
import type {
  PromptModule,
  PromptModuleManifest,
  PromptModuleSection,
} from '../../registry/module-manifest';
import { localizePromptFragment, type PromptFragment } from '@neko/shared';
import type { PromptContext } from '../../context';

const DEFAULT_FRAGMENT_PRIORITY = 70;

export class SubpackageFragmentsModule implements PromptModule {
  readonly manifest: PromptModuleManifest = {
    id: 'subpackage.fragments',
    layers: ['environment'],
    requires: [],
    priority: DEFAULT_FRAGMENT_PRIORITY,
    cost: 'free',
    dependsOn: ['agents-md'],
  };

  private _fragments: readonly PromptFragment[] = [];

  /**
   * Replace the full fragment list. Typically called by the initializer
   * with `config.promptFragments` or by a later re-sync pass.
   */
  setFragments(fragments: readonly PromptFragment[] | undefined): void {
    this._fragments = fragments ?? [];
  }

  /**
   * Current fragment list snapshot (for tests / introspection).
   */
  getFragments(): readonly PromptFragment[] {
    return this._fragments;
  }

  async render(ctx?: PromptContext): Promise<readonly PromptModuleSection[] | null> {
    return this.renderSync(ctx);
  }

  /**
   * Sync variant — used by the initializer during session bring-up so the
   * composer is populated before the first composeStructured call.
   */
  renderSync(ctx?: PromptContext): readonly PromptModuleSection[] | null {
    if (this._fragments.length === 0) return null;

    const seen = new Set<string>();
    const sections: PromptModuleSection[] = [];
    for (const rawFragment of this._fragments) {
      const fragment = localizePromptFragment(rawFragment, ctx?.locale);
      if (seen.has(fragment.id)) continue; // first-writer-wins
      seen.add(fragment.id);
      sections.push({
        sectionId: `fragment:${fragment.id}`,
        layer: 'environment',
        content: fragment.content,
        priority: fragment.priority ?? DEFAULT_FRAGMENT_PRIORITY,
      });
    }
    return sections.length > 0 ? sections : null;
  }
}
