/**
 * Prompt Fragment — a sub-package-contributed chunk of prompt text injected
 * into the agent's composed system prompt at the L3 environment layer.
 *
 * Purpose (PR3e): sub-packages like neko-cut / neko-canvas can teach the
 * agent domain-specific usage conventions for their tools (e.g. "timestamps
 * are in milliseconds") without polluting tool `description` fields or
 * baking the guidance into Skills (which would couple the advice to a
 * persona).
 *
 * Scope: fragments are injected only when every declared Tool name is
 * available in the exact final Turn Tool snapshot.
 *
 * Locale variants: providers own translated model-facing text. Runtime
 * surfaces select matching content before injecting the fragment.
 *
 * Id convention: fragment ids must be globally unique across all providers.
 * By convention use `{package-name}:{local-id}` so collisions are obvious
 * (e.g. `neko-cut:timeline-basics`, `neko-canvas:shot-composition`). The
 * capability registry rejects duplicate ids at the owning registration boundary.
 */
export interface PromptFragment {
  /**
   * Globally-unique fragment id. Convention: `{package}:{local-id}`.
   * Used with provider provenance in the final capability-guidance heading.
   */
  readonly id: string;

  /**
   * Prompt text content. Markdown preferred; the Turn composer adds the
   * provider-qualified capability-guidance heading.
   */
  readonly content: string;

  /**
   * Optional localized prompt content keyed by locale id, for example `zh`,
   * `zh-cn`, `zh-hans`, `en`, or `en-us`.
   */
  readonly locales?: Readonly<Record<string, PromptFragmentLocalizedContent>>;

  /**
   * Optional per-fragment priority. Defaults to 70; higher values appear
   * earlier among capability-guidance sections.
   */
  readonly priority?: number;

  /** Canonical Tool names whose exact Turn availability makes this guidance applicable. */
  readonly toolNames: readonly string[];
}

export interface OwnedPromptFragment extends PromptFragment {
  /** Exact capability provider that contributed this fragment. */
  readonly providerId: string;
}

export interface PromptFragmentLocalizedContent {
  readonly content?: string;
}

export function localizePromptFragment(fragment: PromptFragment, locale?: string): PromptFragment {
  const localized = selectPromptFragmentLocale(fragment.locales, locale);
  if (!localized?.content || localized.content === fragment.content) {
    return fragment;
  }

  return {
    ...fragment,
    content: localized.content,
  };
}

function selectPromptFragmentLocale(
  locales: PromptFragment['locales'],
  locale?: string,
): PromptFragmentLocalizedContent | undefined {
  if (!locales) return undefined;

  const normalized = locale?.trim().toLowerCase().replace(/_/g, '-');
  const candidates = normalized?.startsWith('zh')
    ? [normalized, 'zh', 'zh-cn', 'zh-hans', 'zh-tw', 'zh-hant']
    : [normalized, 'en', 'en-us'];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const localized = locales[candidate];
    if (localized) return localized;
  }
  return undefined;
}
