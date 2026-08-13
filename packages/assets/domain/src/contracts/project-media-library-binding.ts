import { isPortablePathSegment } from '@neko/shared/path';

export const PROJECT_MEDIA_LIBRARY_BINDING_DIRECTORY = '.neko/media-libraries' as const;

export interface ProjectMediaLibraryBinding {
  readonly projectId: string;
  readonly libraryName: string;
  readonly connectionId: string;
  /** Concurrency precondition for explicit replace/remove operations. */
  readonly bindingFingerprint: string;
}

export type ProjectMediaLibraryAvailabilityState =
  | 'available'
  | 'required-unlinked'
  | 'connection-missing'
  | 'target-unavailable'
  | 'content-incomplete'
  | 'binding-invalid'
  | 'unreferenced-local-binding';

export type ProjectMediaLibraryDiagnosticCode = Exclude<
  ProjectMediaLibraryAvailabilityState,
  'available' | 'unreferenced-local-binding'
>;

export interface ProjectMediaLibraryDiagnostic {
  readonly code: ProjectMediaLibraryDiagnosticCode;
  readonly projectId: string;
  readonly libraryName: string;
  readonly message: string;
}

export interface ProjectMediaLibraryRequirement {
  readonly projectId: string;
  readonly libraryName: string;
  readonly requirementFingerprint: string;
  readonly referenceCount: number;
  readonly relativePaths: readonly string[];
}

export interface ProjectMediaLibraryAvailability {
  readonly projectId: string;
  readonly libraryName: string;
  readonly state: ProjectMediaLibraryAvailabilityState;
  readonly requiredRelativePaths: readonly string[];
  readonly diagnostic?: ProjectMediaLibraryDiagnostic;
}

export interface ProjectMediaLibraryRecoveryPlan {
  readonly projectId: string;
  readonly libraryName: string;
  readonly connectionId: string;
  readonly requirementFingerprint: string;
  readonly validatedRelativePaths: readonly string[];
  readonly expectedBindingFingerprint: string | null;
  readonly replacementBindingFingerprint: string;
}

export interface ConfirmedProjectMediaLibraryRecovery {
  readonly confirmed: true;
  readonly plan: ProjectMediaLibraryRecoveryPlan;
}

export function projectMediaLibraryBindingRelativePath(libraryName: string): string {
  requireLibraryName(libraryName);
  return `${PROJECT_MEDIA_LIBRARY_BINDING_DIRECTORY}/${libraryName}.json`;
}

export function parseProjectMediaLibraryBinding(value: unknown): ProjectMediaLibraryBinding {
  const record = requireRecord(value, 'Project Media Library binding must be an object.');
  requireOnlyKeys(record, ['projectId', 'libraryName', 'connectionId', 'bindingFingerprint']);
  return {
    projectId: requireProjectId(record['projectId']),
    libraryName: requireLibraryName(record['libraryName']),
    connectionId: requireConnectionId(record['connectionId']),
    bindingFingerprint: requireBindingFingerprint(record['bindingFingerprint']),
  };
}

export function parseProjectMediaLibraryBindingJson(json: string): ProjectMediaLibraryBinding {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new Error(`Project Media Library binding is not valid JSON: ${String(error)}`);
  }
  return parseProjectMediaLibraryBinding(value);
}

export function serializeProjectMediaLibraryBinding(binding: ProjectMediaLibraryBinding): string {
  return `${JSON.stringify(parseProjectMediaLibraryBinding(binding), null, 2)}\n`;
}

export function parseProjectMediaLibraryRequirement(
  value: unknown,
): ProjectMediaLibraryRequirement {
  const record = requireRecord(value, 'Project Media Library requirement must be an object.');
  requireOnlyKeys(record, [
    'projectId',
    'libraryName',
    'requirementFingerprint',
    'referenceCount',
    'relativePaths',
  ]);
  if (!Array.isArray(record['relativePaths'])) {
    throw new Error('Project Media Library required paths must be an array.');
  }
  const relativePaths = record['relativePaths'].map(requireRelativePath);
  if (new Set(relativePaths).size !== relativePaths.length) {
    throw new Error('Project Media Library required paths must be unique.');
  }
  return Object.freeze({
    projectId: requireProjectId(record['projectId']),
    libraryName: requireLibraryName(record['libraryName']),
    requirementFingerprint: requireBindingFingerprint(record['requirementFingerprint']),
    referenceCount: requireNonNegativeInteger(
      record['referenceCount'],
      'Project Media Library reference count must be a non-negative integer.',
    ),
    relativePaths: Object.freeze(
      [...relativePaths].sort((left, right) => left.localeCompare(right)),
    ),
  });
}

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(message);
  return value as number;
}

export function parseProjectMediaLibraryDiagnostic(value: unknown): ProjectMediaLibraryDiagnostic {
  const record = requireRecord(value, 'Project Media Library diagnostic must be an object.');
  requireOnlyKeys(record, ['code', 'projectId', 'libraryName', 'message']);
  return Object.freeze({
    code: requireDiagnosticCode(record['code']),
    projectId: requireProjectId(record['projectId']),
    libraryName: requireLibraryName(record['libraryName']),
    message: requireMessage(record['message']),
  });
}

export function parseProjectMediaLibraryAvailability(
  value: unknown,
): ProjectMediaLibraryAvailability {
  const record = requireRecord(value, 'Project Media Library availability must be an object.');
  requireOnlyKeys(record, [
    'projectId',
    'libraryName',
    'state',
    'requiredRelativePaths',
    'diagnostic',
  ]);
  const state = requireAvailabilityState(record['state']);
  if (!Array.isArray(record['requiredRelativePaths'])) {
    throw new Error('Project Media Library availability paths must be an array.');
  }
  const requiredRelativePaths = record['requiredRelativePaths'].map(requireRelativePath);
  const diagnostic =
    record['diagnostic'] === undefined
      ? undefined
      : parseProjectMediaLibraryDiagnostic(record['diagnostic']);
  const expectsDiagnostic = state !== 'available' && state !== 'unreferenced-local-binding';
  if (
    expectsDiagnostic !== (diagnostic !== undefined) ||
    (diagnostic && diagnostic.code !== state)
  ) {
    throw new Error('Project Media Library availability diagnostic does not match its state.');
  }
  const projectId = requireProjectId(record['projectId']);
  const libraryName = requireLibraryName(record['libraryName']);
  if (
    diagnostic &&
    (diagnostic.projectId !== projectId || diagnostic.libraryName !== libraryName)
  ) {
    throw new Error('Project Media Library availability diagnostic belongs to another record.');
  }
  return Object.freeze({
    projectId,
    libraryName,
    state,
    requiredRelativePaths: Object.freeze(requiredRelativePaths),
    ...(diagnostic ? { diagnostic } : {}),
  });
}

export function createProjectMediaLibraryRecoveryPlan(
  value: unknown,
): Readonly<ProjectMediaLibraryRecoveryPlan> {
  const record = requireRecord(value, 'Project Media Library recovery plan must be an object.');
  requireOnlyKeys(record, [
    'projectId',
    'libraryName',
    'connectionId',
    'requirementFingerprint',
    'validatedRelativePaths',
    'expectedBindingFingerprint',
    'replacementBindingFingerprint',
  ]);
  if (!Array.isArray(record['validatedRelativePaths'])) {
    throw new Error('Project Media Library recovery validated paths must be an array.');
  }
  const validatedRelativePaths = record['validatedRelativePaths'].map(requireRelativePath);
  const sortedValidatedRelativePaths = [...validatedRelativePaths].sort((left, right) =>
    left.localeCompare(right),
  );
  if (
    new Set(validatedRelativePaths).size !== validatedRelativePaths.length ||
    validatedRelativePaths.some((value, index) => value !== sortedValidatedRelativePaths[index])
  ) {
    throw new Error('Project Media Library recovery validated paths must be unique and sorted.');
  }
  const expected = record['expectedBindingFingerprint'];
  const plan: ProjectMediaLibraryRecoveryPlan = {
    projectId: requireProjectId(record['projectId']),
    libraryName: requireLibraryName(record['libraryName']),
    connectionId: requireConnectionId(record['connectionId']),
    requirementFingerprint: requireBindingFingerprint(record['requirementFingerprint']),
    validatedRelativePaths: Object.freeze(validatedRelativePaths),
    expectedBindingFingerprint: expected === null ? null : requireBindingFingerprint(expected),
    replacementBindingFingerprint: requireBindingFingerprint(
      record['replacementBindingFingerprint'],
    ),
  };
  return Object.freeze(plan);
}

export function confirmProjectMediaLibraryRecovery(
  plan: ProjectMediaLibraryRecoveryPlan,
): Readonly<ConfirmedProjectMediaLibraryRecovery> {
  return Object.freeze({ confirmed: true, plan: createProjectMediaLibraryRecoveryPlan(plan) });
}

export function parseConfirmedProjectMediaLibraryRecovery(
  value: unknown,
): Readonly<ConfirmedProjectMediaLibraryRecovery> {
  const record = requireRecord(
    value,
    'Project Media Library recovery confirmation must be an object.',
  );
  requireOnlyKeys(record, ['confirmed', 'plan']);
  if (record['confirmed'] !== true) {
    throw new Error('Project Media Library recovery must be explicitly confirmed.');
  }
  return Object.freeze({
    confirmed: true,
    plan: createProjectMediaLibraryRecoveryPlan(record['plan']),
  });
}

function requireProjectId(value: unknown): string {
  if (!isOpaqueIdentity(value))
    throw new Error('Project Media Library project identity is invalid.');
  return value;
}

function requireConnectionId(value: unknown): string {
  if (!isOpaqueIdentity(value) || value.length > 240) {
    throw new Error('Project Media Library connection identity is invalid.');
  }
  return value;
}

function requireBindingFingerprint(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[A-Za-z0-9_-]{16,128}$/.test(value)) {
    throw new Error('Project Media Library binding fingerprint is invalid.');
  }
  return value;
}

function requireRelativePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.normalize('NFC') ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.includes('${') ||
    value
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))
  ) {
    throw new Error('Project Media Library relative path is invalid.');
  }
  return value;
}

function requireAvailabilityState(value: unknown): ProjectMediaLibraryAvailabilityState {
  if (
    value !== 'available' &&
    value !== 'required-unlinked' &&
    value !== 'connection-missing' &&
    value !== 'target-unavailable' &&
    value !== 'content-incomplete' &&
    value !== 'binding-invalid' &&
    value !== 'unreferenced-local-binding'
  ) {
    throw new Error('Project Media Library availability state is invalid.');
  }
  return value;
}

function requireDiagnosticCode(value: unknown): ProjectMediaLibraryDiagnosticCode {
  const state = requireAvailabilityState(value);
  if (state === 'available' || state === 'unreferenced-local-binding') {
    throw new Error('Project Media Library diagnostic code is invalid.');
  }
  return state;
}

function requireMessage(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new Error('Project Media Library diagnostic message is invalid.');
  }
  return value;
}

function requireLibraryName(value: unknown): string {
  if (typeof value !== 'string' || !isPortablePathSegment(value)) {
    throw new Error('Project Media Library name must be one portable logical segment.');
  }
  return value;
}

function isOpaqueIdentity(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim() &&
    value === value.normalize('NFC') &&
    !value.includes('\0') &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('${') &&
    !/^[A-Za-z]:/u.test(value)
  );
}

function requireOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  const unsupported = Object.keys(record).find((key) => !allowed.includes(key));
  if (unsupported) {
    throw new Error(`Project Media Library record contains unsupported field '${unsupported}'.`);
  }
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return Object.fromEntries(Object.entries(value));
}
