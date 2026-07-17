import type {
  MediaLibraryEntry,
  MediaLibraryLocalSettings,
  MediaLibrarySettings,
  PathVariableMap,
  ResolvedMediaLibrary,
} from '@neko/shared';
import type { NekoHostPorts } from './ports';

export const WORKSPACE_CONTENT_SETTINGS_SEGMENTS = ['neko', 'settings.json'] as const;
export const WORKSPACE_CONTENT_LOCAL_SETTINGS_SEGMENTS = ['.neko', 'settings.local.json'] as const;

export interface HostWorkspacePathVariableInput {
  readonly workspaceRoot: string;
  readonly homedir?: string;
  readonly nekoHome?: string;
  readonly extraPathVariables?: PathVariableMap | ReadonlyMap<string, string>;
}

export interface ResolveWorkspaceMediaLibrariesOptions {
  readonly settings: unknown;
  readonly localSettings?: unknown;
  readonly workspaceRoot: string;
  readonly resolvePath: (source: string, workspaceRoot: string) => string;
  readonly checkAccessible?: (absolutePath: string) => boolean | Promise<boolean>;
}

export interface ResolveWorkspaceMediaLibrariesSyncOptions {
  readonly settings: unknown;
  readonly localSettings?: unknown;
  readonly workspaceRoot: string;
  readonly resolvePath: (source: string, workspaceRoot: string) => string;
  readonly checkAccessible?: (absolutePath: string) => boolean;
}

export interface HostWorkspaceContentSnapshot {
  readonly workspaceRoot?: string;
  readonly settings: MediaLibrarySettings;
  readonly localSettings: MediaLibraryLocalSettings;
  readonly mediaLibraries: readonly ResolvedMediaLibrary[];
  readonly mediaLibraryPathVariables: PathVariableMap;
  readonly pathVariables: PathVariableMap;
}

export interface HostContentPolicySnapshot {
  readonly workspaceRoot?: string;
  readonly pathVariables: PathVariableMap;
  readonly mediaLibraries: readonly ResolvedMediaLibrary[];
  readonly mediaLibraryRoots: readonly string[];
  readonly authorizedReadRoots: readonly string[];
}

export function createHostWorkspacePathVariables(
  input: HostWorkspacePathVariableInput,
): PathVariableMap {
  const variables: PathVariableMap = new Map();
  variables.set('A', input.workspaceRoot);
  variables.set('WORKSPACE', input.workspaceRoot);
  variables.set('PROJECT', input.workspaceRoot);
  if (input.nekoHome) {
    variables.set('NEKO_HOME', input.nekoHome);
  }
  if (input.homedir) {
    variables.set('HOME', input.homedir);
  }
  for (const [key, value] of input.extraPathVariables ?? []) {
    variables.set(key, value);
  }
  return variables;
}

export async function loadHostContentPolicySnapshot(input: {
  readonly host: NekoHostPorts;
}): Promise<HostContentPolicySnapshot> {
  const provided = await input.host.contentPolicy?.getSnapshot();
  if (provided) {
    return cloneHostContentPolicySnapshot(provided);
  }
  return createHostContentPolicySnapshot(await loadHostWorkspaceContentSnapshot(input));
}

export function createHostContentPolicySnapshot(
  snapshot: HostWorkspaceContentSnapshot,
): HostContentPolicySnapshot {
  const mediaLibraryRoots = snapshot.mediaLibraries
    .filter((library) => library.enabled && library.accessible)
    .map((library) => library.resolvedPath);
  return {
    ...(snapshot.workspaceRoot ? { workspaceRoot: snapshot.workspaceRoot } : {}),
    pathVariables: new Map(snapshot.pathVariables),
    mediaLibraries: snapshot.mediaLibraries.map((library) => ({ ...library })),
    mediaLibraryRoots: dedupeStrings(mediaLibraryRoots),
    authorizedReadRoots: dedupeStrings([
      ...(snapshot.workspaceRoot ? [snapshot.workspaceRoot] : []),
      ...mediaLibraryRoots,
    ]),
  };
}

export function cloneHostContentPolicySnapshot(
  snapshot: HostContentPolicySnapshot,
): HostContentPolicySnapshot {
  return {
    ...(snapshot.workspaceRoot ? { workspaceRoot: snapshot.workspaceRoot } : {}),
    pathVariables: new Map(snapshot.pathVariables),
    mediaLibraries: snapshot.mediaLibraries.map((library) => ({ ...library })),
    mediaLibraryRoots: [...snapshot.mediaLibraryRoots],
    authorizedReadRoots: [...snapshot.authorizedReadRoots],
  };
}

export async function loadHostWorkspaceContentSnapshot(input: {
  readonly host: NekoHostPorts;
}): Promise<HostWorkspaceContentSnapshot> {
  const workspace = await input.host.workspace.getWorkspace();
  const workspaceRoot = workspace.workspaceRoot;
  const basePathVariables = new Map(workspace.pathVariables ?? []);
  if (!workspaceRoot) {
    return {
      settings: {},
      localSettings: {},
      mediaLibraries: [],
      mediaLibraryPathVariables: new Map(),
      pathVariables: basePathVariables,
    };
  }

  const settingsPath = input.host.paths.join(workspaceRoot, ...WORKSPACE_CONTENT_SETTINGS_SEGMENTS);
  const localSettingsPath = input.host.paths.join(
    workspaceRoot,
    ...WORKSPACE_CONTENT_LOCAL_SETTINGS_SEGMENTS,
  );
  const settings = readMediaLibrarySettings(
    await readOptionalJson(input.host, settingsPath),
    settingsPath,
  );
  const localSettings = readMediaLibraryLocalSettings(
    await readOptionalJson(input.host, localSettingsPath),
    localSettingsPath,
  );
  const mediaLibraries = await resolveWorkspaceMediaLibraries({
    settings,
    localSettings,
    workspaceRoot,
    resolvePath: (source) => {
      const resolved = input.host.paths.resolvePath({
        path: source,
        baseDir: workspaceRoot,
        variables: basePathVariables,
      });
      if (resolved.type !== 'local') {
        return source;
      }
      return resolved.path;
    },
    checkAccessible: async (absolutePath) => {
      try {
        const stat = await input.host.files.stat(absolutePath);
        return stat.type === 'directory';
      } catch {
        return false;
      }
    },
  });
  const mediaLibraryPathVariables = createMediaLibraryPathVariableMap(mediaLibraries);
  const pathVariables = new Map(basePathVariables);
  for (const [key, value] of mediaLibraryPathVariables) {
    pathVariables.set(key, value);
  }

  return {
    workspaceRoot,
    settings,
    localSettings,
    mediaLibraries,
    mediaLibraryPathVariables,
    pathVariables,
  };
}

export async function resolveWorkspaceMediaLibraries(
  options: ResolveWorkspaceMediaLibrariesOptions,
): Promise<readonly ResolvedMediaLibrary[]> {
  const settings = readMediaLibrarySettings(options.settings, 'settings');
  const localSettings = readMediaLibraryLocalSettings(options.localSettings, 'localSettings');
  const entries = settings.mediaLibraries ?? [];
  const overrides = localSettings.mediaLibraryOverrides ?? {};

  return Promise.all(
    entries.map(async (entry) => {
      const resolved = resolveMediaLibraryEntry({
        entry,
        override: overrides[entry.variable],
        workspaceRoot: options.workspaceRoot,
        resolvePath: options.resolvePath,
      });
      return {
        ...resolved,
        accessible: options.checkAccessible
          ? await options.checkAccessible(resolved.resolvedPath)
          : false,
      };
    }),
  );
}

export function resolveWorkspaceMediaLibrariesSync(
  options: ResolveWorkspaceMediaLibrariesSyncOptions,
): readonly ResolvedMediaLibrary[] {
  const settings = readMediaLibrarySettings(options.settings, 'settings');
  const localSettings = readMediaLibraryLocalSettings(options.localSettings, 'localSettings');
  const entries = settings.mediaLibraries ?? [];
  const overrides = localSettings.mediaLibraryOverrides ?? {};

  return entries.map((entry) => {
    const resolved = resolveMediaLibraryEntry({
      entry,
      override: overrides[entry.variable],
      workspaceRoot: options.workspaceRoot,
      resolvePath: options.resolvePath,
    });
    return {
      ...resolved,
      accessible: options.checkAccessible ? options.checkAccessible(resolved.resolvedPath) : false,
    };
  });
}

function resolveMediaLibraryEntry(input: {
  readonly entry: MediaLibraryEntry;
  readonly override?: string;
  readonly workspaceRoot: string;
  readonly resolvePath: (source: string, workspaceRoot: string) => string;
}): Omit<ResolvedMediaLibrary, 'accessible'> {
  const selectedPath = input.override ?? input.entry.path;
  return {
    name: input.entry.name,
    resolvedPath: input.resolvePath(selectedPath, input.workspaceRoot),
    originalPath: input.entry.path,
    variable: input.entry.variable,
    enabled: input.entry.enabled !== false,
    overridden: input.override !== undefined,
  };
}

export function createMediaLibraryPathVariableMap(
  libraries: readonly ResolvedMediaLibrary[],
): PathVariableMap {
  const variables: PathVariableMap = new Map();
  for (const library of libraries) {
    if (library.enabled) {
      variables.set(library.variable, library.resolvedPath);
    }
  }
  return variables;
}

export function readMediaLibrarySettings(
  value: unknown,
  sourceLabel: string,
): MediaLibrarySettings {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new Error(`${sourceLabel} must contain a JSON object.`);
  }
  const mediaLibraries = value['mediaLibraries'];
  if (mediaLibraries === undefined) {
    return {};
  }
  if (!Array.isArray(mediaLibraries)) {
    throw new Error(`${sourceLabel}.mediaLibraries must be an array.`);
  }
  return {
    mediaLibraries: mediaLibraries.map((entry, index) =>
      readMediaLibraryEntry(entry, sourceLabel, index),
    ),
  };
}

export function readMediaLibraryLocalSettings(
  value: unknown,
  sourceLabel: string,
): MediaLibraryLocalSettings {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new Error(`${sourceLabel} must contain a JSON object.`);
  }
  const overrides = value['mediaLibraryOverrides'];
  if (overrides === undefined) {
    return {};
  }
  if (!isRecord(overrides)) {
    throw new Error(`${sourceLabel}.mediaLibraryOverrides must be a JSON object.`);
  }
  const mediaLibraryOverrides: Record<string, string> = {};
  for (const [variable, libraryPath] of Object.entries(overrides)) {
    if (!isPathVariableName(variable) || typeof libraryPath !== 'string') {
      throw new Error(
        `${sourceLabel}.mediaLibraryOverrides must map path variable names to strings.`,
      );
    }
    mediaLibraryOverrides[variable] = libraryPath;
  }
  return { mediaLibraryOverrides };
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function readMediaLibraryEntry(
  value: unknown,
  sourceLabel: string,
  index: number,
): MediaLibraryEntry {
  if (!isRecord(value)) {
    throw new Error(`${sourceLabel}.mediaLibraries[${index}] must be a JSON object.`);
  }

  const name = value['name'];
  const libraryPath = value['path'];
  const variable = value['variable'];
  const enabled = value['enabled'];

  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error(`${sourceLabel}.mediaLibraries[${index}].name must be a non-empty string.`);
  }
  if (typeof libraryPath !== 'string' || libraryPath.trim().length === 0) {
    throw new Error(`${sourceLabel}.mediaLibraries[${index}].path must be a non-empty string.`);
  }
  if (typeof variable !== 'string' || !isPathVariableName(variable)) {
    throw new Error(
      `${sourceLabel}.mediaLibraries[${index}].variable must be a valid path variable name.`,
    );
  }
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    throw new Error(`${sourceLabel}.mediaLibraries[${index}].enabled must be a boolean.`);
  }

  return {
    name,
    path: libraryPath,
    variable,
    ...(enabled !== undefined ? { enabled } : {}),
  };
}

async function readOptionalJson(host: NekoHostPorts, filePath: string): Promise<unknown> {
  let content: string;
  try {
    content = await host.files.readText(filePath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }
    throw error;
  }

  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function isPathVariableName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'ENOENT';
}
