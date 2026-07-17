/**
 * preferences-loader — read `.neko/preferences.md` at project + global
 * scope and merge project-over-global (ADR §9.3).
 *
 * FS ops injected so the agent package stays Node-free. Missing files
 * are not errors — absence at either layer yields a null layer result
 * and the merge still works (global-only or project-only users are
 * both valid configurations).
 */

import type { MergedPreferences, UserPreferences } from '@neko-agent/types';
import { parsePreferences, mergePreferences } from './preferences-parser';
import type { INekoPaths } from './neko-paths';

// =============================================================================
// FS dependency
// =============================================================================

export interface PreferencesFsOps {
  /**
   * Read a UTF-8 file. Should throw on any error; ENOENT is caught by
   * the loader and treated as "layer absent".
   */
  readFile(path: string, encoding: 'utf-8'): Promise<string>;
}

// =============================================================================
// Loader
// =============================================================================

export interface PreferencesLoaderConfig {
  /** Project-level path resolver (`.neko/preferences.md`). */
  paths: INekoPaths;
  /**
   * Absolute path to the global preferences file. Typically
   * `~/.neko/preferences.md`. When omitted, the global layer is
   * treated as absent.
   */
  globalPath?: string;
  /** FS ops. */
  fsOps: PreferencesFsOps;
}

export interface LoadResult {
  merged: MergedPreferences;
  /** Diagnostics from both layers. Prefixed with source path. */
  warnings: readonly string[];
}

/**
 * Load both layers, merge, return the effective preferences plus
 * per-layer raw results and any parser warnings. Callers that care
 * about the source of a particular rule can inspect
 * `merged.project` vs `merged.global`.
 */
export async function loadPreferences(config: PreferencesLoaderConfig): Promise<LoadResult> {
  const projectPath = _projectPath(config.paths);
  const globalPath = config.globalPath ?? null;

  const [project, projectWarnings] = await _loadLayer(config.fsOps, projectPath, 'project');
  const [global, globalWarnings] = globalPath
    ? await _loadLayer(config.fsOps, globalPath, 'global')
    : [null, []];

  const effective = mergePreferences(project, global);
  return {
    merged: { effective, project, global },
    warnings: [...projectWarnings, ...globalWarnings],
  };
}

// =============================================================================
// Internals
// =============================================================================

function _projectPath(paths: INekoPaths): string {
  // `preferences.md` lives at the root of `.neko/`, not under a subdir.
  return `${paths.root}/preferences.md`;
}

async function _loadLayer(
  fsOps: PreferencesFsOps,
  path: string,
  scope: 'project' | 'global',
): Promise<[UserPreferences | null, string[]]> {
  let raw: string;
  try {
    raw = await fsOps.readFile(path, 'utf-8');
  } catch {
    // Missing file → layer absent. Not an error.
    return [null, []];
  }

  const { preferences, warnings } = parsePreferences(raw, scope, path);
  // Prefix diagnostics with path so consumers can tell layers apart.
  const prefixed = warnings.map((w) => `[${scope}] ${path}: ${w}`);
  return [preferences, prefixed];
}
