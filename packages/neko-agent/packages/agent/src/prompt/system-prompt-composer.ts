/**
 * System Prompt Composer — Runtime section-based prompt composition with token budgets
 *
 * Responsibility: Manage the system prompt as composable, layered sections that can be
 * independently added, replaced, or removed at runtime. Each layer has a token budget.
 *
 * Lifecycle:
 *   SystemPromptBuilder.build() → base prompt → Composer.setBase() → runtime sections
 *
 * Layer order: base → skill → environment → ephemeral
 * Within each layer, sections are sorted by priority (descending).
 *
 * NOT to be confused with SystemPromptBuilder, which handles one-time initialization
 * from AGENTS.md and locale/mode switching.
 */

import { createHash } from 'node:crypto';

import type {
  PromptLayer,
  PromptSection,
  PromptSectionInput,
  PromptLayerBudget,
  LayerUsage,
  ISystemPromptComposer,
  SystemPromptComposerOptions,
  ComposedPromptResult,
  ComposedPromptSection,
  PromptDumpInfo,
  PromptCompositionFragmentProjection,
} from './system-prompt-composer-types';

import { PROMPT_LAYER_ORDER, DEFAULT_PROMPT_LAYER_BUDGET } from './system-prompt-composer-types';

// =============================================================================
// Constants
// =============================================================================

/** Default section separator (matches existing applySkillInjection convention) */
const DEFAULT_SEPARATOR = '\n\n---\n\n';

/** Default section priority */
const DEFAULT_PRIORITY = 50;

/** Base section ID */
const BASE_SECTION_ID = 'base';

/** Approximate chars per token for estimation */
const CHARS_PER_TOKEN = 4;

const PROMPT_COMPOSITION_METADATA_PATTERN = /^[a-z0-9][a-z0-9._:/@-]{0,255}$/iu;

interface ComposedSectionFragment {
  readonly section: PromptSection;
  readonly content: string;
}

// =============================================================================
// Implementation
// =============================================================================

export class SystemPromptComposer implements ISystemPromptComposer {
  private _sections = new Map<string, PromptSection>();
  private _budget: PromptLayerBudget;
  private _separator: string;

  constructor(options?: SystemPromptComposerOptions) {
    this._budget = {
      ...DEFAULT_PROMPT_LAYER_BUDGET,
      ...options?.budget,
    };
    this._separator = options?.separator ?? DEFAULT_SEPARATOR;
  }

  // ---------------------------------------------------------------------------
  // Base Prompt
  // ---------------------------------------------------------------------------

  setBase(content: string): void {
    this.setSection({
      id: BASE_SECTION_ID,
      layer: 'base',
      content,
      source: 'base',
      priority: 100,
    });
  }

  // ---------------------------------------------------------------------------
  // Section Management
  // ---------------------------------------------------------------------------

  setSection(input: PromptSectionInput): void {
    const source = input.source ?? input.layer;
    assertSafeCompositionMetadata(source, 'source');
    if (input.version !== undefined) {
      assertSafeCompositionMetadata(input.version, 'version');
    }
    const section: PromptSection = {
      id: input.id,
      layer: input.layer,
      content: input.content,
      source,
      ...(input.version !== undefined ? { version: input.version } : {}),
      priority: input.priority ?? DEFAULT_PRIORITY,
      tokenEstimate: estimateTokens(input.content),
      addedAt: Date.now(),
      ...(input.cacheControl && { cacheControl: input.cacheControl }),
    };
    this._sections.set(input.id, section);
  }

  removeSection(id: string): boolean {
    return this._sections.delete(id);
  }

  removeSectionsByPrefix(prefix: string): number {
    if (prefix.length === 0) return 0;
    let count = 0;
    for (const id of Array.from(this._sections.keys())) {
      if (id.startsWith(prefix)) {
        this._sections.delete(id);
        count += 1;
      }
    }
    return count;
  }

  hasSection(id: string): boolean {
    return this._sections.has(id);
  }

  getSection(id: string): PromptSection | undefined {
    return this._sections.get(id);
  }

  // ---------------------------------------------------------------------------
  // Composition
  // ---------------------------------------------------------------------------

  compose(): string {
    const parts: string[] = [];

    for (const layer of PROMPT_LAYER_ORDER) {
      const layerContent = this._composeLayer(layer);
      if (layerContent) {
        parts.push(layerContent);
      }
    }

    return parts.join(this._separator);
  }

  /**
   * Compose structured output with cache boundary information.
   *
   * Groups layers into cacheable sections:
   * - base layer → marked with cacheControl: 'ephemeral' (= cacheable in Anthropic API)
   * - schema + skill + environment layers → merged, marked with cacheControl: 'ephemeral'
   *   (session-stable: schema keyed to active run, skill keyed to active persona,
   *   environment keyed to loaded memory / AGENTS.md)
   * - ephemeral layer → no cache marker (changes every turn)
   */
  composeStructured(): ComposedPromptResult {
    const sections: ComposedPromptSection[] = [];
    const textParts: string[] = [];

    // Group 1: base layer (stable, cacheable)
    const baseContent = this._composeLayer('base');
    if (baseContent) {
      sections.push({ content: baseContent, cacheControl: 'ephemeral' });
      textParts.push(baseContent);
    }

    // Group 2: schema + skill + environment layers (session-stable, cacheable)
    const schemaContent = this._composeLayer('schema');
    const skillContent = this._composeLayer('skill');
    const envContent = this._composeLayer('environment');
    const midParts = [schemaContent, skillContent, envContent].filter(Boolean);
    if (midParts.length > 0) {
      const midContent = midParts.join(this._separator);
      sections.push({ content: midContent, cacheControl: 'ephemeral' });
      textParts.push(midContent);
    }

    // Group 3: ephemeral layer (changes every turn, not cached)
    const ephContent = this._composeLayer('ephemeral');
    if (ephContent) {
      sections.push({ content: ephContent });
      textParts.push(ephContent);
    }

    return {
      text: textParts.join(this._separator),
      sections,
    };
  }

  // ---------------------------------------------------------------------------
  // Token Management
  // ---------------------------------------------------------------------------

  getTotalTokens(): number {
    let total = 0;
    for (const section of this._sections.values()) {
      total += section.tokenEstimate;
    }
    // Account for separators between non-empty layers
    const nonEmptyLayers = PROMPT_LAYER_ORDER.filter(
      (layer) => this._getLayerSections(layer).length > 0,
    );
    if (nonEmptyLayers.length > 1) {
      total += estimateTokens(this._separator) * (nonEmptyLayers.length - 1);
    }
    return total;
  }

  getLayerUsage(): Record<PromptLayer, LayerUsage> {
    const usage = {} as Record<PromptLayer, LayerUsage>;
    for (const layer of PROMPT_LAYER_ORDER) {
      const sections = this._getLayerSections(layer);
      let used = 0;
      for (const s of sections) {
        used += s.tokenEstimate;
      }
      usage[layer] = {
        used,
        budget: this._budget[layer],
      };
    }
    return usage;
  }

  // ---------------------------------------------------------------------------
  // Observability
  // ---------------------------------------------------------------------------

  dumpSections(): PromptDumpInfo[] {
    const infos: PromptDumpInfo[] = [];
    for (const section of this._sections.values()) {
      infos.push({
        id: section.id,
        layer: section.layer,
        tokenEstimate: section.tokenEstimate,
        priority: section.priority,
        ...(section.cacheControl && { cacheControl: section.cacheControl }),
      });
    }
    return infos;
  }

  projectComposition(): readonly PromptCompositionFragmentProjection[] {
    const projection: PromptCompositionFragmentProjection[] = [];
    for (const layer of PROMPT_LAYER_ORDER) {
      for (const fragment of this._composeLayerSections(layer)) {
        projection.push({
          id: fragment.section.id,
          source: fragment.section.source,
          order: projection.length,
          ...(fragment.section.version !== undefined ? { version: fragment.section.version } : {}),
          hash: sha256(fragment.content),
        });
      }
    }
    return projection;
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  reset(): void {
    const base = this._sections.get(BASE_SECTION_ID);
    this._sections.clear();
    if (base) {
      this._sections.set(BASE_SECTION_ID, base);
    }
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /** Get sections for a layer, sorted by priority descending */
  private _getLayerSections(layer: PromptLayer): PromptSection[] {
    const sections: PromptSection[] = [];
    for (const section of this._sections.values()) {
      if (section.layer === layer) {
        sections.push(section);
      }
    }
    // Sort by priority descending, then by addedAt ascending (stable order)
    sections.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.addedAt - b.addedAt;
    });
    return sections;
  }

  /** Compose a single layer's content, respecting token budget */
  private _composeLayer(layer: PromptLayer): string {
    return this._composeLayerSections(layer)
      .map((fragment) => fragment.content)
      .join(this._separator);
  }

  /** Select the exact section content that participates after budget enforcement. */
  private _composeLayerSections(layer: PromptLayer): ComposedSectionFragment[] {
    const sections = this._getLayerSections(layer);
    if (sections.length === 0) return [];

    const budget = this._budget[layer];
    let usedTokens = 0;
    const fragments: ComposedSectionFragment[] = [];

    for (const section of sections) {
      if (usedTokens + section.tokenEstimate > budget) {
        // Truncate: include as much as fits
        const remainingTokens = budget - usedTokens;
        if (remainingTokens > 0) {
          const maxChars = remainingTokens * CHARS_PER_TOKEN;
          fragments.push({
            section,
            content: section.content.slice(0, maxChars) + '\n[truncated]',
          });
        }
        break;
      }
      fragments.push({ section, content: section.content });
      usedTokens += section.tokenEstimate;
    }

    return fragments;
  }
}

// =============================================================================
// Utility
// =============================================================================

/** Estimate token count from string length (1 token ≈ 4 chars) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function sha256(text: string): string {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function assertSafeCompositionMetadata(value: string, field: 'source' | 'version'): void {
  if (!PROMPT_COMPOSITION_METADATA_PATTERN.test(value)) {
    throw new Error(`Prompt composition ${field} must be a stable non-secret identifier.`);
  }
}

// =============================================================================
// Factory
// =============================================================================

/** Create a SystemPromptComposer instance */
export function createSystemPromptComposer(
  options?: SystemPromptComposerOptions,
): SystemPromptComposer {
  return new SystemPromptComposer(options);
}
