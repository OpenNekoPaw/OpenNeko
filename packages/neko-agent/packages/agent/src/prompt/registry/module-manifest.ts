/**
 * Prompt Module contract — manifest + section + module interface.
 *
 * A PromptModule produces 0..N sections for one or more layers of the system prompt.
 * Modules register with a PromptModuleRegistry; at render time ModuleOrchestrator
 * queries each module's manifest to decide whether to invoke render(), whether a
 * cached result can be reused, and how to place the resulting sections.
 *
 * The module layer is additive: existing `composer.setSection(...)` callers continue
 * to work; modules exist to centralize what would otherwise be scattered writes.
 */
import type { PromptLayer } from '../system-prompt-composer-types';
import type { PromptContext } from '../context';

/**
 * Declarative metadata describing a module's layering, context dependencies,
 * priority, and cache behaviour.
 *
 * - `layers`: the layers this module may write to; render() must only emit
 *   sections whose `layer` appears here.
 * - `requires`: keys of PromptContext that must be non-null for render to run.
 *   If any required key is null/undefined, the orchestrator skips the module
 *   and removes any previously-owned sections.
 * - `priority`: used as the default `priority` for emitted sections.
 * - `cost`: hint for future parallel/serial scheduling; currently informational.
 * - `dependsOn`: optional module ids that must be applied before this module
 *   when callers use ModuleOrchestrator.applyAll/applyAllSync(). Missing or
 *   circular dependencies are treated as configuration errors.
 * - `cacheKey`: if provided, return a stable key per ctx; orchestrator reuses
 *   the last render output if the key matches. Return null to opt out per call.
 */
export interface PromptModuleManifest {
  readonly id: string;
  readonly layers: readonly PromptLayer[];
  readonly requires: readonly (keyof PromptContext)[];
  readonly priority: number;
  readonly cost: 'free' | 'cheap' | 'expensive';
  readonly dependsOn?: readonly string[];
  readonly cacheKey?: (ctx: PromptContext) => string | null;
}

/**
 * A single section produced by a module. The orchestrator translates these into
 * `composer.setSection(...)` calls, setting the section id to `sectionId` as-is.
 *
 * The recommended convention is `{moduleId}:{localId}` (e.g. `skill:commit-helper`)
 * to avoid cross-module id collisions, but this is advisory — the orchestrator
 * simply tracks which ids a module owned last render and clears them on re-render.
 */
export interface PromptModuleSection {
  readonly sectionId: string;
  readonly layer: PromptLayer;
  readonly content: string;
  readonly priority?: number;
  readonly cacheControl?: 'ephemeral';
}

/**
 * A prompt module. `manifest` is declarative; `render` is invoked by the orchestrator
 * whenever the manifest's requirements are met and no cached result is reusable.
 *
 * Return null (or an empty array) to signal "no output this round". The orchestrator
 * will still clean up any previously-owned sections.
 */
export interface PromptModule {
  readonly manifest: PromptModuleManifest;
  render(ctx: PromptContext): Promise<readonly PromptModuleSection[] | null>;
  /**
   * Optional sync render path for prompt updates that must complete before the
   * next immediate composer read (for example ask-mode snapshots).
   */
  renderSync?(ctx: PromptContext): readonly PromptModuleSection[] | null;
}
