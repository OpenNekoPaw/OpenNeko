import type { HostDiagnostic } from './ports';

export const NEKO_APPLICATION_CONTRACT_VERSION = 1 as const;

export const NEKO_APPLICATION_IDS = ['neko-home', 'neko-tui', 'neko-vscode'] as const;

export type NekoApplicationId = (typeof NEKO_APPLICATION_IDS)[number];

export interface NekoApplicationIdentity {
  readonly schemaVersion: typeof NEKO_APPLICATION_CONTRACT_VERSION;
  readonly applicationId: NekoApplicationId;
  readonly instanceId: string;
  readonly version: string;
}

export type NekoApplicationDiagnosticCode =
  | 'invalid-application-contract'
  | 'unsupported-application-contract-version'
  | 'unknown-application-identity'
  | 'stale-application-instance'
  | 'missing-application-handoff-capability';

export interface NekoApplicationDiagnostic extends HostDiagnostic {
  readonly code: NekoApplicationDiagnosticCode;
}

export interface NekoApplicationHandoffTarget {
  readonly toolId: string;
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly resourceId?: string;
  readonly artifactId?: string;
  readonly taskId?: string;
  readonly editorId?: string;
}

export interface NekoApplicationHandoffRequest {
  readonly schemaVersion: typeof NEKO_APPLICATION_CONTRACT_VERSION;
  readonly requestId: string;
  readonly source: NekoApplicationIdentity;
  readonly target: NekoApplicationHandoffTarget;
}

export interface NekoApplicationHandoffResult {
  readonly accepted: true;
  readonly requestId: string;
  readonly targetInstanceId?: string;
}

export interface NekoApplicationHandoffPort {
  handoff(request: NekoApplicationHandoffRequest): Promise<NekoApplicationHandoffResult>;
}

export type NekoApplicationStorageCategory =
  | 'settings'
  | 'conversations'
  | 'project-registry'
  | 'credentials'
  | 'trust-state'
  | 'installed-packages'
  | 'generated-artifacts'
  | 'rebuildable-cache';

export const NEKO_APPLICATION_STORAGE_CATEGORIES: readonly NekoApplicationStorageCategory[] = [
  'settings',
  'conversations',
  'project-registry',
  'credentials',
  'trust-state',
  'installed-packages',
  'generated-artifacts',
  'rebuildable-cache',
] as const;

export type NekoApplicationStorageMigrationDisposition =
  'reuse' | 'migrate' | 'rebuild' | 'reject-with-diagnostic';

export interface NekoApplicationStorageMigrationEntry {
  readonly category: NekoApplicationStorageCategory;
  readonly owner: string;
  readonly disposition: NekoApplicationStorageMigrationDisposition;
  readonly sourceIdentity: string;
  readonly targetIdentity: string;
  readonly diagnosticCode?: string;
}

export interface NekoApplicationStorageMigrationPlan {
  readonly schemaVersion: typeof NEKO_APPLICATION_CONTRACT_VERSION;
  readonly sourceApplicationId: string;
  readonly targetApplicationId: NekoApplicationId;
  readonly entries: readonly NekoApplicationStorageMigrationEntry[];
}

export class NekoApplicationContractError extends Error {
  readonly diagnostic: NekoApplicationDiagnostic;

  constructor(diagnostic: NekoApplicationDiagnostic) {
    super(diagnostic.message);
    this.name = 'NekoApplicationContractError';
    this.diagnostic = diagnostic;
  }
}

export function parseNekoApplicationIdentity(value: unknown): NekoApplicationIdentity {
  const record = requireRecord(value, 'Application identity must be an object.');
  requireContractVersion(record['schemaVersion']);
  const applicationId = requireApplicationId(record['applicationId']);
  return {
    schemaVersion: NEKO_APPLICATION_CONTRACT_VERSION,
    applicationId,
    instanceId: requireNonEmptyString(record['instanceId'], 'Application instanceId is required.'),
    version: requireNonEmptyString(record['version'], 'Application version is required.'),
  };
}

export function parseNekoApplicationHandoffRequest(
  value: unknown,
  options: { readonly expectedSource?: NekoApplicationIdentity } = {},
): NekoApplicationHandoffRequest {
  const record = requireRecord(value, 'Application handoff request must be an object.');
  requireContractVersion(record['schemaVersion']);
  const source = parseNekoApplicationIdentity(record['source']);
  if (options.expectedSource && !sameApplicationInstance(source, options.expectedSource)) {
    throw contractError(
      'stale-application-instance',
      `Handoff source '${source.applicationId}/${source.instanceId}' does not match the active application instance.`,
      { expectedSource: options.expectedSource, receivedSource: source },
    );
  }
  const target = requireRecord(record['target'], 'Application handoff target must be an object.');
  return {
    schemaVersion: NEKO_APPLICATION_CONTRACT_VERSION,
    requestId: requireNonEmptyString(record['requestId'], 'Handoff requestId is required.'),
    source,
    target: {
      toolId: requireNonEmptyString(target['toolId'], 'Handoff target toolId is required.'),
      workspaceId: requireNonEmptyString(
        target['workspaceId'],
        'Handoff target workspaceId is required; active-workspace fallback is forbidden.',
      ),
      ...readOptionalIdentityFields(target),
    },
  };
}

export function requireNekoApplicationHandoffPort(
  port: NekoApplicationHandoffPort | undefined,
): NekoApplicationHandoffPort {
  if (!port) {
    throw contractError(
      'missing-application-handoff-capability',
      'The current host has not registered an application handoff capability.',
    );
  }
  return port;
}

export function validateNekoApplicationStorageMigrationPlan(
  plan: NekoApplicationStorageMigrationPlan,
): readonly NekoApplicationDiagnostic[] {
  const diagnostics: NekoApplicationDiagnostic[] = [];
  if (plan.schemaVersion !== NEKO_APPLICATION_CONTRACT_VERSION) {
    diagnostics.push(
      diagnostic(
        'unsupported-application-contract-version',
        `Unsupported application storage migration schema '${String(plan.schemaVersion)}'.`,
      ),
    );
    return diagnostics;
  }

  const counts = new Map<NekoApplicationStorageCategory, number>();
  for (const entry of plan.entries) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    if (entry.disposition === 'reject-with-diagnostic' && !entry.diagnosticCode) {
      diagnostics.push(
        diagnostic(
          'invalid-application-contract',
          `Storage category '${entry.category}' rejects migration without a diagnostic code.`,
        ),
      );
    }
  }
  for (const category of NEKO_APPLICATION_STORAGE_CATEGORIES) {
    const count = counts.get(category) ?? 0;
    if (count !== 1) {
      diagnostics.push(
        diagnostic(
          'invalid-application-contract',
          `Storage migration plan must contain exactly one '${category}' entry; received ${count}.`,
        ),
      );
    }
  }
  return diagnostics;
}

function sameApplicationInstance(
  left: NekoApplicationIdentity,
  right: NekoApplicationIdentity,
): boolean {
  return left.applicationId === right.applicationId && left.instanceId === right.instanceId;
}

function readOptionalIdentityFields(
  target: Readonly<Record<string, unknown>>,
): Partial<Omit<NekoApplicationHandoffTarget, 'toolId' | 'workspaceId'>> {
  const result: {
    projectId?: string;
    resourceId?: string;
    artifactId?: string;
    taskId?: string;
    editorId?: string;
  } = {};
  for (const key of ['projectId', 'resourceId', 'artifactId', 'taskId', 'editorId'] as const) {
    const value = target[key];
    if (value !== undefined)
      result[key] = requireNonEmptyString(value, `${key} must be non-empty.`);
  }
  return result;
}

function requireApplicationId(value: unknown): NekoApplicationId {
  switch (value) {
    case 'neko-home':
    case 'neko-tui':
    case 'neko-vscode':
      return value;
    default:
      throw contractError(
        'unknown-application-identity',
        `Unknown Neko application '${String(value)}'.`,
      );
  }
}

function requireContractVersion(value: unknown): void {
  if (value !== NEKO_APPLICATION_CONTRACT_VERSION) {
    throw contractError(
      'unsupported-application-contract-version',
      `Unsupported application contract version '${String(value)}'.`,
    );
  }
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (!isUnknownRecord(value)) {
    throw contractError('invalid-application-contract', message);
  }
  return value;
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw contractError('invalid-application-contract', message);
  }
  return value;
}

function contractError(
  code: NekoApplicationDiagnosticCode,
  message: string,
  metadata?: Readonly<Record<string, unknown>>,
): NekoApplicationContractError {
  return new NekoApplicationContractError(diagnostic(code, message, metadata));
}

function diagnostic(
  code: NekoApplicationDiagnosticCode,
  message: string,
  metadata?: Readonly<Record<string, unknown>>,
): NekoApplicationDiagnostic {
  return {
    code,
    severity: 'error',
    message,
    ...(metadata ? { metadata } : {}),
  };
}
