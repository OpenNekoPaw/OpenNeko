/**
 * Media Library Settings Types
 *
 * Configuration types for external media library support.
 * Stored in neko/settings.json (team-shared, git-tracked) and
 * .neko/settings.local.json (machine-specific overrides, gitignored).
 */

/** Single media library entry */
export interface MediaLibraryEntry {
  /** Human-readable name for display */
  name: string;
  /** Absolute path to the library directory */
  path: string;
  /** Path variable name (used as ${VARIABLE} in asset paths) */
  variable: string;
  /** Whether this library is enabled (default: true) */
  enabled?: boolean;
}

/** Media library settings (neko/settings.json) */
export interface MediaLibrarySettings {
  /** Configured media libraries */
  mediaLibraries?: MediaLibraryEntry[];
}

/** Local settings overrides (.neko/settings.local.json, gitignored) */
export interface MediaLibraryLocalSettings {
  /** Per-machine path overrides: { VARIABLE_NAME: "/local/path" } */
  mediaLibraryOverrides?: Record<string, string>;
}

/** Resolved media library (after applying local overrides) */
export interface ResolvedMediaLibrary {
  /** Display name */
  name: string;
  /** Resolved path (after applying overrides) */
  resolvedPath: string;
  /** Original path from settings.json */
  originalPath: string;
  /** Path variable name */
  variable: string;
  /** Whether this library is enabled */
  enabled: boolean;
  /** Whether this library directory is accessible */
  accessible: boolean;
  /** Whether a local override was applied */
  overridden: boolean;
}
