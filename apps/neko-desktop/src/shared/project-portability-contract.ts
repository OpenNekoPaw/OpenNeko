import {
  parsePortableMediaLibrarySnapshotPlan,
  parsePortableMediaLibrarySnapshotProgress,
  parsePortableMediaLibrarySnapshotTaskPayload,
  type PortableMediaLibrarySnapshotPlan,
  type PortableMediaLibrarySnapshotProgress,
  type PortableMediaLibrarySnapshotTaskPayload,
  type WorkspaceMediaLibraryPortabilityProjection,
  type WorkspaceMediaLibraryStatus,
  type WorkspaceMediaLibrarySyncDiagnostic,
} from '@neko/shared';

export const DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION = 1 as const;

export const DESKTOP_PROJECT_PORTABILITY_CHANNELS = {
  inspect: 'openneko:project-portability:inspect',
  plan: 'openneko:project-portability:plan',
  resume: 'openneko:project-portability:resume',
  execute: 'openneko:project-portability:execute',
  cancel: 'openneko:project-portability:cancel',
  progressEvent: 'openneko:project-portability:progress:event',
} as const;

export interface DesktopProjectPortabilityIdentity {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly windowId: string;
  readonly endpointEpoch: string;
}

export interface DesktopProjectPortabilityRequest {
  readonly version: typeof DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION;
  readonly requestId: string;
  readonly identity: DesktopProjectPortabilityIdentity;
}

export interface DesktopProjectPortabilityInspectResult {
  readonly version: typeof DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION;
  readonly requestId: string;
  readonly identity: DesktopProjectPortabilityIdentity;
  readonly portability: WorkspaceMediaLibraryPortabilityProjection;
  readonly resumableSnapshot?: PortableMediaLibrarySnapshotTaskPayload;
}

export type DesktopProjectPortabilityPlanResult =
  | {
      readonly version: typeof DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION;
      readonly requestId: string;
      readonly identity: DesktopProjectPortabilityIdentity;
      readonly status: 'planned';
      readonly plan: PortableMediaLibrarySnapshotPlan;
    }
  | {
      readonly version: typeof DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION;
      readonly requestId: string;
      readonly identity: DesktopProjectPortabilityIdentity;
      readonly status: 'cancelled';
    };

export interface DesktopProjectPortabilityResumeRequest
  extends DesktopProjectPortabilityRequest {
  readonly snapshotId: string;
}

export interface DesktopProjectPortabilityExecuteRequest
  extends DesktopProjectPortabilityResumeRequest {
  readonly expectedOperationRevision: string;
}

export interface DesktopProjectPortabilityCancelResult {
  readonly version: typeof DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION;
  readonly requestId: string;
  readonly identity: DesktopProjectPortabilityIdentity;
  readonly snapshotId: string;
  readonly status: 'cancelled';
}

export interface DesktopProjectPortabilityExecuteResult {
  readonly version: typeof DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION;
  readonly requestId: string;
  readonly identity: DesktopProjectPortabilityIdentity;
  readonly snapshotId: string;
  readonly requirementRevision: string;
  readonly status: 'completed';
  readonly metadataDiagnostic?: 'snapshot-checkpoint-unavailable';
}

export interface DesktopProjectPortabilityProgressEvent {
  readonly version: typeof DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION;
  readonly sequence: number;
  readonly identity: DesktopProjectPortabilityIdentity;
  readonly progress: PortableMediaLibrarySnapshotProgress;
}

export interface OpenNekoDesktopProjectPortabilityBridge {
  readonly projectPortability: {
    inspect(
      request: DesktopProjectPortabilityRequest,
    ): Promise<DesktopProjectPortabilityInspectResult>;
    plan(request: DesktopProjectPortabilityRequest): Promise<DesktopProjectPortabilityPlanResult>;
    resume(
      request: DesktopProjectPortabilityResumeRequest,
    ): Promise<DesktopProjectPortabilityPlanResult>;
    execute(
      request: DesktopProjectPortabilityExecuteRequest,
    ): Promise<DesktopProjectPortabilityExecuteResult>;
    cancel(
      request: DesktopProjectPortabilityResumeRequest,
    ): Promise<DesktopProjectPortabilityCancelResult>;
    subscribe(listener: (event: DesktopProjectPortabilityProgressEvent) => void): () => void;
  };
}

export function createDesktopProjectPortabilityRequest(input: {
  readonly requestId: string;
  readonly identity: DesktopProjectPortabilityIdentity;
}): DesktopProjectPortabilityRequest {
  return parseDesktopProjectPortabilityRequest({
    version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
    ...input,
  });
}

export function createDesktopProjectPortabilityResumeRequest(input: {
  readonly requestId: string;
  readonly identity: DesktopProjectPortabilityIdentity;
  readonly snapshotId: string;
}): DesktopProjectPortabilityResumeRequest {
  return parseDesktopProjectPortabilityResumeRequest({
    version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
    ...input,
  });
}

export function createDesktopProjectPortabilityExecuteRequest(input: {
  readonly requestId: string;
  readonly identity: DesktopProjectPortabilityIdentity;
  readonly snapshotId: string;
  readonly expectedOperationRevision: string;
}): DesktopProjectPortabilityExecuteRequest {
  return parseDesktopProjectPortabilityExecuteRequest({
    version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
    ...input,
  });
}

export function parseDesktopProjectPortabilityRequest(
  value: unknown,
): DesktopProjectPortabilityRequest {
  const record = requireRecord(value, 'Project portability request must be an object.');
  requireOnlyKeys(record, ['version', 'requestId', 'identity']);
  requireVersion(record['version']);
  return {
    version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
    requestId: requireOpaque(record['requestId'], 'Project portability request identity is invalid.'),
    identity: parseDesktopProjectPortabilityIdentity(record['identity']),
  };
}

export function parseDesktopProjectPortabilityResumeRequest(
  value: unknown,
): DesktopProjectPortabilityResumeRequest {
  const record = requireRecord(value, 'Project portability resume request must be an object.');
  requireOnlyKeys(record, ['version', 'requestId', 'identity', 'snapshotId']);
  return {
    ...parseDesktopProjectPortabilityRequest({
      version: record['version'],
      requestId: record['requestId'],
      identity: record['identity'],
    }),
    snapshotId: requireOpaque(
      record['snapshotId'],
      'Project portability snapshot identity is invalid.',
    ),
  };
}

export function parseDesktopProjectPortabilityExecuteRequest(
  value: unknown,
): DesktopProjectPortabilityExecuteRequest {
  const record = requireRecord(value, 'Project portability execute request must be an object.');
  requireOnlyKeys(record, [
    'version',
    'requestId',
    'identity',
    'snapshotId',
    'expectedOperationRevision',
  ]);
  return {
    ...parseDesktopProjectPortabilityResumeRequest({
      version: record['version'],
      requestId: record['requestId'],
      identity: record['identity'],
      snapshotId: record['snapshotId'],
    }),
    expectedOperationRevision: requireOpaque(
      record['expectedOperationRevision'],
      'Project portability operation revision is invalid.',
    ),
  };
}

export function parseDesktopProjectPortabilityInspectResult(
  value: unknown,
): DesktopProjectPortabilityInspectResult {
  const record = requireRecord(value, 'Project portability inspection must be an object.');
  requireOnlyKeys(record, [
    'version',
    'requestId',
    'identity',
    'portability',
    'resumableSnapshot',
  ]);
  requireVersion(record['version']);
  return {
    version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
    requestId: requireOpaque(record['requestId'], 'Project portability request identity is invalid.'),
    identity: parseDesktopProjectPortabilityIdentity(record['identity']),
    portability: parsePortabilityProjection(record['portability']),
    ...(record['resumableSnapshot'] === undefined
      ? {}
      : {
          resumableSnapshot: parsePortableMediaLibrarySnapshotTaskPayload(
            record['resumableSnapshot'],
          ),
        }),
  };
}

export function parseDesktopProjectPortabilityPlanResult(
  value: unknown,
): DesktopProjectPortabilityPlanResult {
  const record = requireRecord(value, 'Project portability plan result must be an object.');
  requireVersion(record['version']);
  const status = record['status'];
  if (status === 'cancelled') {
    requireOnlyKeys(record, ['version', 'requestId', 'identity', 'status']);
    return {
      version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
      requestId: requireOpaque(
        record['requestId'],
        'Project portability request identity is invalid.',
      ),
      identity: parseDesktopProjectPortabilityIdentity(record['identity']),
      status,
    };
  }
  if (status !== 'planned') throw new Error('Project portability plan status is invalid.');
  requireOnlyKeys(record, ['version', 'requestId', 'identity', 'status', 'plan']);
  return {
    version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
    requestId: requireOpaque(record['requestId'], 'Project portability request identity is invalid.'),
    identity: parseDesktopProjectPortabilityIdentity(record['identity']),
    status,
    plan: parsePortableMediaLibrarySnapshotPlan(record['plan']),
  };
}

export function parseDesktopProjectPortabilityExecuteResult(
  value: unknown,
): DesktopProjectPortabilityExecuteResult {
  const record = requireRecord(value, 'Project portability execute result must be an object.');
  requireOnlyKeys(record, [
    'version',
    'requestId',
    'identity',
    'snapshotId',
    'requirementRevision',
    'status',
    'metadataDiagnostic',
  ]);
  requireVersion(record['version']);
  if (record['status'] !== 'completed') {
    throw new Error('Project portability execution status is invalid.');
  }
  if (
    record['metadataDiagnostic'] !== undefined &&
    record['metadataDiagnostic'] !== 'snapshot-checkpoint-unavailable'
  ) {
    throw new Error('Project portability metadata diagnostic is invalid.');
  }
  return {
    version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
    requestId: requireOpaque(record['requestId'], 'Project portability request identity is invalid.'),
    identity: parseDesktopProjectPortabilityIdentity(record['identity']),
    snapshotId: requireOpaque(
      record['snapshotId'],
      'Project portability snapshot identity is invalid.',
    ),
    requirementRevision: requireOpaque(
      record['requirementRevision'],
      'Project portability requirement revision is invalid.',
    ),
    status: 'completed',
    ...(record['metadataDiagnostic']
      ? { metadataDiagnostic: record['metadataDiagnostic'] }
      : {}),
  };
}

export function parseDesktopProjectPortabilityCancelResult(
  value: unknown,
): DesktopProjectPortabilityCancelResult {
  const record = requireRecord(value, 'Project portability cancel result must be an object.');
  requireOnlyKeys(record, ['version', 'requestId', 'identity', 'snapshotId', 'status']);
  requireVersion(record['version']);
  if (record['status'] !== 'cancelled') {
    throw new Error('Project portability cancellation status is invalid.');
  }
  return {
    version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
    requestId: requireOpaque(record['requestId'], 'Project portability request identity is invalid.'),
    identity: parseDesktopProjectPortabilityIdentity(record['identity']),
    snapshotId: requireOpaque(
      record['snapshotId'],
      'Project portability snapshot identity is invalid.',
    ),
    status: 'cancelled',
  };
}

export function parseDesktopProjectPortabilityProgressEvent(
  value: unknown,
): DesktopProjectPortabilityProgressEvent {
  const record = requireRecord(value, 'Project portability progress event must be an object.');
  requireOnlyKeys(record, ['version', 'sequence', 'identity', 'progress']);
  requireVersion(record['version']);
  return {
    version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
    sequence: requireInteger(record['sequence'], 'Project portability event sequence is invalid.'),
    identity: parseDesktopProjectPortabilityIdentity(record['identity']),
    progress: parsePortableMediaLibrarySnapshotProgress(record['progress']),
  };
}

export function isSameDesktopProjectPortabilityIdentity(
  left: DesktopProjectPortabilityIdentity,
  right: DesktopProjectPortabilityIdentity,
): boolean {
  return (
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.windowId === right.windowId &&
    left.endpointEpoch === right.endpointEpoch
  );
}

function parseDesktopProjectPortabilityIdentity(
  value: unknown,
): DesktopProjectPortabilityIdentity {
  const record = requireRecord(value, 'Project portability identity must be an object.');
  requireOnlyKeys(record, ['projectId', 'workspaceId', 'windowId', 'endpointEpoch']);
  return {
    projectId: requireOpaque(record['projectId'], 'Project identity is invalid.'),
    workspaceId: requireOpaque(record['workspaceId'], 'Workspace identity is invalid.'),
    windowId: requireOpaque(record['windowId'], 'Window identity is invalid.'),
    endpointEpoch: requireOpaque(record['endpointEpoch'], 'Endpoint epoch is invalid.'),
  };
}

function parsePortabilityProjection(value: unknown): WorkspaceMediaLibraryPortabilityProjection {
  const record = requireRecord(value, 'Project portability projection must be an object.');
  requireOnlyKeys(record, ['state', 'requirementRevision', 'libraries']);
  const state = record['state'];
  if (
    state !== 'linked-ready' &&
    state !== 'sync-requires-relink' &&
    state !== 'portable-snapshot-ready' &&
    state !== 'coverage-incomplete'
  ) {
    throw new Error('Project portability state is invalid.');
  }
  if (!Array.isArray(record['libraries'])) {
    throw new Error('Project portability libraries must be an array.');
  }
  return {
    state,
    requirementRevision: requireOpaque(
      record['requirementRevision'],
      'Project portability requirement revision is invalid.',
    ),
    libraries: record['libraries'].map(parseLibraryStatus),
  };
}

function parseLibraryStatus(value: unknown): WorkspaceMediaLibraryStatus {
  const record = requireRecord(value, 'Project portability library status must be an object.');
  requireOnlyKeys(record, [
    'libraryName',
    'state',
    'referenceCount',
    'missingCount',
    'operationRevision',
    'diagnostic',
  ]);
  const state = record['state'];
  if (
    state !== 'available' &&
    state !== 'required-unlinked' &&
    state !== 'global-connection-missing' &&
    state !== 'target-unavailable' &&
    state !== 'content-incomplete' &&
    state !== 'entry-conflict' &&
    state !== 'unreferenced-linked'
  ) {
    throw new Error('Project portability library state is invalid.');
  }
  return {
    libraryName: requireOpaque(record['libraryName'], 'Media Library name is invalid.'),
    state,
    referenceCount: requireInteger(
      record['referenceCount'],
      'Media Library reference count is invalid.',
    ),
    missingCount: requireInteger(
      record['missingCount'],
      'Media Library missing count is invalid.',
    ),
    operationRevision: requireOpaque(
      record['operationRevision'],
      'Media Library operation revision is invalid.',
    ),
    ...(record['diagnostic'] === undefined
      ? {}
      : { diagnostic: parseDiagnostic(record['diagnostic']) }),
  };
}

function parseDiagnostic(value: unknown): WorkspaceMediaLibrarySyncDiagnostic {
  const record = requireRecord(value, 'Project portability diagnostic must be an object.');
  requireOnlyKeys(record, ['code', 'severity', 'message', 'missingCount']);
  if (record['severity'] !== 'warning' && record['severity'] !== 'error') {
    throw new Error('Project portability diagnostic severity is invalid.');
  }
  const code = record['code'];
  const parsedProgress = parsePortableMediaLibrarySnapshotProgress({
    version: 1,
    snapshotId: 'diagnostic',
    workspaceId: 'diagnostic',
    requirementRevision: 'diagnostic',
    status: 'failed',
    completedEntryCount: 0,
    totalEntryCount: 0,
    completedByteLength: 0,
    totalByteLength: 0,
    diagnosticCode: code,
  });
  if (!parsedProgress.diagnosticCode) {
    throw new Error('Project portability diagnostic code is invalid.');
  }
  return {
    code: parsedProgress.diagnosticCode,
    severity: record['severity'],
    message: requireText(record['message'], 'Project portability diagnostic message is invalid.'),
    ...(record['missingCount'] === undefined
      ? {}
      : {
          missingCount: requireInteger(
            record['missingCount'],
            'Project portability missing count is invalid.',
          ),
        }),
  };
}

function requireVersion(value: unknown): void {
  if (value !== DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION) {
    throw new Error('Project portability contract version is unsupported.');
  }
}

function requireOpaque(value: unknown, message: string): string {
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

function requireText(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error(message);
  }
  return value;
}

function requireInteger(value: unknown, message: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(message);
  return value as number;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function requireOnlyKeys(
  record: Readonly<Record<string, unknown>>,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error('Project portability payload contains unsupported fields.');
  }
}
