import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  diagnoseWorkspaceContentPlacement,
  type NekoStorageDiagnosticCode,
  type WorkspaceContentPlacementObservation,
  type WorkspaceStorageInspectionEntry,
  type WorkspaceStorageInspectionEntryKind,
  type WorkspaceStorageInspectionReport,
} from '../types/storage';

const DEFAULT_LARGE_CACHE_THRESHOLD_BYTES = 1024 * 1024 * 1024;

interface KnownWorkspacePath {
  readonly relativePath: string;
  readonly code: NekoStorageDiagnosticCode;
  readonly kind: WorkspaceStorageInspectionEntryKind;
  readonly severity: WorkspaceStorageInspectionEntry['severity'];
  readonly message: string;
  readonly suggestedTarget?: string;
  readonly requiresExplicitAction: boolean;
}

export interface WorkspaceStorageInspectionOptions {
  readonly workDir: string;
  readonly largeCacheThresholdBytes?: number;
  readonly contentObservations?: readonly WorkspaceContentPlacementObservation[];
}

const LEGACY_METADATA_PATHS: readonly KnownWorkspacePath[] = [
  legacyDatabase('.neko/neko-local.db'),
  legacyDatabase('.neko/neko.db'),
  legacyDatabase('.neko/.cache/neko-cache.db'),
  legacyDatabase('.neko/.cache/neko.db'),
  legacyManifest('.neko/tasks.json'),
  legacyManifest('.neko/.cache/resources/manifest.json'),
  legacyManifest('.neko/.cache/proxies/manifest.json'),
  legacyManifest('.neko/.cache/media-metadata.json'),
  legacyManifest('.neko/.cache/generated/index.json'),
  legacyManifest('.neko/.cache/artifact-index.json'),
  legacyManifest('.neko/.cache/asset-graph.json'),
  legacyManifest('.neko/.cache/search-index.json'),
  {
    relativePath: '.neko/semantic-index',
    code: 'legacy-workspace-metadata',
    kind: 'legacy-projection',
    severity: 'warning',
    message: 'Legacy semantic projection must be migrated or rebuilt in the user metadata store.',
    suggestedTarget: '~/.neko/neko.db#cache',
    requiresExplicitAction: false,
  },
];

const MISPLACED_PROJECT_FACT_PATHS: readonly KnownWorkspacePath[] = [
  misplacedProjectFact('.neko/assets/library.json', 'neko/assets/library.json'),
  misplacedProjectFact('.neko/entity-bindings.json', 'neko/entity-bindings.json'),
  misplacedProjectFact('.neko/visual-identity-drafts.json', 'neko/visual-identity-drafts.json'),
  misplacedProjectFact(
    '.neko/entity-asset-requirements.json',
    'neko/entity-asset-requirements.json',
  ),
  misplacedProjectFact('.neko/providers', 'neko/providers'),
];

const MANAGED_WORKSPACE_PATHS: readonly KnownWorkspacePath[] = [
  {
    relativePath: '.neko/logs',
    code: 'workspace-logs-present',
    kind: 'raw-logs',
    severity: 'info',
    message: 'Workspace raw logs are independent diagnostic evidence subject to retention policy.',
    requiresExplicitAction: false,
  },
  {
    relativePath: '.neko/recordings',
    code: 'preview-recordings-present',
    kind: 'preview-recordings',
    severity: 'warning',
    message: 'Workspace recordings require preview retention or explicit durable promotion.',
    suggestedTarget: '<workspace-or-media-library>',
    requiresExplicitAction: true,
  },
  {
    relativePath: '.neko/imports',
    code: 'import-staging-present',
    kind: 'import-staging',
    severity: 'warning',
    message: 'Workspace import staging requires classification or promotion for long-lived assets.',
    suggestedTarget: '<workspace-or-media-library>',
    requiresExplicitAction: true,
  },
  temporaryStorage('.neko/tmp'),
  temporaryStorage('.neko/temp'),
  temporaryStorage('.neko/.cache/tmp'),
  {
    relativePath: '.neko/skills',
    code: 'deprecated-workspace-directory',
    kind: 'deprecated-directory',
    severity: 'warning',
    message:
      'Deprecated .neko/skills content must be reviewed and moved to the portable Skill root.',
    suggestedTarget: '.agents/skills',
    requiresExplicitAction: true,
  },
];

export async function inspectWorkspaceStorage(
  options: WorkspaceStorageInspectionOptions,
): Promise<WorkspaceStorageInspectionReport> {
  const largeCacheThresholdBytes =
    options.largeCacheThresholdBytes ?? DEFAULT_LARGE_CACHE_THRESHOLD_BYTES;
  if (!Number.isFinite(largeCacheThresholdBytes) || largeCacheThresholdBytes < 0) {
    throw new Error('Workspace storage inspection cache threshold must be a non-negative number.');
  }

  const entries = new Map<string, WorkspaceStorageInspectionEntry>();
  for (const knownPath of [
    ...LEGACY_METADATA_PATHS,
    ...MISPLACED_PROJECT_FACT_PATHS,
    ...MANAGED_WORKSPACE_PATHS,
  ]) {
    const sizeBytes = await readPathSize(join(options.workDir, knownPath.relativePath));
    if (sizeBytes === null) continue;
    addEntry(entries, { ...knownPath, sizeBytes });
  }

  const cacheRelativePath = '.neko/.cache';
  const totalCacheBytes = (await readPathSize(join(options.workDir, cacheRelativePath))) ?? 0;
  if (totalCacheBytes >= largeCacheThresholdBytes && totalCacheBytes > 0) {
    addEntry(entries, {
      code: 'large-workspace-cache',
      kind: 'large-cache',
      severity: 'warning',
      relativePath: cacheRelativePath,
      sizeBytes: totalCacheBytes,
      message: `Workspace cache uses ${totalCacheBytes} bytes and is eligible for scoped cache review.`,
      requiresExplicitAction: false,
    });
  }

  const contentObservations: WorkspaceContentPlacementObservation[] = [
    ...(options.contentObservations ?? []),
  ];
  if ((await readPathSize(join(options.workDir, '.neko/hooks'))) !== null) {
    contentObservations.unshift({
      relativePath: '.neko/hooks',
      kind: 'hook',
      intendedScope: 'project',
    });
  }
  for (const diagnostic of diagnoseWorkspaceContentPlacement(contentObservations)) {
    addEntry(entries, {
      ...diagnostic,
      severity: 'warning',
      kind:
        diagnostic.code === 'deprecated-hook-catalog'
          ? 'deprecated-directory'
          : 'misplaced-personal-content',
      sizeBytes: await readPathSize(join(options.workDir, diagnostic.relativePath)),
      requiresExplicitAction: true,
    });
  }

  return {
    workspaceRoot: options.workDir,
    inspectedRoot: join(options.workDir, '.neko'),
    totalCacheBytes,
    largeCacheThresholdBytes,
    entries: [...entries.values()],
  };
}

function addEntry(
  entries: Map<string, WorkspaceStorageInspectionEntry>,
  entry: WorkspaceStorageInspectionEntry,
): void {
  entries.set(`${entry.code}:${entry.relativePath}`, entry);
}

async function readPathSize(path: string): Promise<number | null> {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'ENOENT') return null;
    throw error;
  }
  if (metadata.isSymbolicLink()) return 0;
  if (!metadata.isDirectory()) return metadata.size;

  let total = 0;
  for (const child of await readdir(path)) {
    total += (await readPathSize(join(path, child))) ?? 0;
  }
  return total;
}

function legacyDatabase(relativePath: string): KnownWorkspacePath {
  return {
    relativePath,
    code: 'retired-workspace-database',
    kind: 'legacy-database',
    severity: 'error',
    message: 'Workspace SQLite metadata is retired and must use the user-level metadata store.',
    suggestedTarget: '~/.neko/neko.db',
    requiresExplicitAction: false,
  };
}

function legacyManifest(relativePath: string): KnownWorkspacePath {
  return {
    relativePath,
    code: 'legacy-workspace-metadata',
    kind: 'legacy-manifest',
    severity: 'warning',
    message:
      'Legacy workspace metadata is a migration or rebuild input, not a normal success path.',
    suggestedTarget: '~/.neko/neko.db',
    requiresExplicitAction: false,
  };
}

function misplacedProjectFact(relativePath: string, suggestedTarget: string): KnownWorkspacePath {
  return {
    relativePath,
    code: 'misplaced-project-fact',
    kind: 'misplaced-project-fact',
    severity: 'error',
    message: 'Project fact is misplaced under workspace-local storage.',
    suggestedTarget,
    requiresExplicitAction: true,
  };
}

function temporaryStorage(relativePath: string): KnownWorkspacePath {
  return {
    relativePath,
    code: 'temporary-storage-present',
    kind: 'temporary-storage',
    severity: 'info',
    message: 'Temporary workspace storage is eligible for scoped retention cleanup.',
    requiresExplicitAction: false,
  };
}

function isErrorWithCode(value: unknown): value is { readonly code: string } {
  return (
    typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string'
  );
}
