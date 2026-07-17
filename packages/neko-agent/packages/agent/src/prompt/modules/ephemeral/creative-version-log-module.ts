/**
 * CreativeVersionLogModule — projects the per-session version log summary
 * (generation, evaluation and action events accumulated during a turn) into
 * the ephemeral layer.
 *
 * Wiring: AgentSession._syncSystemPrompt calls `setSummary(versionLog.size > 0
 * ? versionLog.toSummary() : null)` before invoking the orchestrator. The
 * section regenerates every turn (which is why ephemeral, not environment).
 *
 * Unlike memory/recall content, the summary is pre-formatted by VersionLog
 * itself, so the module stores and emits it verbatim — no heading prefix.
 */
import type {
  PromptModule,
  PromptModuleManifest,
  PromptModuleSection,
} from '../../registry/module-manifest';

export class CreativeVersionLogModule implements PromptModule {
  readonly manifest: PromptModuleManifest = {
    id: 'creative.version-log',
    layers: ['ephemeral'],
    requires: [],
    priority: 30,
    cost: 'free',
    dependsOn: ['memory.recall'],
  };

  private _summary: string | null = null;

  setSummary(summary: string | null): void {
    const trimmed = summary?.trim();
    this._summary = trimmed ? trimmed : null;
  }

  getSummary(): string | null {
    return this._summary;
  }

  async render(): Promise<readonly PromptModuleSection[] | null> {
    return this.renderSync();
  }

  /**
   * Sync variant. Used by AgentSession._syncSystemPrompt which must complete
   * before the following composeStructured() call.
   */
  renderSync(): readonly PromptModuleSection[] | null {
    if (!this._summary) return null;
    return [
      {
        sectionId: 'creative-version-log',
        layer: 'ephemeral',
        content: this._summary,
        priority: 30,
      },
    ];
  }
}
