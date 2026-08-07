import * as path from 'node:path';

import type {
  DesktopProjectTabProjection,
  DesktopShellStateDiagnosticProjection,
  DesktopWindowActiveTarget,
} from './desktop-shell-contract';
import {
  parseDesktopApplicationSidebarProjection,
  type DesktopApplicationSidebarProjection,
} from './desktop-scene-contract';
import {
  parseDesktopWorkbenchLayout,
  type DesktopWorkbenchLayoutProjection,
} from './desktop-workbench-contract';
import {
  parseDesktopWindowComposition,
  serializeDesktopWindowComposition,
  type DesktopWindowCompositionProjection,
} from './desktop-window-composition-contract';

export const DESKTOP_DEFAULT_ASSISTANT_SPACE_ID = 'assistant-space:local-user' as const;

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
  readonly activeTarget: DesktopWindowActiveTarget;
  readonly tabs: readonly DesktopStoredProjectTab[];
  readonly workbench: DesktopWindowCompositionProjection;
  readonly applicationSidebar: DesktopApplicationSidebarProjection;
}

export interface DesktopStoredProjectTab extends DesktopProjectTabProjection {
  readonly presentation?: DesktopWorkbenchLayoutProjection;
}

export interface DesktopShellStoredState {
  readonly primaryWindowId: string | null;
  readonly projects: readonly DesktopStoredProject[];
  readonly windows: readonly DesktopStoredWindow[];
}

export type DesktopShellStateDiagnostic = DesktopShellStateDiagnosticProjection;

interface DesktopRetainedInvalidWindow {
  readonly record: unknown;
  readonly diagnostic: DesktopShellStateDiagnostic;
}

type DesktopRetainedRootMetadataEntry = readonly [fieldName: string, value: unknown];

const RETAINED_INVALID_WINDOWS: unique symbol = Symbol('desktop-retained-invalid-windows');
const RETAINED_ROOT_METADATA: unique symbol = Symbol('desktop-retained-root-metadata');
const DESKTOP_SHELL_ROOT_FIELDS = ['primaryWindowId', 'projects', 'windows'] as const;
const DESKTOP_SHELL_ROOT_FIELD_SET = new Set<string>(DESKTOP_SHELL_ROOT_FIELDS);

type DesktopShellStateWithRetainedInvalidWindows = DesktopShellStoredState & {
  readonly [RETAINED_INVALID_WINDOWS]: readonly DesktopRetainedInvalidWindow[];
  readonly [RETAINED_ROOT_METADATA]: readonly DesktopRetainedRootMetadataEntry[];
};

export interface DesktopShellStateRepositoryPort {
  read(): Promise<DesktopShellStoredState>;
  commit(nextState: DesktopShellStoredState): Promise<DesktopShellStoredState>;
}

export class DesktopShellStateError extends Error {
  readonly code: 'desktop-shell-invalid-state';

  constructor(code: DesktopShellStateError['code'], message: string) {
    super(message);
    this.name = 'DesktopShellStateError';
    this.code = code;
  }
}

export function createEmptyDesktopShellState(): DesktopShellStoredState {
  return {
    primaryWindowId: null,
    projects: [],
    windows: [],
  };
}

export function parseDesktopShellStoredState(value: unknown): DesktopShellStoredState {
  const record = requireRecord(value, 'Desktop Shell state must be an object.');
  const retainedRootMetadata = collectRetainedRootMetadata(value, record);
  const projects = requireArray(record['projects'], 'Desktop Shell projects must be an array.').map(
    parseStoredProject,
  );
  const projectsById = new Map<string, DesktopStoredProject>();
  const workspaceIds = new Set<string>();
  for (const project of projects) {
    if (projectsById.has(project.projectId) || workspaceIds.has(project.workspaceId)) {
      throw invalidState('Desktop Shell Project and Workspace identities must be unique.');
    }
    projectsById.set(project.projectId, project);
    workspaceIds.add(project.workspaceId);
  }
  const retainedInvalidWindows = readRetainedInvalidWindows(value);
  const windowCandidates = [
    ...requireArray(record['windows'], 'Desktop Shell windows must be an array.'),
    ...retainedInvalidWindows.map((invalid) => invalid.record),
  ];
  const windows: DesktopStoredWindow[] = [];
  const invalidWindows: DesktopRetainedInvalidWindow[] = [];
  const windowIds = new Set<string>();
  const candidateWindowIds = new Set<string>();
  for (const [index, candidate] of windowCandidates.entries()) {
    const candidateWindowId = readCandidateWindowId(candidate, index);
    candidateWindowIds.add(candidateWindowId);
    let window: DesktopStoredWindow;
    try {
      window = parseStoredWindow(candidate, projectsById);
    } catch (error) {
      invalidWindows.push({
        record: candidate,
        diagnostic: {
          code: 'desktop-stored-window-invalid',
          severity: 'error',
          windowId: candidateWindowId,
          message: `Stored Window '${candidateWindowId}' is unavailable and was not opened: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      });
      continue;
    }
    if (windowIds.has(window.windowId)) {
      invalidWindows.push({
        record: candidate,
        diagnostic: {
          code: 'desktop-stored-window-invalid',
          severity: 'error',
          windowId: window.windowId,
          message: `Duplicate Desktop Window identity '${window.windowId}'.`,
        },
      });
      continue;
    }
    windowIds.add(window.windowId);
    windows.push(window);
  }
  const storedPrimaryWindowId = readNullableString(record['primaryWindowId']);
  if (
    storedPrimaryWindowId !== null &&
    !windowIds.has(storedPrimaryWindowId) &&
    !candidateWindowIds.has(storedPrimaryWindowId)
  ) {
    throw invalidState('Desktop primary Window identity is not present in stored windows.');
  }
  const primaryWindowId =
    storedPrimaryWindowId !== null && windowIds.has(storedPrimaryWindowId)
      ? storedPrimaryWindowId
      : null;
  const parsed: DesktopShellStateWithRetainedInvalidWindows = {
    primaryWindowId,
    projects,
    windows,
    [RETAINED_INVALID_WINDOWS]: invalidWindows,
    [RETAINED_ROOT_METADATA]: retainedRootMetadata,
  };
  return parsed;
}

export function readDesktopShellStateDiagnostics(
  state: DesktopShellStoredState,
): readonly DesktopShellStateDiagnostic[] {
  const invalidWindowDiagnostics = readRetainedInvalidWindows(state).map(
    (invalid) => invalid.diagnostic,
  );
  const retainedRootMetadata = readRetainedRootMetadata(state);
  if (retainedRootMetadata.length === 0) return invalidWindowDiagnostics;
  const fieldNames = retainedRootMetadata.map(([fieldName]) => fieldName);
  return [
    ...invalidWindowDiagnostics,
    {
      code: 'desktop-stored-state-metadata-retained',
      severity: 'warning',
      authorityKey: 'desktop.shell',
      fieldNames,
      message: `Desktop Shell root metadata was preserved without interpretation: ${fieldNames
        .map((fieldName) => JSON.stringify(fieldName))
        .join(', ')}.`,
    },
  ];
}

export function serializeDesktopShellStoredState(state: DesktopShellStoredState): unknown {
  const parsed = parseDesktopShellStoredState(state);
  return {
    ...Object.fromEntries(readRetainedRootMetadata(parsed)),
    primaryWindowId: parsed.primaryWindowId,
    projects: parsed.projects,
    windows: [
      ...parsed.windows.map(serializeStoredWindow),
      ...readRetainedInvalidWindows(parsed).map((invalid) => invalid.record),
    ],
  };
}

function serializeStoredWindow(window: DesktopStoredWindow): unknown {
  return {
    windowId: window.windowId,
    activeTarget: window.activeTarget,
    tabs: window.tabs,
    workbench: serializeDesktopWindowComposition(window.workbench),
    applicationSidebar: window.applicationSidebar,
  };
}

function parseStoredProject(value: unknown): DesktopStoredProject {
  const record = requireRecord(value, 'Desktop stored Project must be an object.');
  requireExactKeys(
    record,
    [
      'projectId',
      'workspaceId',
      'profile',
      'displayName',
      'workspacePath',
      'workspaceLocator',
      'createdAt',
      'updatedAt',
    ],
    'Desktop stored Project',
  );
  if (record['profile'] !== 'content') {
    throw invalidState('Desktop stored Project profile must be content.');
  }
  const locator = requireRecord(
    record['workspaceLocator'],
    'Desktop stored workspace locator must be an object.',
  );
  requireExactKeys(locator, ['kind', 'value'], 'Desktop stored workspace locator');
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
  projectsById: ReadonlyMap<string, DesktopStoredProject>,
): DesktopStoredWindow {
  const record = requireRecord(value, 'Desktop stored Window must be an object.');
  requireExactKeys(
    record,
    ['windowId', 'activeTarget', 'tabs', 'workbench', 'applicationSidebar'],
    'Desktop stored Window',
  );
  const windowId = requireNonEmptyString(
    record['windowId'],
    'Desktop stored Window identity is required.',
  );
  const tabs = requireArray(record['tabs'], 'Desktop stored Project Tabs must be an array.').map(
    (tab) => parseStoredTab(tab, windowId, projectsById),
  );
  const tabIds = new Set<string>();
  const tabProjectIds = new Set<string>();
  for (const tab of tabs) {
    if (!projectsById.has(tab.projectId)) {
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
  const workbench = parseStoredWindowComposition(record['workbench'], windowId);
  const applicationSidebar = parseStoredApplicationSidebar(record['applicationSidebar'], windowId);
  return {
    windowId,
    activeTarget,
    tabs,
    workbench,
    applicationSidebar,
  };
}

function readCandidateWindowId(value: unknown, index: number): string {
  if (isUnknownRecord(value)) {
    const windowId = value['windowId'];
    if (typeof windowId === 'string' && windowId.trim().length > 0) return windowId;
  }
  return `invalid-window-record:${index + 1}`;
}

function readRetainedInvalidWindows(value: unknown): readonly DesktopRetainedInvalidWindow[] {
  if (!isUnknownRecord(value) || !(RETAINED_INVALID_WINDOWS in value)) return [];
  const retained = value[RETAINED_INVALID_WINDOWS];
  if (!Array.isArray(retained)) {
    throw invalidState('Desktop retained invalid Window records must be an array.');
  }
  return retained.map((candidate) => {
    if (!isRetainedInvalidWindow(candidate)) {
      throw invalidState('Desktop retained invalid Window record is invalid.');
    }
    return candidate;
  });
}

function collectRetainedRootMetadata(
  value: unknown,
  record: Readonly<Record<string, unknown>>,
): readonly DesktopRetainedRootMetadataEntry[] {
  return validateRetainedRootMetadata([
    ...readRetainedRootMetadata(value),
    ...Object.entries(record).filter(([fieldName]) => !DESKTOP_SHELL_ROOT_FIELD_SET.has(fieldName)),
  ]);
}

function readRetainedRootMetadata(value: unknown): readonly DesktopRetainedRootMetadataEntry[] {
  if (!isUnknownRecord(value) || !(RETAINED_ROOT_METADATA in value)) return [];
  const retained = value[RETAINED_ROOT_METADATA];
  if (!Array.isArray(retained)) {
    throw invalidState('Desktop retained root metadata must be an array.');
  }
  return validateRetainedRootMetadata(retained);
}

function validateRetainedRootMetadata(
  entries: readonly unknown[],
): readonly DesktopRetainedRootMetadataEntry[] {
  const fieldNames = new Set<string>();
  const retained: DesktopRetainedRootMetadataEntry[] = [];
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
      throw invalidState('Desktop retained root metadata entry is invalid.');
    }
    const fieldName = entry[0];
    if (DESKTOP_SHELL_ROOT_FIELD_SET.has(fieldName) || fieldNames.has(fieldName)) {
      throw invalidState(`Desktop retained root metadata field '${fieldName}' is duplicated.`);
    }
    fieldNames.add(fieldName);
    retained.push([fieldName, entry[1]]);
  }
  return retained;
}

function isRetainedInvalidWindow(value: unknown): value is DesktopRetainedInvalidWindow {
  if (!isUnknownRecord(value)) return false;
  const diagnostic = value['diagnostic'];
  return (
    'record' in value &&
    isUnknownRecord(diagnostic) &&
    diagnostic['code'] === 'desktop-stored-window-invalid' &&
    diagnostic['severity'] === 'error' &&
    typeof diagnostic['windowId'] === 'string' &&
    diagnostic['windowId'].trim().length > 0 &&
    typeof diagnostic['message'] === 'string' &&
    diagnostic['message'].trim().length > 0
  );
}

function parseStoredWindowComposition(
  value: unknown,
  windowId: string,
): DesktopWindowCompositionProjection {
  let workbench: DesktopWindowCompositionProjection;
  try {
    workbench = parseDesktopWindowComposition(value);
  } catch (error) {
    throw invalidState(
      `Desktop stored Window composition is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (workbench.windowId !== windowId) {
    throw invalidState('Desktop stored Window composition belongs to another Window.');
  }
  return workbench;
}

function parseStoredApplicationSidebar(
  value: unknown,
  windowId: string,
): DesktopApplicationSidebarProjection {
  let sidebar: DesktopApplicationSidebarProjection;
  try {
    sidebar = parseDesktopApplicationSidebarProjection(value);
  } catch (error) {
    throw invalidState(
      `Desktop stored Application Sidebar is invalid: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (sidebar.windowId !== windowId) {
    throw invalidState('Desktop stored Application Sidebar belongs to another Window.');
  }
  return sidebar;
}

function parseStoredTab(
  value: unknown,
  windowId: string,
  projectsById: ReadonlyMap<string, DesktopStoredProject>,
): DesktopStoredProjectTab {
  const record = requireRecord(value, 'Desktop stored Project Tab must be an object.');
  const hasPresentation = Object.hasOwn(record, 'presentation');
  requireExactKeys(
    record,
    [
      'tabId',
      'projectId',
      'viewId',
      'viewInstanceId',
      ...(hasPresentation ? ['presentation'] : []),
    ],
    'Desktop stored Project Tab',
  );
  const projectId = requireNonEmptyString(
    record['projectId'],
    'Desktop stored Project identity is required.',
  );
  const presentation = hasPresentation
    ? parseDesktopWorkbenchLayout(record['presentation'])
    : undefined;
  const project = projectsById.get(projectId);
  if (!project) {
    throw invalidState(`Desktop Project Tab references unknown Project '${projectId}'.`);
  }
  if (presentation !== undefined && presentation.windowId !== windowId) {
    throw invalidState('Desktop stored Project presentation belongs to another Window.');
  }
  if (
    presentation?.main.views.some(
      (view) => view.projectId !== projectId || view.workspaceId !== project.workspaceId,
    )
  ) {
    throw invalidState('Desktop stored Project presentation contains a foreign View.');
  }
  return {
    tabId: requireNonEmptyString(
      record['tabId'],
      'Desktop stored Project Tab identity is required.',
    ),
    projectId,
    viewId: requireNonEmptyString(record['viewId'], 'Desktop stored View identity is required.'),
    viewInstanceId: requireNonEmptyString(
      record['viewInstanceId'],
      'Desktop stored View instance identity is required.',
    ),
    ...(presentation === undefined ? {} : { presentation }),
  };
}

function parseStoredActiveTarget(value: unknown): DesktopWindowActiveTarget {
  const record = requireRecord(value, 'Desktop stored active target must be an object.');
  if (record['kind'] === 'home') {
    requireExactKeys(record, ['kind'], 'Desktop stored active Home target');
    return { kind: 'home' };
  }
  if (record['kind'] === 'project') {
    requireExactKeys(record, ['kind', 'tabId'], 'Desktop stored active Project target');
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

function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actualKeys = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (
    actualKeys.length !== expected.length ||
    actualKeys.some((key, index) => key !== expected[index])
  ) {
    throw invalidState(`${label} has unexpected fields: ${actualKeys.join(', ')}.`);
  }
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw invalidState(message);
  return value;
}

function invalidState(message: string): DesktopShellStateError {
  return new DesktopShellStateError('desktop-shell-invalid-state', message);
}
