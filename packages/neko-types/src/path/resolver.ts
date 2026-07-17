/**
 * Path Resolver — L0 utility for path variable expansion, contraction, and validation.
 *
 * Handles three path formats used in neko project files:
 *   - Relative paths:  "footage/clip.mp4"  (resolved against projectDir)
 *   - Variable paths:  "${TEAM_FOOTAGE}/scene01/clip.mp4"  (expanded via variables map)
 *   - Remote URLs:     "https://cdn.example.com/asset.hdr"
 *
 * Zero dependencies — usable in Extension Host, CLI, and Engine contexts.
 */

// Match ${VAR}/rest — allows optional leading / (macOS fsPath adds it)
const VARIABLE_PATTERN = /^\/?\$\{([^}]+)\}(.*)$/;

/** Variable name → absolute directory path */
export type PathVariableMap = Map<string, string>;

/** Result of resolving a source path */
export type ResolvedPath = { type: 'local'; path: string } | { type: 'remote'; url: string };

/** A variable referenced in a source but not defined in the variable map */
export interface MissingVariable {
  /** The variable name (e.g. "TEAM_FOOTAGE") */
  variable: string;
  /** Source paths that reference this variable */
  references: string[];
}

export class PathResolver {
  private variables: PathVariableMap = new Map();

  constructor(variables?: PathVariableMap) {
    if (variables) this.variables = new Map(variables);
  }

  /**
   * Update the variable map (called when settings change).
   */
  setVariables(variables: PathVariableMap): void {
    this.variables = new Map(variables);
  }

  /**
   * Expand path variables to absolute paths.
   *
   * "${VAR}/rest/of/path" → "/resolved/path/rest/of/path"
   * If no variable match, returns path as-is.
   */
  resolve(storedPath: string): string {
    const match = storedPath.match(VARIABLE_PATTERN);
    if (!match) return storedPath;

    const varName = match[1]!;
    const rest = match[2] ?? '';
    const basePath = this.variables.get(varName);

    if (!basePath) {
      // Variable not defined — return as-is (will be detected as offline)
      return storedPath;
    }

    const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    const normalizedRest = rest.startsWith('/') ? rest : rest ? `/${rest}` : '';

    return `${normalizedBase}${normalizedRest}`;
  }

  /**
   * Contract absolute path to use path variable if possible.
   *
   * "/Volumes/NAS/footage/scene01/clip.mp4" → "${TEAM_FOOTAGE}/scene01/clip.mp4"
   * Picks the longest-matching variable path (most specific).
   * Returns original path if no variable matches.
   */
  contract(absolutePath: string): string {
    let bestMatch: { variable: string; basePath: string } | null = null;

    for (const [variable, basePath] of this.variables) {
      const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;

      if (absolutePath.startsWith(normalizedBase) || absolutePath === basePath) {
        if (!bestMatch || basePath.length > bestMatch.basePath.length) {
          bestMatch = { variable, basePath };
        }
      }
    }

    if (!bestMatch) return absolutePath;

    if (absolutePath === bestMatch.basePath) {
      return `\${${bestMatch.variable}}`;
    }

    const rest = absolutePath.slice(bestMatch.basePath.length);
    const normalizedRest = rest.startsWith('/') ? rest.slice(1) : rest;
    return `\${${bestMatch.variable}}/${normalizedRest}`;
  }

  /**
   * Check if a path contains a variable reference.
   */
  hasVariable(path: string): boolean {
    return VARIABLE_PATTERN.test(path);
  }

  /**
   * Get all configured variables.
   */
  getVariables(): PathVariableMap {
    return new Map(this.variables);
  }

  // =========================================================================
  // Unified source resolution
  // =========================================================================

  /**
   * Resolve a source path from a project file to a concrete path or URL.
   *
   * Resolution order:
   *   1. HTTP/HTTPS URL → ResolvedPath.remote
   *   2. ${VAR}/rest → expand variable → ResolvedPath.local
   *   3. Absolute path → ResolvedPath.local (as-is)
   *   4. Relative path → projectDir + src → ResolvedPath.local
   */
  resolveSource(src: string, projectDir: string): ResolvedPath {
    // Remote URL
    if (src.startsWith('http://') || src.startsWith('https://')) {
      return { type: 'remote', url: src };
    }

    // Variable path
    if (this.hasVariable(src)) {
      const resolved = this.resolve(src);
      // If variable was not found, resolved === src (still has ${})
      return { type: 'local', path: resolved };
    }

    // Absolute path
    if (src.startsWith('/') || /^[A-Za-z]:[\\/]/.test(src)) {
      return { type: 'local', path: src };
    }

    // Relative path
    const joined = projectDir.endsWith('/') ? `${projectDir}${src}` : `${projectDir}/${src}`;
    return { type: 'local', path: joined };
  }

  /**
   * Scan a list of source paths and return any that reference undefined variables.
   * Use this before passing sources to the engine to fail early.
   */
  validateSources(sources: string[]): MissingVariable[] {
    const missing = new Map<string, string[]>();

    for (const src of sources) {
      const match = src.match(VARIABLE_PATTERN);
      if (!match) continue;

      const varName = match[1]!;
      if (!this.variables.has(varName)) {
        const refs = missing.get(varName) ?? [];
        refs.push(src);
        missing.set(varName, refs);
      }
    }

    const result: MissingVariable[] = [];
    for (const [variable, references] of missing) {
      result.push({ variable, references });
    }
    return result;
  }
}
