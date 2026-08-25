import {
  contentLocatorKey,
  isWorkspaceFileContentLocator,
  normalizeWorkspaceContentPath,
  validateContentLocator,
  type ContentLocator,
  type WorkspaceFileContentLocator,
} from '@neko/content-domain';
import { isPortablePathSegment } from '@neko/shared/path';

export type ProjectContentReferenceOwnerKind = 'canvas' | 'cut' | 'entity-representation';

export interface ProjectContentReferenceOwnerSnapshot {
  readonly ownerKind: ProjectContentReferenceOwnerKind;
  readonly ownerId: string;
  readonly sourceFingerprint: string;
  readonly references: readonly ContentLocator[];
}

export interface ProjectContentReferenceCoverage {
  readonly expectedOwnerKinds: readonly ProjectContentReferenceOwnerKind[];
  readonly coveredOwnerKinds: readonly ProjectContentReferenceOwnerKind[];
}

export interface WorkspaceMediaLibraryReference {
  readonly ownerKind: ProjectContentReferenceOwnerKind;
  readonly ownerId: string;
  readonly ownerFingerprint: string;
  readonly locator: WorkspaceFileContentLocator;
  readonly descendantPath: string;
}

export interface WorkspaceMediaLibraryRequirement {
  readonly libraryName: string;
  readonly references: readonly WorkspaceMediaLibraryReference[];
  readonly descendants: readonly string[];
}

export interface WorkspaceMediaLibraryRequirementSnapshot {
  readonly fingerprint: string;
  readonly coverage: 'complete' | 'incomplete';
  readonly missingOwnerKinds: readonly ProjectContentReferenceOwnerKind[];
  readonly requirements: readonly WorkspaceMediaLibraryRequirement[];
}

export type WorkspaceMediaLibraryLinkState =
  | 'available'
  | 'required-unlinked'
  | 'global-connection-missing'
  | 'target-unavailable'
  | 'content-incomplete'
  | 'entry-conflict'
  | 'unreferenced-linked';

export type WorkspaceMediaLibrarySyncDiagnosticCode =
  | 'coverage-incomplete'
  | 'global-connection-missing'
  | 'target-unavailable'
  | 'content-incomplete'
  | 'entry-conflict'
  | 'stale-recovery-plan'
  | 'recovery-candidate-missing'
  | 'recovery-candidate-incomplete'
  | 'recovery-cancelled'
  | 'snapshot-destination-conflict'
  | 'snapshot-insufficient-capacity'
  | 'snapshot-source-stale'
  | 'snapshot-content-unavailable'
  | 'snapshot-checkpoint-unavailable'
  | 'snapshot-cancelled'
  | 'snapshot-publish-conflict'
  | 'snapshot-rewrite-failed'
  | 'nested-link-escape';

export interface WorkspaceMediaLibrarySyncDiagnostic {
  readonly code: WorkspaceMediaLibrarySyncDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly missingCount?: number;
}

export interface WorkspaceMediaLibraryStatus {
  readonly libraryName: string;
  readonly state: WorkspaceMediaLibraryLinkState;
  readonly referenceCount: number;
  readonly missingCount: number;
  readonly operationFingerprint: string;
  readonly diagnostic?: WorkspaceMediaLibrarySyncDiagnostic;
}

export interface WorkspaceMediaLibraryRecoveryPlan {
  readonly planId: string;
  readonly workspaceId: string;
  readonly libraryName: string;
  readonly requirementFingerprint: string;
  readonly operationFingerprint: string;
  readonly candidate:
    | {
        readonly kind: 'global-alias';
        readonly name: string;
        readonly locationKind: 'local' | 'nas' | 'cloud';
      }
    | {
        readonly kind: 'directory-selection-required';
        readonly name: string;
      };
  readonly referencedCount: number;
  readonly validatedCount: number;
}

export type WorkspaceMediaLibraryPortabilityState =
  'linked-ready' | 'sync-requires-relink' | 'portable-snapshot-ready' | 'coverage-incomplete';

export interface WorkspaceMediaLibraryPortabilityProjection {
  readonly state: WorkspaceMediaLibraryPortabilityState;
  readonly requirementFingerprint: string;
  readonly libraries: readonly WorkspaceMediaLibraryStatus[];
}

export interface PortableMediaLibrarySnapshotPlan {
  readonly snapshotId: string;
  readonly workspaceId: string;
  readonly requirementFingerprint: string;
  readonly operationFingerprint: string;
  readonly entryCount: number;
  readonly totalByteLength: number;
  readonly libraries: readonly {
    readonly libraryName: string;
    readonly entryCount: number;
    readonly totalByteLength: number;
  }[];
}

export interface PortableMediaLibrarySnapshotProgress {
  readonly snapshotId: string;
  readonly workspaceId: string;
  readonly requirementFingerprint: string;
  readonly status: 'planned' | 'running' | 'completed' | 'failed' | 'cancelled';
  readonly completedEntryCount: number;
  readonly totalEntryCount: number;
  readonly completedByteLength: number;
  readonly totalByteLength: number;
  readonly diagnosticCode?: WorkspaceMediaLibrarySyncDiagnosticCode;
}

export interface PortableMediaLibrarySnapshotTaskPayload {
  readonly workspaceId: string;
  readonly snapshotId: string;
  readonly requirementFingerprint: string;
  readonly status: 'planned' | 'running' | 'completed' | 'failed' | 'cancelled';
  readonly completedEntryCount: number;
  readonly totalEntryCount: number;
  readonly diagnosticCode?: WorkspaceMediaLibrarySyncDiagnosticCode;
}

export interface PortableMediaLibrarySnapshotCheckpointPayload {
  readonly workspaceId: string;
  readonly snapshotId: string;
  readonly requirementFingerprint: string;
  readonly completedEntryKeys: readonly string[];
}

export function aggregateWorkspaceMediaLibraryRequirements(input: {
  readonly owners: readonly ProjectContentReferenceOwnerSnapshot[];
  readonly coverage: ProjectContentReferenceCoverage;
}): WorkspaceMediaLibraryRequirementSnapshot {
  const owners = [...input.owners].sort(compareOwnerSnapshots);
  const expectedOwnerKinds = uniqueSortedOwnerKinds(input.coverage.expectedOwnerKinds);
  const coveredOwnerKinds = new Set(input.coverage.coveredOwnerKinds);
  const missingOwnerKinds = expectedOwnerKinds.filter((kind) => !coveredOwnerKinds.has(kind));
  const requirements = new Map<string, WorkspaceMediaLibraryReference[]>();
  const fingerprintParts: string[] = [];

  for (const owner of owners) {
    requireOwnerSnapshot(owner);
    fingerprintParts.push(`${owner.ownerKind}:${owner.ownerId}:${owner.sourceFingerprint}`);
    const seen = new Set<string>();
    for (const locator of owner.references) {
      const reference = workspaceMediaLibraryReference(owner, locator);
      if (!reference) continue;
      const referenceKey = contentLocatorKey(reference.locator);
      if (seen.has(referenceKey)) continue;
      seen.add(referenceKey);
      const current = requirements.get(reference.libraryName) ?? [];
      current.push(reference);
      requirements.set(reference.libraryName, current);
    }
  }

  return {
    fingerprint: stableRequirementFingerprint(fingerprintParts),
    coverage: missingOwnerKinds.length === 0 ? 'complete' : 'incomplete',
    missingOwnerKinds,
    requirements: [...requirements.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'en-US'))
      .map(([libraryName, references]) => ({
        libraryName,
        references: references.sort(compareReferences),
        descendants: [...new Set(references.map((reference) => reference.descendantPath))].sort(
          (left, right) => left.localeCompare(right, 'en-US'),
        ),
      })),
  };
}

function stableRequirementFingerprint(parts: readonly string[]): string {
  if (parts.length === 0) return 'requirements:empty';
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  const value = parts.join('\0');
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ (code + index), 0x85ebca6b);
  }
  return `requirements:${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`;
}

export function parsePortableMediaLibrarySnapshotTaskPayload(
  value: unknown,
): PortableMediaLibrarySnapshotTaskPayload {
  const record = requireRecord(value, 'Portable snapshot task payload must be an object.');
  requireOnlyKeys(record, [
    'workspaceId',
    'snapshotId',
    'requirementFingerprint',
    'status',
    'completedEntryCount',
    'totalEntryCount',
    'diagnosticCode',
  ]);
  const status = record['status'];
  if (
    status !== 'planned' &&
    status !== 'running' &&
    status !== 'completed' &&
    status !== 'failed' &&
    status !== 'cancelled'
  ) {
    throw new Error('Portable snapshot task status is invalid.');
  }
  const completedEntryCount = requireNonNegativeInteger(
    record['completedEntryCount'],
    'Portable snapshot completed entry count is invalid.',
  );
  const totalEntryCount = requireNonNegativeInteger(
    record['totalEntryCount'],
    'Portable snapshot total entry count is invalid.',
  );
  if (completedEntryCount > totalEntryCount) {
    throw new Error('Portable snapshot completed entry count exceeds its total.');
  }
  const diagnosticCode =
    record['diagnosticCode'] === undefined
      ? undefined
      : requireDiagnosticCode(record['diagnosticCode']);
  return {
    workspaceId: requireOpaqueIdentity(record['workspaceId'], 'Workspace identity is required.'),
    snapshotId: requireOpaqueIdentity(record['snapshotId'], 'Snapshot identity is required.'),
    requirementFingerprint: requireOpaqueIdentity(
      record['requirementFingerprint'],
      'Requirement revision is required.',
    ),
    status,
    completedEntryCount,
    totalEntryCount,
    ...(diagnosticCode ? { diagnosticCode } : {}),
  };
}

export function parsePortableMediaLibrarySnapshotPlan(
  value: unknown,
): PortableMediaLibrarySnapshotPlan {
  const record = requireRecord(value, 'Portable snapshot plan must be an object.');
  requireOnlyKeys(record, [
    'snapshotId',
    'workspaceId',
    'requirementFingerprint',
    'operationFingerprint',
    'entryCount',
    'totalByteLength',
    'libraries',
  ]);
  if (!Array.isArray(record['libraries'])) {
    throw new Error('Portable snapshot plan libraries must be an array.');
  }
  const libraries = record['libraries'].map((value) => {
    const library = requireRecord(value, 'Portable snapshot plan library is invalid.');
    requireOnlyKeys(library, ['libraryName', 'entryCount', 'totalByteLength']);
    const libraryName = requireOpaqueIdentity(
      library['libraryName'],
      'Portable snapshot library name is required.',
    );
    if (!isPortablePathSegment(libraryName)) {
      throw new Error('Portable snapshot library name is invalid.');
    }
    return {
      libraryName,
      entryCount: requireNonNegativeInteger(
        library['entryCount'],
        'Portable snapshot library entry count is invalid.',
      ),
      totalByteLength: requireNonNegativeInteger(
        library['totalByteLength'],
        'Portable snapshot library byte length is invalid.',
      ),
    };
  });
  const entryCount = requireNonNegativeInteger(
    record['entryCount'],
    'Portable snapshot entry count is invalid.',
  );
  const totalByteLength = requireNonNegativeInteger(
    record['totalByteLength'],
    'Portable snapshot byte length is invalid.',
  );
  if (libraries.reduce((total, library) => total + library.entryCount, 0) !== entryCount) {
    throw new Error('Portable snapshot plan library entry counts do not match.');
  }
  if (
    libraries.reduce((total, library) => total + library.totalByteLength, 0) !== totalByteLength
  ) {
    throw new Error('Portable snapshot plan library byte lengths do not match.');
  }
  return {
    snapshotId: requireOpaqueIdentity(record['snapshotId'], 'Snapshot identity is required.'),
    workspaceId: requireOpaqueIdentity(record['workspaceId'], 'Workspace identity is required.'),
    requirementFingerprint: requireOpaqueIdentity(
      record['requirementFingerprint'],
      'Requirement revision is required.',
    ),
    operationFingerprint: requireOpaqueIdentity(
      record['operationFingerprint'],
      'Operation revision is required.',
    ),
    entryCount,
    totalByteLength,
    libraries,
  };
}

export function parsePortableMediaLibrarySnapshotProgress(
  value: unknown,
): PortableMediaLibrarySnapshotProgress {
  const record = requireRecord(value, 'Portable snapshot progress must be an object.');
  requireOnlyKeys(record, [
    'snapshotId',
    'workspaceId',
    'requirementFingerprint',
    'status',
    'completedEntryCount',
    'totalEntryCount',
    'completedByteLength',
    'totalByteLength',
    'diagnosticCode',
  ]);
  const task = parsePortableMediaLibrarySnapshotTaskPayload({
    workspaceId: record['workspaceId'],
    snapshotId: record['snapshotId'],
    requirementFingerprint: record['requirementFingerprint'],
    status: record['status'],
    completedEntryCount: record['completedEntryCount'],
    totalEntryCount: record['totalEntryCount'],
    ...(record['diagnosticCode'] === undefined ? {} : { diagnosticCode: record['diagnosticCode'] }),
  });
  const completedByteLength = requireNonNegativeInteger(
    record['completedByteLength'],
    'Portable snapshot completed byte length is invalid.',
  );
  const totalByteLength = requireNonNegativeInteger(
    record['totalByteLength'],
    'Portable snapshot total byte length is invalid.',
  );
  if (completedByteLength > totalByteLength) {
    throw new Error('Portable snapshot completed byte length exceeds its total.');
  }
  return {
    ...task,
    completedByteLength,
    totalByteLength,
  };
}

export function parsePortableMediaLibrarySnapshotCheckpointPayload(
  value: unknown,
): PortableMediaLibrarySnapshotCheckpointPayload {
  const record = requireRecord(value, 'Portable snapshot checkpoint must be an object.');
  requireOnlyKeys(record, [
    'workspaceId',
    'snapshotId',
    'requirementFingerprint',
    'completedEntryKeys',
  ]);
  if (!Array.isArray(record['completedEntryKeys'])) {
    throw new Error('Portable snapshot checkpoint entry keys must be an array.');
  }
  const completedEntryKeys = record['completedEntryKeys'].map((entry) => {
    const normalized = typeof entry === 'string' ? normalizeWorkspaceContentPath(entry) : undefined;
    if (!normalized || normalized !== entry) {
      throw new Error('Portable snapshot checkpoint entry key is invalid.');
    }
    return normalized;
  });
  if (new Set(completedEntryKeys).size !== completedEntryKeys.length) {
    throw new Error('Portable snapshot checkpoint entry keys must be unique.');
  }
  return {
    workspaceId: requireOpaqueIdentity(record['workspaceId'], 'Workspace identity is required.'),
    snapshotId: requireOpaqueIdentity(record['snapshotId'], 'Snapshot identity is required.'),
    requirementFingerprint: requireOpaqueIdentity(
      record['requirementFingerprint'],
      'Requirement revision is required.',
    ),
    completedEntryKeys,
  };
}

function workspaceMediaLibraryReference(
  owner: ProjectContentReferenceOwnerSnapshot,
  locator: ContentLocator,
): (WorkspaceMediaLibraryReference & { readonly libraryName: string }) | undefined {
  const validated = validateContentLocator(locator);
  if (!validated.ok) {
    throw new Error(`Project content owner '${owner.ownerId}' returned an invalid ContentLocator.`);
  }
  if (!isWorkspaceFileContentLocator(validated.locator) || validated.locator.selector) {
    return undefined;
  }
  const segments = validated.locator.file.path.split('/');
  if (segments[0] !== 'neko' || segments[1] !== 'assets' || segments.length < 4) return undefined;
  const libraryName = segments[2];
  const descendantPath = segments.slice(3).join('/');
  if (!libraryName || !descendantPath) return undefined;
  return {
    libraryName,
    ownerKind: owner.ownerKind,
    ownerId: owner.ownerId,
    ownerFingerprint: owner.sourceFingerprint,
    locator: validated.locator,
    descendantPath,
  };
}

function requireOwnerSnapshot(snapshot: ProjectContentReferenceOwnerSnapshot): void {
  requireOwnerKind(snapshot.ownerKind);
  const ownerId = normalizeWorkspaceContentPath(snapshot.ownerId);
  if (!ownerId || ownerId !== snapshot.ownerId) {
    throw new Error('Project content owner identity must be workspace-relative.');
  }
  requireOpaqueIdentity(
    snapshot.sourceFingerprint,
    'Project content owner source fingerprint is required.',
  );
  if (!Array.isArray(snapshot.references)) {
    throw new Error('Project content owner references must be an array.');
  }
}

function compareOwnerSnapshots(
  left: ProjectContentReferenceOwnerSnapshot,
  right: ProjectContentReferenceOwnerSnapshot,
): number {
  return (
    left.ownerKind.localeCompare(right.ownerKind, 'en-US') ||
    left.ownerId.localeCompare(right.ownerId, 'en-US')
  );
}

function compareReferences(
  left: WorkspaceMediaLibraryReference,
  right: WorkspaceMediaLibraryReference,
): number {
  return (
    left.descendantPath.localeCompare(right.descendantPath, 'en-US') ||
    left.ownerKind.localeCompare(right.ownerKind, 'en-US') ||
    left.ownerId.localeCompare(right.ownerId, 'en-US')
  );
}

function uniqueSortedOwnerKinds(
  values: readonly ProjectContentReferenceOwnerKind[],
): readonly ProjectContentReferenceOwnerKind[] {
  for (const value of values) requireOwnerKind(value);
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en-US'));
}

function requireOwnerKind(value: unknown): ProjectContentReferenceOwnerKind {
  if (value !== 'canvas' && value !== 'cut' && value !== 'entity-representation') {
    throw new Error('Project content reference owner kind is invalid.');
  }
  return value;
}

function requireDiagnosticCode(value: unknown): WorkspaceMediaLibrarySyncDiagnosticCode {
  if (
    value !== 'coverage-incomplete' &&
    value !== 'global-connection-missing' &&
    value !== 'target-unavailable' &&
    value !== 'content-incomplete' &&
    value !== 'entry-conflict' &&
    value !== 'stale-recovery-plan' &&
    value !== 'recovery-candidate-missing' &&
    value !== 'recovery-candidate-incomplete' &&
    value !== 'recovery-cancelled' &&
    value !== 'snapshot-destination-conflict' &&
    value !== 'snapshot-insufficient-capacity' &&
    value !== 'snapshot-source-stale' &&
    value !== 'snapshot-content-unavailable' &&
    value !== 'snapshot-checkpoint-unavailable' &&
    value !== 'snapshot-cancelled' &&
    value !== 'snapshot-publish-conflict' &&
    value !== 'snapshot-rewrite-failed' &&
    value !== 'nested-link-escape'
  ) {
    throw new Error('Workspace Media Library diagnostic code is invalid.');
  }
  return value;
}

function requireOpaqueIdentity(value: unknown, message: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\0') ||
    value.includes('/') ||
    value.includes('\\')
  ) {
    throw new Error(message);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(message);
  return value as number;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function requireOnlyKeys(record: Readonly<Record<string, unknown>>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error('Portable snapshot payload contains unsupported fields.');
  }
}
