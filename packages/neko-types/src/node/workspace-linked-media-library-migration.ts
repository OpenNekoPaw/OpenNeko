import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { loadNkc } from '../nkc/codec';
import { loadNkv } from '../nkv/codec';
import {
  ProjectFileStore,
  createDefaultProjectFormatCodecRegistry,
  nkcSourcePathPolicy,
  nkvSourcePathPolicy,
  type ProjectFileSaveResponse,
  type ProjectSourceDescriptor,
} from '../project-file-io';
import { classifyWorkspaceMediaPath } from '../path/workspace-media-path';
import type { CanvasData } from '../types/canvas';
import type { ProjectData } from '../types/project';
import {
  assertWorkspaceLinkedMediaLibraryName,
  workspaceLinkedMediaLibraryPath,
  type WorkspaceLinkedMediaLibraryDiagnostic,
} from '../types/asset/workspace-linked-media-library';
import type {
  LegacyMediaLibraryEntry,
  LegacyMediaLibraryInspection,
  LegacyMediaLibraryLocalSettings,
  LegacyMediaLibraryMigrationFingerprint,
  LegacyMediaLibraryMigrationPlan,
  LegacyMediaLibraryMigrationTarget,
  LegacyMediaLibrarySettings,
  LegacyMediaLibrarySourceReference,
  LegacyMediaLibrarySourceRewrite,
} from '../types/asset/workspace-linked-media-library-migration';
import {
  createWorkspaceLinkedMediaLibrary,
  replaceWorkspaceLinkedMediaLibrary,
} from './workspace-linked-media-libraries';

const SHARED_SETTINGS_RELATIVE_PATH = 'neko/settings.json';
const LOCAL_SETTINGS_RELATIVE_PATH = '.neko/settings.local.json';

export interface LegacyMediaLibraryTargetSelection {
  readonly legacyVariable: string;
  readonly libraryName: string;
  readonly targetDirectory: string;
}

export type LegacyWorkspaceMediaLibraryMigrationSession =
  | {
      readonly formatId: 'nkc';
      readonly workspaceRoot: string;
      readonly projectFilePath: string;
      readonly originalProjectBytes: Uint8Array;
      readonly document: CanvasData;
      readonly inspection: LegacyMediaLibraryInspection;
      readonly sharedSettingsPath: string;
      readonly localSettingsPath: string;
    }
  | {
      readonly formatId: 'nkv';
      readonly workspaceRoot: string;
      readonly projectFilePath: string;
      readonly originalProjectBytes: Uint8Array;
      readonly document: ProjectData;
      readonly inspection: LegacyMediaLibraryInspection;
      readonly sharedSettingsPath: string;
      readonly localSettingsPath: string;
    };

export interface LegacyMediaLibraryMigrationPlanResult {
  readonly plan?: LegacyMediaLibraryMigrationPlan;
  readonly diagnostics: readonly WorkspaceLinkedMediaLibraryDiagnostic[];
}

export async function inspectLegacyWorkspaceMediaLibraryProject(input: {
  readonly workspaceRoot: string;
  readonly projectFilePath: string;
  readonly sharedSettingsPath?: string;
  readonly localSettingsPath?: string;
}): Promise<LegacyWorkspaceMediaLibraryMigrationSession> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const projectFilePath = path.resolve(input.projectFilePath);
  const sharedSettingsPath =
    input.sharedSettingsPath ??
    path.join(workspaceRoot, ...SHARED_SETTINGS_RELATIVE_PATH.split('/'));
  const localSettingsPath =
    input.localSettingsPath ?? path.join(workspaceRoot, ...LOCAL_SETTINGS_RELATIVE_PATH.split('/'));
  const [originalProjectBytes, sharedValue, localValue] = await Promise.all([
    readFile(projectFilePath),
    readOptionalJson(sharedSettingsPath),
    readOptionalJson(localSettingsPath),
  ]);
  const settings = readLegacyMediaLibrarySettings(sharedValue, sharedSettingsPath);
  const localSettings = readLegacyMediaLibraryLocalSettings(localValue, localSettingsPath);
  const extension = path.extname(projectFilePath).toLowerCase();
  const json = new TextDecoder().decode(originalProjectBytes);

  if (extension === '.nkc') {
    const loaded = loadNkc(json);
    assertInspectableProject(loaded.validation.errors, projectFilePath);
    return {
      formatId: 'nkc',
      workspaceRoot,
      projectFilePath,
      originalProjectBytes,
      document: loaded.data,
      inspection: inspectLegacySources(
        loaded.data,
        nkcSourcePathPolicy.listSources,
        settings,
        localSettings,
      ),
      sharedSettingsPath,
      localSettingsPath,
    };
  }
  if (extension === '.nkv') {
    const loaded = loadNkv(json);
    assertInspectableProject(loaded.validation.errors, projectFilePath);
    return {
      formatId: 'nkv',
      workspaceRoot,
      projectFilePath,
      originalProjectBytes,
      document: loaded.project,
      inspection: inspectLegacySources(
        loaded.project,
        nkvSourcePathPolicy.listSources,
        settings,
        localSettings,
      ),
      sharedSettingsPath,
      localSettingsPath,
    };
  }
  throw new Error(`Legacy media-library migration only supports NKC and NKV: ${projectFilePath}`);
}

export async function createLegacyWorkspaceMediaLibraryMigrationPlan(
  session: LegacyWorkspaceMediaLibraryMigrationSession,
  selections: readonly LegacyMediaLibraryTargetSelection[],
): Promise<LegacyMediaLibraryMigrationPlanResult> {
  const diagnostics = [...session.inspection.diagnostics];
  const entries = session.inspection.settings.mediaLibraries ?? [];
  const entryByVariable = uniqueEntriesByVariable(entries, diagnostics);
  const selectionByVariable = new Map<string, LegacyMediaLibraryTargetSelection>();
  for (const selection of selections) {
    if (selectionByVariable.has(selection.legacyVariable)) {
      diagnostics.push(
        migrationDiagnostic(`Duplicate target selection for ${selection.legacyVariable}.`),
      );
      continue;
    }
    try {
      assertWorkspaceLinkedMediaLibraryName(selection.libraryName);
      const targetStat = await stat(selection.targetDirectory);
      await access(selection.targetDirectory, constants.R_OK);
      if (!targetStat.isDirectory()) throw new Error('target is not a directory');
      selectionByVariable.set(selection.legacyVariable, selection);
    } catch {
      diagnostics.push(
        migrationDiagnostic(
          `Selected target for ${selection.legacyVariable} is not an accessible directory.`,
        ),
      );
    }
  }

  const rewrites: LegacyMediaLibrarySourceRewrite[] = [];
  const fingerprintByWorkspacePath = new Map<string, LegacyMediaLibraryMigrationFingerprint>();
  for (const source of session.inspection.sources) {
    const mapping = mapLegacySource(
      source,
      entryByVariable,
      selectionByVariable,
      session.inspection.localSettings,
    );
    if (!mapping) {
      diagnostics.push(
        migrationDiagnostic(`Legacy source ${source.sourceId} cannot be mapped safely.`),
      );
      continue;
    }
    try {
      const bytes = await readFile(mapping.selectedSourcePath);
      const sourceStat = await stat(mapping.selectedSourcePath);
      if (!sourceStat.isFile()) throw new Error('source is not a file');
      rewrites.push({
        sourceId: source.sourceId,
        fieldPath: source.fieldPath,
        previousValue: source.value,
        workspacePath: mapping.workspacePath,
      });
      fingerprintByWorkspacePath.set(mapping.workspacePath, {
        sourceWorkspacePath: mapping.workspacePath,
        sizeBytes: bytes.byteLength,
        contentHash: hashBytes(bytes),
      });
    } catch {
      diagnostics.push(
        migrationDiagnostic(
          `Legacy source ${source.sourceId} is unavailable at the selected target.`,
        ),
      );
    }
  }

  if (session.inspection.sources.length === 0) {
    diagnostics.push(migrationDiagnostic('No legacy media-library project sources were found.'));
  }
  if (diagnostics.length > 0) return { diagnostics };

  const targets: LegacyMediaLibraryMigrationTarget[] = [...selectionByVariable.values()].map(
    (selection) => ({
      legacyVariable: selection.legacyVariable,
      libraryName: selection.libraryName,
      targetDirectory: path.resolve(selection.targetDirectory),
      linkWorkspacePath: workspaceLinkedMediaLibraryPath(selection.libraryName),
    }),
  );
  return {
    diagnostics: [],
    plan: {
      originalProjectContentHash: hashBytes(session.originalProjectBytes),
      targets,
      rewrites,
      fingerprints: [...fingerprintByWorkspacePath.values()],
      removeSharedSettings: true,
      removeLocalSettings: true,
    },
  };
}

export async function confirmLegacyWorkspaceMediaLibraryMigration(
  session: LegacyWorkspaceMediaLibraryMigrationSession,
  plan: LegacyMediaLibraryMigrationPlan,
): Promise<ProjectFileSaveResponse<CanvasData | ProjectData>> {
  const currentProjectBytes = await readFile(session.projectFilePath);
  if (hashBytes(currentProjectBytes) !== plan.originalProjectContentHash) {
    throw new Error(
      'Project changed after legacy media-library inspection; inspect again before migration.',
    );
  }
  await verifyPlanFingerprints(plan);

  for (const target of plan.targets) {
    const linkPath = path.join(session.workspaceRoot, ...target.linkWorkspacePath.split('/'));
    const existing = await optionalLstat(linkPath);
    if (existing) {
      await replaceWorkspaceLinkedMediaLibrary({
        workspaceRoot: session.workspaceRoot,
        name: target.libraryName,
        targetDirectory: target.targetDirectory,
      });
    } else {
      await createWorkspaceLinkedMediaLibrary({
        workspaceRoot: session.workspaceRoot,
        name: target.libraryName,
        targetDirectory: target.targetDirectory,
      });
    }
  }

  const settingsBackups = await Promise.all([
    readOptionalBytes(session.sharedSettingsPath),
    readOptionalBytes(session.localSettingsPath),
  ]);
  const store = new ProjectFileStore({
    registry: createDefaultProjectFormatCodecRegistry(),
    fileOps: nodeProjectFileOps,
  });
  const saveResult = await saveMigratedProject(store, session, plan);
  if (!saveResult.ok || !saveResult.written) {
    throw new Error(
      `Legacy media-library migration save failed: ${saveResult.diagnostics.map((item) => item.message).join('; ')}`,
    );
  }

  try {
    if (plan.removeSharedSettings) {
      await removeLegacySettingsField(session.sharedSettingsPath, 'mediaLibraries');
    }
    if (plan.removeLocalSettings) {
      await removeLegacySettingsField(session.localSettingsPath, 'mediaLibraryOverrides');
    }
  } catch (error) {
    await restoreMigrationBytes(session, settingsBackups);
    throw new Error(
      `Legacy media-library settings cleanup failed; project bytes were restored: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return saveResult;
}

export function readLegacyMediaLibrarySettings(
  value: unknown,
  sourceLabel: string,
): LegacyMediaLibrarySettings {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`${sourceLabel} must contain a JSON object.`);
  const entries = value['mediaLibraries'];
  if (entries === undefined) return {};
  if (!Array.isArray(entries)) throw new Error(`${sourceLabel}.mediaLibraries must be an array.`);
  return {
    mediaLibraries: entries.map((entry, index) =>
      readLegacyMediaLibraryEntry(entry, sourceLabel, index),
    ),
  };
}

export function readLegacyMediaLibraryLocalSettings(
  value: unknown,
  sourceLabel: string,
): LegacyMediaLibraryLocalSettings {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`${sourceLabel} must contain a JSON object.`);
  const overrides = value['mediaLibraryOverrides'];
  if (overrides === undefined) return {};
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

function inspectLegacySources<TDocument>(
  document: TDocument,
  listSources: (document: TDocument) => readonly ProjectSourceDescriptor[],
  settings: LegacyMediaLibrarySettings,
  localSettings: LegacyMediaLibraryLocalSettings,
): LegacyMediaLibraryInspection {
  const knownVariables = new Set((settings.mediaLibraries ?? []).map((entry) => entry.variable));
  const sources: LegacyMediaLibrarySourceReference[] = [];
  const diagnostics: WorkspaceLinkedMediaLibraryDiagnostic[] = [];
  for (const descriptor of listSources(document)) {
    const classification = classifyWorkspaceMediaPath(descriptor.path);
    if (classification.kind === 'absolute-local') {
      sources.push({
        sourceId: descriptor.id,
        fieldPath: descriptor.fieldPath,
        value: descriptor.path,
        kind: 'absolute-local',
      });
    } else if (classification.kind === 'variable') {
      sources.push({
        sourceId: descriptor.id,
        fieldPath: descriptor.fieldPath,
        value: descriptor.path,
        kind: 'variable',
        variable: classification.variable,
      });
      if (!knownVariables.has(classification.variable)) {
        diagnostics.push(
          migrationDiagnostic(
            `Legacy source ${descriptor.id} uses unknown variable ${classification.variable}.`,
          ),
        );
      }
    }
  }
  return { settings, localSettings, sources, diagnostics };
}

function mapLegacySource(
  source: LegacyMediaLibrarySourceReference,
  entryByVariable: ReadonlyMap<string, LegacyMediaLibraryEntry>,
  selectionByVariable: ReadonlyMap<string, LegacyMediaLibraryTargetSelection>,
  localSettings: LegacyMediaLibraryLocalSettings,
): { readonly selectedSourcePath: string; readonly workspacePath: string } | undefined {
  let variable: string | undefined;
  let relativePath: string | undefined;
  if (source.kind === 'variable' && source.variable) {
    variable = source.variable;
    const classification = classifyWorkspaceMediaPath(source.value);
    relativePath = classification.variableRest?.replace(/^[\\/]+/u, '');
  } else {
    const matches = [...entryByVariable.values()]
      .map((entry) => ({
        entry,
        relativePath: relativePathInside(
          source.value,
          localSettings.mediaLibraryOverrides?.[entry.variable] ?? entry.path,
        ),
      }))
      .filter((item): item is { entry: LegacyMediaLibraryEntry; relativePath: string } =>
        Boolean(item.relativePath),
      )
      .sort((left, right) => right.entry.path.length - left.entry.path.length);
    variable = matches[0]?.entry.variable;
    relativePath = matches[0]?.relativePath;
  }
  if (!variable || !relativePath || !isSafeRelativePath(relativePath)) return undefined;
  const selection = selectionByVariable.get(variable);
  if (!selection || !entryByVariable.has(variable)) return undefined;
  const portableRelative = relativePath.split(path.sep).join('/');
  return {
    selectedSourcePath: path.join(selection.targetDirectory, ...portableRelative.split('/')),
    workspacePath: `${workspaceLinkedMediaLibraryPath(selection.libraryName)}/${portableRelative}`,
  };
}

function uniqueEntriesByVariable(
  entries: readonly LegacyMediaLibraryEntry[],
  diagnostics: WorkspaceLinkedMediaLibraryDiagnostic[],
): ReadonlyMap<string, LegacyMediaLibraryEntry> {
  const result = new Map<string, LegacyMediaLibraryEntry>();
  for (const entry of entries) {
    if (result.has(entry.variable)) {
      diagnostics.push(
        migrationDiagnostic(`Legacy variable ${entry.variable} is defined more than once.`),
      );
    } else {
      result.set(entry.variable, entry);
    }
  }
  return result;
}

async function verifyPlanFingerprints(plan: LegacyMediaLibraryMigrationPlan): Promise<void> {
  for (const fingerprint of plan.fingerprints) {
    const target = plan.targets.find((candidate) =>
      fingerprint.sourceWorkspacePath.startsWith(`${candidate.linkWorkspacePath}/`),
    );
    if (!target)
      throw new Error(
        `Migration fingerprint has no selected target: ${fingerprint.sourceWorkspacePath}`,
      );
    const relativePath = fingerprint.sourceWorkspacePath.slice(target.linkWorkspacePath.length + 1);
    if (!isSafeRelativePath(relativePath))
      throw new Error('Migration fingerprint path is invalid.');
    const bytes = await readFile(path.join(target.targetDirectory, ...relativePath.split('/')));
    if (
      bytes.byteLength !== fingerprint.sizeBytes ||
      hashBytes(bytes) !== fingerprint.contentHash
    ) {
      throw new Error(
        `Legacy media-library source changed after inspection: ${fingerprint.sourceWorkspacePath}`,
      );
    }
  }
}

async function saveMigratedProject(
  store: ProjectFileStore,
  session: LegacyWorkspaceMediaLibraryMigrationSession,
  plan: LegacyMediaLibraryMigrationPlan,
): Promise<ProjectFileSaveResponse<CanvasData | ProjectData>> {
  if (session.formatId === 'nkc') {
    const document = replacePlannedSources(
      session.document,
      nkcSourcePathPolicy.listSources,
      nkcSourcePathPolicy.replaceSources,
      plan,
    );
    return store.save({
      filePath: session.projectFilePath,
      formatId: 'nkc',
      document,
      sourcePolicy: nkcSourcePathPolicy,
      sourcePolicyOptions: migrationSourcePolicyOptions(session.workspaceRoot),
      saveReason: 'migration',
      atomic: true,
    });
  }
  const document = replacePlannedSources(
    session.document,
    nkvSourcePathPolicy.listSources,
    nkvSourcePathPolicy.replaceSources,
    plan,
  );
  return store.save({
    filePath: session.projectFilePath,
    formatId: 'nkv',
    document,
    sourcePolicy: nkvSourcePathPolicy,
    sourcePolicyOptions: migrationSourcePolicyOptions(session.workspaceRoot),
    saveReason: 'migration',
    atomic: true,
  });
}

function replacePlannedSources<TDocument>(
  document: TDocument,
  listSources: (document: TDocument) => readonly ProjectSourceDescriptor[],
  replaceSources: (
    document: TDocument,
    replacements: readonly { descriptor: ProjectSourceDescriptor; path: string }[],
  ) => TDocument,
  plan: LegacyMediaLibraryMigrationPlan,
): TDocument {
  const descriptors = new Map(
    listSources(document).map((descriptor) => [descriptor.id, descriptor]),
  );
  const replacements = plan.rewrites.map((rewrite) => {
    const descriptor = descriptors.get(rewrite.sourceId);
    if (!descriptor || descriptor.path !== rewrite.previousValue) {
      throw new Error(`Project source changed after migration inspection: ${rewrite.sourceId}`);
    }
    return { descriptor, path: rewrite.workspacePath };
  });
  return replaceSources(document, replacements);
}

function migrationSourcePolicyOptions(workspaceRoot: string) {
  return {
    context: {
      owningWorkspaceRoot: workspaceRoot,
      workspaceRoots: [workspaceRoot],
      pathVariables: new Map([
        ['WORKSPACE', workspaceRoot],
        ['PROJECT', workspaceRoot],
      ]),
      allowedRoots: [workspaceRoot],
    },
  };
}

async function removeLegacySettingsField(filePath: string, field: string): Promise<void> {
  const bytes = await readOptionalBytes(filePath);
  if (!bytes) return;
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isRecord(value)) throw new Error(`${filePath} must contain a JSON object.`);
  const next = { ...value };
  delete next[field];
  await atomicWriteBytes(filePath, new TextEncoder().encode(`${JSON.stringify(next, null, 2)}\n`));
}

async function restoreMigrationBytes(
  session: LegacyWorkspaceMediaLibraryMigrationSession,
  settingsBackups: readonly [Uint8Array | undefined, Uint8Array | undefined],
): Promise<void> {
  await atomicWriteBytes(session.projectFilePath, session.originalProjectBytes);
  if (settingsBackups[0]) await atomicWriteBytes(session.sharedSettingsPath, settingsBackups[0]);
  if (settingsBackups[1]) await atomicWriteBytes(session.localSettingsPath, settingsBackups[1]);
}

async function atomicWriteBytes(filePath: string, bytes: Uint8Array): Promise<void> {
  const temporaryPath = `${filePath}.migration-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

const nodeProjectFileOps = {
  readFile: (filePath: string) => readFile(filePath),
  writeFile: (filePath: string, content: Uint8Array) => writeFile(filePath, content),
  deleteFile: (filePath: string) => rm(filePath, { force: true }),
  renameFile: (fromPath: string, toPath: string) => rename(fromPath, toPath),
};

async function readOptionalJson(filePath: string): Promise<unknown> {
  const bytes = await readOptionalBytes(filePath);
  return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : undefined;
}

async function readOptionalBytes(filePath: string): Promise<Uint8Array | undefined> {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

async function optionalLstat(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

function relativePathInside(candidate: string, root: string): string | undefined {
  if (!path.isAbsolute(candidate) || !path.isAbsolute(root)) return undefined;
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return isSafeRelativePath(relative) ? relative : undefined;
}

function isSafeRelativePath(value: string): boolean {
  if (!value || path.isAbsolute(value)) return false;
  return !value.split(/[\\/]/u).some((segment) => !segment || segment === '.' || segment === '..');
}

function hashBytes(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function assertInspectableProject(
  errors: readonly { readonly message: string }[],
  projectFilePath: string,
): void {
  if (errors.length > 0) {
    throw new Error(
      `Legacy project requires schema repair before media migration: ${projectFilePath}`,
    );
  }
}

function readLegacyMediaLibraryEntry(
  value: unknown,
  sourceLabel: string,
  index: number,
): LegacyMediaLibraryEntry {
  if (!isRecord(value))
    throw new Error(`${sourceLabel}.mediaLibraries[${index}] must be a JSON object.`);
  const name = value['name'];
  const libraryPath = value['path'];
  const variable = value['variable'];
  const enabled = value['enabled'];
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`${sourceLabel}.mediaLibraries[${index}].name must be a non-empty string.`);
  }
  if (typeof libraryPath !== 'string' || !libraryPath.trim()) {
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
  return { name, path: libraryPath, variable, ...(enabled !== undefined ? { enabled } : {}) };
}

function isPathVariableName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(value);
}

function migrationDiagnostic(message: string): WorkspaceLinkedMediaLibraryDiagnostic {
  return { code: 'migration-required', severity: 'error', message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error['code'] === code;
}
