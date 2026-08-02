import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type {
  DesktopProjectTabProjection,
  DesktopWindowActiveTarget,
} from '../shared/shell-contract';
import {
  createDefaultDesktopWorkbenchLayout,
  migrateDesktopWorkbenchV1,
  migrateDesktopWorkbenchV2,
  parseDesktopWorkbenchLayout,
  type DesktopWorkbenchLayoutProjection,
} from '../shared/workbench-contract';

export const DESKTOP_SHELL_STATE_VERSION = 4 as const;
// Version 1 remains readable because it contains user-owned local Project and Window state.
const DESKTOP_SHELL_STATE_V1 = 1 as const;
// Version 2 carries the prelaunch Workbench v1 presentation.
const DESKTOP_SHELL_STATE_V2 = 2 as const;
// Version 3 carries the prelaunch Workbench v2 presentation.
const DESKTOP_SHELL_STATE_V3 = 3 as const;

export interface DesktopStoredProject {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly profile: 'content';
  readonly displayName: string;
  readonly workspacePath: string;
  readonly workspaceLocator: {
    readonly kind: 'relative' | 'variable';
    readonly value: string;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DesktopStoredWindow {
  readonly windowId: string;
  readonly revision: number;
  readonly activeTarget: DesktopWindowActiveTarget;
  readonly tabs: readonly DesktopProjectTabProjection[];
  readonly workbench: DesktopWorkbenchLayoutProjection;
}

export interface DesktopShellStoredState {
  readonly schemaVersion: typeof DESKTOP_SHELL_STATE_VERSION;
  readonly storageRevision: number;
  readonly catalogRevision: number;
  readonly primaryWindowId: string | null;
  readonly projects: readonly DesktopStoredProject[];
  readonly windows: readonly DesktopStoredWindow[];
}

export interface DesktopShellStateFilePort {
  readTextIfExists(): Promise<string | null>;
  writeTextAtomic(content: string): Promise<void>;
}

export class DesktopShellStateError extends Error {
  readonly code: 'desktop-shell-invalid-state' | 'desktop-shell-stale-storage-revision';

  constructor(code: DesktopShellStateError['code'], message: string) {
    super(message);
    this.name = 'DesktopShellStateError';
    this.code = code;
  }
}

export class DesktopShellStateRepository {
  constructor(private readonly file: DesktopShellStateFilePort) {}

  async read(): Promise<DesktopShellStoredState> {
    const content = await this.file.readTextIfExists();
    if (content === null) return createEmptyDesktopShellState();
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw invalidState(
        `Desktop Shell state is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return parseDesktopShellStoredState(parsed);
  }

  async commit(
    expectedStorageRevision: number,
    nextState: DesktopShellStoredState,
  ): Promise<DesktopShellStoredState> {
    const current = await this.read();
    if (current.storageRevision !== expectedStorageRevision) {
      throw new DesktopShellStateError(
        'desktop-shell-stale-storage-revision',
        `Desktop Shell storage revision ${expectedStorageRevision} is stale; current revision is ${current.storageRevision}.`,
      );
    }
    const next = parseDesktopShellStoredState(nextState);
    if (next.storageRevision !== expectedStorageRevision + 1) {
      throw invalidState(
        `Desktop Shell commit must advance storage revision from ${expectedStorageRevision} to ${expectedStorageRevision + 1}.`,
      );
    }
    await this.file.writeTextAtomic(`${JSON.stringify(next, null, 2)}\n`);
    return next;
  }
}

export function createNodeDesktopShellStateFilePort(
  stateFilePath: string,
): DesktopShellStateFilePort {
  const absolutePath = path.resolve(stateFilePath);
  return {
    async readTextIfExists(): Promise<string | null> {
      try {
        return await readFile(absolutePath, 'utf8');
      } catch (error) {
        if (hasNodeErrorCode(error, 'ENOENT')) return null;
        throw error;
      }
    },
    async writeTextAtomic(content: string): Promise<void> {
      const temporaryPath = `${absolutePath}.tmp-${randomUUID()}`;
      await mkdir(path.dirname(absolutePath), { recursive: true });
      try {
        await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
        await rename(temporaryPath, absolutePath);
      } finally {
        await rm(temporaryPath, { force: true });
      }
    },
  };
}

function createEmptyDesktopShellState(): DesktopShellStoredState {
  return {
    schemaVersion: DESKTOP_SHELL_STATE_VERSION,
    storageRevision: 0,
    catalogRevision: 0,
    primaryWindowId: null,
    projects: [],
    windows: [],
  };
}

function parseDesktopShellStoredState(value: unknown): DesktopShellStoredState {
  const record = requireRecord(value, 'Desktop Shell state must be an object.');
  const sourceVersion = record['schemaVersion'];
  if (
    sourceVersion !== DESKTOP_SHELL_STATE_VERSION &&
    sourceVersion !== DESKTOP_SHELL_STATE_V3 &&
    sourceVersion !== DESKTOP_SHELL_STATE_V2 &&
    sourceVersion !== DESKTOP_SHELL_STATE_V1
  ) {
    throw invalidState(
      `Unsupported Desktop Shell state version '${String(record['schemaVersion'])}'.`,
    );
  }
  const projects = requireArray(record['projects'], 'Desktop Shell projects must be an array.').map(
    parseStoredProject,
  );
  const projectIds = new Set<string>();
  const workspaceIds = new Set<string>();
  for (const project of projects) {
    if (projectIds.has(project.projectId) || workspaceIds.has(project.workspaceId)) {
      throw invalidState('Desktop Shell Project and Workspace identities must be unique.');
    }
    projectIds.add(project.projectId);
    workspaceIds.add(project.workspaceId);
  }
  const windows = requireArray(record['windows'], 'Desktop Shell windows must be an array.').map(
    (item) => parseStoredWindow(item, projectIds, sourceVersion),
  );
  const windowIds = new Set<string>();
  for (const window of windows) {
    if (windowIds.has(window.windowId)) {
      throw invalidState(`Duplicate Desktop Window identity '${window.windowId}'.`);
    }
    windowIds.add(window.windowId);
  }
  const primaryWindowId = readNullableString(record['primaryWindowId']);
  if (primaryWindowId !== null && !windowIds.has(primaryWindowId)) {
    throw invalidState('Desktop primary Window identity is not present in stored windows.');
  }
  return {
    schemaVersion: DESKTOP_SHELL_STATE_VERSION,
    storageRevision: requireNonNegativeInteger(
      record['storageRevision'],
      'Desktop Shell storage revision is invalid.',
    ),
    catalogRevision: requireNonNegativeInteger(
      record['catalogRevision'],
      'Desktop Shell catalog revision is invalid.',
    ),
    primaryWindowId,
    projects,
    windows,
  };
}

function parseStoredProject(value: unknown): DesktopStoredProject {
  const record = requireRecord(value, 'Desktop stored Project must be an object.');
  if (record['profile'] !== 'content') {
    throw invalidState('Desktop stored Project profile must be content.');
  }
  const locator = requireRecord(
    record['workspaceLocator'],
    'Desktop stored workspace locator must be an object.',
  );
  const locatorKind = locator['kind'];
  if (locatorKind !== 'relative' && locatorKind !== 'variable') {
    throw invalidState('Desktop stored workspace locator kind is invalid.');
  }
  const workspacePath = requireNonEmptyString(
    record['workspacePath'],
    'Desktop stored workspace path is required.',
  );
  if (!path.isAbsolute(workspacePath)) {
    throw invalidState('Desktop stored workspace path must be absolute in Host-only storage.');
  }
  return {
    projectId: requireNonEmptyString(
      record['projectId'],
      'Desktop stored Project identity is required.',
    ),
    workspaceId: requireNonEmptyString(
      record['workspaceId'],
      'Desktop stored Workspace identity is required.',
    ),
    profile: 'content',
    displayName: requireNonEmptyString(
      record['displayName'],
      'Desktop stored Project display name is required.',
    ),
    workspacePath: path.normalize(workspacePath),
    workspaceLocator: {
      kind: locatorKind,
      value: requireNonEmptyString(
        locator['value'],
        'Desktop stored workspace locator value is required.',
      ),
    },
    createdAt: requireNonEmptyString(
      record['createdAt'],
      'Desktop stored Project createdAt is required.',
    ),
    updatedAt: requireNonEmptyString(
      record['updatedAt'],
      'Desktop stored Project updatedAt is required.',
    ),
  };
}

function parseStoredWindow(
  value: unknown,
  projectIds: ReadonlySet<string>,
  sourceVersion:
    | typeof DESKTOP_SHELL_STATE_VERSION
    | typeof DESKTOP_SHELL_STATE_V3
    | typeof DESKTOP_SHELL_STATE_V2
    | typeof DESKTOP_SHELL_STATE_V1,
): DesktopStoredWindow {
  const record = requireRecord(value, 'Desktop stored Window must be an object.');
  const tabs = requireArray(record['tabs'], 'Desktop stored Project Tabs must be an array.').map(
    parseStoredTab,
  );
  const tabIds = new Set<string>();
  const tabProjectIds = new Set<string>();
  for (const tab of tabs) {
    if (!projectIds.has(tab.projectId)) {
      throw invalidState(`Desktop Project Tab references unknown Project '${tab.projectId}'.`);
    }
    if (tabIds.has(tab.tabId) || tabProjectIds.has(tab.projectId)) {
      throw invalidState('A Desktop Window cannot contain duplicate Project Tabs.');
    }
    tabIds.add(tab.tabId);
    tabProjectIds.add(tab.projectId);
  }
  const activeTarget = parseStoredActiveTarget(record['activeTarget']);
  if (activeTarget.kind === 'project' && !tabIds.has(activeTarget.tabId)) {
    throw invalidState('Desktop active Project Tab is not present in its Window.');
  }
  const windowId = requireNonEmptyString(
    record['windowId'],
    'Desktop stored Window identity is required.',
  );
  const workbench =
    sourceVersion === DESKTOP_SHELL_STATE_V1
      ? createDefaultDesktopWorkbenchLayout(windowId)
      : parseStoredWorkbench(record['workbench'], windowId, sourceVersion);
  return {
    windowId,
    revision: requireNonNegativeInteger(
      record['revision'],
      'Desktop stored Window revision is invalid.',
    ),
    activeTarget,
    tabs,
    workbench,
  };
}

function parseStoredWorkbench(
  value: unknown,
  windowId: string,
  sourceVersion:
    | typeof DESKTOP_SHELL_STATE_VERSION
    | typeof DESKTOP_SHELL_STATE_V3
    | typeof DESKTOP_SHELL_STATE_V2,
): DesktopWorkbenchLayoutProjection {
  let workbench: DesktopWorkbenchLayoutProjection;
  try {
    workbench =
      sourceVersion === DESKTOP_SHELL_STATE_V2
        ? migrateDesktopWorkbenchV1(value)
        : sourceVersion === DESKTOP_SHELL_STATE_V3
          ? migrateDesktopWorkbenchV2(value)
          : parseDesktopWorkbenchLayout(value);
  } catch (error) {
    throw invalidState(
      `Desktop stored Workbench layout is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (workbench.windowId !== windowId) {
    throw invalidState('Desktop stored Workbench belongs to another Window.');
  }
  return workbench;
}

function parseStoredTab(value: unknown): DesktopProjectTabProjection {
  const record = requireRecord(value, 'Desktop stored Project Tab must be an object.');
  return {
    tabId: requireNonEmptyString(
      record['tabId'],
      'Desktop stored Project Tab identity is required.',
    ),
    projectId: requireNonEmptyString(
      record['projectId'],
      'Desktop stored Project identity is required.',
    ),
    viewId: requireNonEmptyString(record['viewId'], 'Desktop stored View identity is required.'),
    viewEpoch: requirePositiveInteger(
      record['viewEpoch'],
      'Desktop stored View epoch must be a positive integer.',
    ),
  };
}

function parseStoredActiveTarget(value: unknown): DesktopWindowActiveTarget {
  const record = requireRecord(value, 'Desktop stored active target must be an object.');
  if (record['kind'] === 'home') return { kind: 'home' };
  if (record['kind'] === 'project') {
    return {
      kind: 'project',
      tabId: requireNonEmptyString(
        record['tabId'],
        'Desktop stored active Project Tab identity is required.',
      ),
    };
  }
  throw invalidState('Desktop stored active target kind is invalid.');
}

function readNullableString(value: unknown): string | null {
  if (value === null) return null;
  return requireNonEmptyString(value, 'Desktop nullable identity must be null or a string.');
}

function requireArray(value: unknown, message: string): readonly unknown[] {
  if (!Array.isArray(value)) throw invalidState(message);
  return value;
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (!isUnknownRecord(value)) throw invalidState(message);
  return value;
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw invalidState(message);
  return value;
}

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidState(message);
  }
  return value;
}

function requirePositiveInteger(value: unknown, message: string): number {
  const integer = requireNonNegativeInteger(value, message);
  if (integer === 0) throw invalidState(message);
  return integer;
}

function invalidState(message: string): DesktopShellStateError {
  return new DesktopShellStateError('desktop-shell-invalid-state', message);
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
