import {
  parseProfessionalApplicationBinding,
  parseProfessionalApplicationHandoffIntent,
  parseProfessionalApplicationInspection,
  parseProfessionalApplicationProfile,
  parseProfessionalResourceSource,
  type ProfessionalApplicationBinding,
  type ProfessionalApplicationHandoffIntent,
  type ProfessionalApplicationHandoffReceipt,
  type ProfessionalApplicationInspection,
  type ProfessionalApplicationLaunchReceipt,
  type ProfessionalApplicationManagementProjection,
  type ProfessionalApplicationOperation,
  type ProfessionalApplicationProfile,
  type ProfessionalResourceActionProjection,
} from '@neko/professional-apps-contracts';
import {
  initializeLocalMetadataTables,
  LocalMetadataError,
  type LocalMetadataStore,
} from '@neko/local-metadata';

export { COMFYUI_PROFESSIONAL_APPLICATION_PROFILE } from './profiles/comfyui';

export interface ProfessionalApplicationBindingRepository {
  get(integrationId: string): Promise<ProfessionalApplicationBinding | undefined>;
  set(binding: ProfessionalApplicationBinding): Promise<void>;
}

export interface ProfessionalApplicationDiscoveryPort {
  inspect(input: {
    readonly profile: ProfessionalApplicationProfile;
    readonly binding?: ProfessionalApplicationBinding;
    readonly signal?: AbortSignal;
  }): Promise<unknown>;
}

export interface ProfessionalApplicationLaunchPort {
  launch(input: {
    readonly profile: ProfessionalApplicationProfile;
    readonly binding?: ProfessionalApplicationBinding;
    readonly operation: ProfessionalApplicationOperation;
    readonly signal?: AbortSignal;
  }): Promise<{ readonly targetIdentity: string }>;
  transfer(input: {
    readonly profile: ProfessionalApplicationProfile;
    readonly binding?: ProfessionalApplicationBinding;
    readonly operation: ProfessionalApplicationOperation;
    readonly authorizationId: string;
    readonly signal?: AbortSignal;
  }): Promise<{ readonly targetIdentity: string; readonly accepted: boolean }>;
}

export interface ProfessionalApplicationContentAuthorizationPort {
  authorize(input: {
    readonly handoff: ProfessionalApplicationHandoffIntent;
    readonly signal?: AbortSignal;
  }): Promise<{ readonly authorizationId: string }>;
}

export interface ProfessionalApplicationService {
  getProjection(
    windowId: string,
    signal?: AbortSignal,
  ): Promise<ProfessionalApplicationManagementProjection>;
  updateBinding(
    windowId: string,
    binding: unknown,
    signal?: AbortSignal,
  ): Promise<ProfessionalApplicationManagementProjection>;
  bindApplicationIdentity(
    windowId: string,
    integrationId: string,
    applicationIdentity: string,
    signal?: AbortSignal,
  ): Promise<ProfessionalApplicationManagementProjection>;
  launch(
    integrationId: string,
    signal?: AbortSignal,
  ): Promise<ProfessionalApplicationLaunchReceipt>;
  listResourceActions(
    source: unknown,
    signal?: AbortSignal,
  ): Promise<readonly ProfessionalResourceActionProjection[]>;
  handoff(intent: unknown, signal?: AbortSignal): Promise<ProfessionalApplicationHandoffReceipt>;
}

export class ProfessionalApplicationServiceError extends Error {
  constructor(
    readonly code:
      | 'professional-application-profile-unavailable'
      | 'professional-application-operation-unavailable'
      | 'professional-application-source-incompatible'
      | 'professional-application-target-unavailable'
      | 'professional-application-binding-rejected'
      | 'professional-application-identity-mismatch'
      | 'professional-application-transfer-rejected',
    message: string,
  ) {
    super(message);
    this.name = 'ProfessionalApplicationServiceError';
  }
}

export function createProfessionalApplicationService(options: {
  readonly profiles: readonly unknown[];
  readonly bindings: ProfessionalApplicationBindingRepository;
  readonly discovery: ProfessionalApplicationDiscoveryPort;
  readonly launcher: ProfessionalApplicationLaunchPort;
  readonly contentAuthorization: ProfessionalApplicationContentAuthorizationPort;
}): ProfessionalApplicationService {
  const profiles = options.profiles.map(parseProfessionalApplicationProfile);
  requireUnique(
    profiles.map((profile) => profile.id),
    'Professional application profile',
  );
  return new DefaultProfessionalApplicationService(
    new Map(profiles.map((profile) => [profile.id, profile])),
    options.bindings,
    options.discovery,
    options.launcher,
    options.contentAuthorization,
  );
}

class DefaultProfessionalApplicationService implements ProfessionalApplicationService {
  constructor(
    private readonly profiles: ReadonlyMap<string, ProfessionalApplicationProfile>,
    private readonly bindings: ProfessionalApplicationBindingRepository,
    private readonly discovery: ProfessionalApplicationDiscoveryPort,
    private readonly launcher: ProfessionalApplicationLaunchPort,
    private readonly contentAuthorization: ProfessionalApplicationContentAuthorizationPort,
  ) {}

  async getProjection(
    windowId: string,
    signal?: AbortSignal,
  ): Promise<ProfessionalApplicationManagementProjection> {
    requireIdentity(windowId, 'Professional application Window');
    const items = await Promise.all(
      [...this.profiles.values()].map(async (profile) => {
        let binding: ProfessionalApplicationBinding | undefined;
        try {
          binding = await this.bindings.get(profile.id);
        } catch (error) {
          return {
            profile,
            readiness: {
              integrationId: profile.id,
              state: 'unavailable' as const,
              availableOperationIds: [],
              diagnostics: [
                {
                  code: 'binding-invalid' as const,
                  message: error instanceof Error ? error.message : String(error),
                },
              ],
            },
          };
        }
        const readiness = await this.inspectFailLocal(profile, binding, signal);
        return { profile, ...(binding ? { binding } : {}), readiness };
      }),
    );
    return {
      identity: { windowId },
      items: items.sort((left, right) => left.profile.name.localeCompare(right.profile.name)),
    };
  }

  async updateBinding(
    windowId: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<ProfessionalApplicationManagementProjection> {
    requireIdentity(windowId, 'Professional application Window');
    const binding = parseProfessionalApplicationBinding(input);
    const profile = this.requireProfile(binding.integrationId);
    assertBindingAllowed(profile, binding);
    const existing = await this.bindings.get(binding.integrationId);
    if (!sameApplicationLocator(existing?.applicationLocator, binding.applicationLocator)) {
      throw new ProfessionalApplicationServiceError(
        'professional-application-binding-rejected',
        'Application location can only be changed through the native application selector.',
      );
    }
    await this.bindings.set(binding);
    return this.getProjection(windowId, signal);
  }

  async bindApplicationIdentity(
    windowId: string,
    integrationId: string,
    applicationIdentity: string,
    signal?: AbortSignal,
  ): Promise<ProfessionalApplicationManagementProjection> {
    requireIdentity(windowId, 'Professional application Window');
    const profile = this.requireProfile(integrationId);
    if (!profile.configurable.applicationLocator) {
      throw new ProfessionalApplicationServiceError(
        'professional-application-operation-unavailable',
        `Professional application '${profile.id}' does not allow an application locator.`,
      );
    }
    const identity = requireIdentity(
      applicationIdentity,
      'Professional application selected identity',
    );
    if (!profile.applicationIdentities.some((candidate) => candidate.value === identity)) {
      throw new ProfessionalApplicationServiceError(
        'professional-application-identity-mismatch',
        `Selected application identity '${identity}' does not match '${profile.id}'.`,
      );
    }
    const existing = await this.bindings.get(profile.id);
    const binding = parseProfessionalApplicationBinding({
      integrationId: profile.id,
      ...(existing?.endpoint ? { endpoint: existing.endpoint } : {}),
      ...(existing?.defaultWorkflowId ? { defaultWorkflowId: existing.defaultWorkflowId } : {}),
      applicationLocator: { kind: 'application-identity', identity },
      launchPreference: existing?.launchPreference ?? 'reuse-qualified',
    });
    assertBindingAllowed(profile, binding);
    await this.bindings.set(binding);
    return this.getProjection(windowId, signal);
  }

  async launch(
    integrationId: string,
    signal?: AbortSignal,
  ): Promise<ProfessionalApplicationLaunchReceipt> {
    const profile = this.requireProfile(integrationId);
    const binding = await this.bindings.get(profile.id);
    const readiness = await this.inspect(profile, binding, signal);
    const operation = requireAvailableOperation(profile, readiness, 'launch');
    const launched = await this.launcher.launch({ profile, binding, operation, signal });
    return {
      integrationId: profile.id,
      operationId: operation.id,
      status: 'launched',
      targetIdentity: requireIdentity(
        launched.targetIdentity,
        'Professional application launch target',
      ),
    };
  }

  async listResourceActions(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<readonly ProfessionalResourceActionProjection[]> {
    const source = parseProfessionalResourceSource(input);
    const actions: ProfessionalResourceActionProjection[] = [];
    for (const profile of this.profiles.values()) {
      let binding: ProfessionalApplicationBinding | undefined;
      try {
        binding = await this.bindings.get(profile.id);
      } catch {
        continue;
      }
      const readiness = await this.inspectFailLocal(profile, binding, signal);
      if (readiness.state !== 'ready') continue;
      const available = new Set(readiness.availableOperationIds);
      for (const operation of profile.operations) {
        if (
          operation.kind === 'resource-handoff' &&
          available.has(operation.id) &&
          operation.inputMimeTypes.some((pattern) => mimeMatches(pattern, source.mimeType))
        ) {
          actions.push({
            integrationId: profile.id,
            operationId: operation.id,
            label: operation.label,
            source,
          });
        }
      }
    }
    return Object.freeze(actions);
  }

  async handoff(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<ProfessionalApplicationHandoffReceipt> {
    const handoff = parseProfessionalApplicationHandoffIntent(input);
    const profile = this.requireProfile(handoff.integrationId);
    const binding = await this.bindings.get(profile.id);
    const readiness = await this.inspect(profile, binding, signal);
    const operation = profile.operations.find(
      (candidate) => candidate.id === handoff.operationId && candidate.kind === 'resource-handoff',
    );
    if (!operation || !readiness.availableOperationIds.includes(operation.id)) {
      throw new ProfessionalApplicationServiceError(
        'professional-application-operation-unavailable',
        `Professional application operation '${handoff.operationId}' is unavailable.`,
      );
    }
    if (
      !operation.inputMimeTypes.some((pattern) => mimeMatches(pattern, handoff.source.mimeType))
    ) {
      throw new ProfessionalApplicationServiceError(
        'professional-application-source-incompatible',
        `Professional application '${profile.id}' does not accept '${handoff.source.mimeType}'.`,
      );
    }
    const authorized = await this.contentAuthorization.authorize({ handoff, signal });
    const transfer = await this.launcher.transfer({
      profile,
      binding,
      operation,
      authorizationId: requireIdentity(
        authorized.authorizationId,
        'Professional application content authorization',
      ),
      signal,
    });
    if (!transfer.accepted) {
      throw new ProfessionalApplicationServiceError(
        'professional-application-transfer-rejected',
        `Professional application '${profile.id}' rejected handoff '${handoff.handoffId}'.`,
      );
    }
    return {
      handoffId: handoff.handoffId,
      integrationId: profile.id,
      operationId: operation.id,
      status: 'transferred',
      targetIdentity: requireIdentity(
        transfer.targetIdentity,
        'Professional application handoff target',
      ),
    };
  }

  private requireProfile(integrationId: string): ProfessionalApplicationProfile {
    const profile = this.profiles.get(
      requireIdentity(integrationId, 'Professional application integration'),
    );
    if (!profile) {
      throw new ProfessionalApplicationServiceError(
        'professional-application-profile-unavailable',
        `Professional application profile '${integrationId}' is unavailable.`,
      );
    }
    return profile;
  }

  private async inspect(
    profile: ProfessionalApplicationProfile,
    binding: ProfessionalApplicationBinding | undefined,
    signal?: AbortSignal,
  ): Promise<ProfessionalApplicationInspection> {
    const inspection = parseProfessionalApplicationInspection(
      await this.discovery.inspect({ profile, binding, signal }),
    );
    if (inspection.integrationId !== profile.id) {
      throw new ProfessionalApplicationServiceError(
        'professional-application-target-unavailable',
        `Professional application probe '${inspection.integrationId}' does not match '${profile.id}'.`,
      );
    }
    const qualified = new Set(profile.operations.map((operation) => operation.id));
    for (const operationId of inspection.availableOperationIds) {
      if (!qualified.has(operationId)) {
        throw new ProfessionalApplicationServiceError(
          'professional-application-operation-unavailable',
          `Professional application probe returned unqualified operation '${operationId}'.`,
        );
      }
    }
    return inspection;
  }

  private async inspectFailLocal(
    profile: ProfessionalApplicationProfile,
    binding: ProfessionalApplicationBinding | undefined,
    signal?: AbortSignal,
  ): Promise<ProfessionalApplicationInspection> {
    try {
      return await this.inspect(profile, binding, signal);
    } catch (error) {
      return {
        integrationId: profile.id,
        state: 'unavailable',
        availableOperationIds: [],
        diagnostics: [
          {
            code: 'profile-probe-failed',
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }
}

export function createInMemoryProfessionalApplicationBindingRepository(
  initial: readonly ProfessionalApplicationBinding[] = [],
): ProfessionalApplicationBindingRepository {
  const values = new Map(
    initial.map((binding) => {
      const parsed = parseProfessionalApplicationBinding(binding);
      return [parsed.integrationId, parsed] as const;
    }),
  );
  return {
    async get(integrationId) {
      return values.get(integrationId);
    },
    async set(binding) {
      const parsed = parseProfessionalApplicationBinding(binding);
      values.set(parsed.integrationId, parsed);
    },
  };
}

export async function initializeProfessionalApplicationBindingTables(
  store: LocalMetadataStore,
): Promise<void> {
  await initializeLocalMetadataTables(store, {
    ownership: 'state',
    operation: 'initialize-professional-application-bindings',
    statements: [
      `CREATE TABLE IF NOT EXISTS professional_application_binding (
        integration_id TEXT PRIMARY KEY,
        binding_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT`,
    ],
  });
}

export function createPersistentProfessionalApplicationBindingRepository(options: {
  readonly store: LocalMetadataStore;
  readonly now?: () => string;
}): ProfessionalApplicationBindingRepository {
  const now = options.now ?? (() => new Date().toISOString());
  return {
    get(integrationId) {
      requireIdentity(integrationId, 'Professional application integration');
      return options.store.transaction(
        {
          mode: 'read',
          ownership: 'state',
          operation: 'read-professional-application-binding',
        },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT binding_json
               FROM professional_application_binding
              WHERE integration_id = ?`,
            [integrationId],
          );
          const row = rows[0];
          if (!row) return undefined;
          const serialized = row['binding_json'];
          if (typeof serialized !== 'string') {
            throw persistenceError('Professional application binding JSON column is invalid.');
          }
          let decoded: unknown;
          try {
            decoded = JSON.parse(serialized);
          } catch (error) {
            throw persistenceError('Professional application binding JSON is corrupt.', error);
          }
          const binding = parseProfessionalApplicationBinding(decoded);
          if (binding.integrationId !== integrationId) {
            throw persistenceError(
              `Professional application binding '${binding.integrationId}' does not match row '${integrationId}'.`,
            );
          }
          return binding;
        },
      );
    },
    async set(input) {
      const binding = parseProfessionalApplicationBinding(input);
      const serialized = JSON.stringify(binding);
      await options.store.transaction(
        {
          mode: 'state-write',
          ownership: 'state',
          operation: 'write-professional-application-binding',
        },
        async ({ sql }) => {
          await sql.run(
            `INSERT INTO professional_application_binding(
               integration_id, binding_json, updated_at
             ) VALUES (?, ?, ?)
             ON CONFLICT(integration_id) DO UPDATE SET
               binding_json = excluded.binding_json,
               updated_at = excluded.updated_at`,
            [binding.integrationId, serialized, now()],
          );
        },
      );
    },
  };
}

function assertBindingAllowed(
  profile: ProfessionalApplicationProfile,
  binding: ProfessionalApplicationBinding,
): void {
  const applicationLocator = binding.applicationLocator;
  if (applicationLocator && !profile.configurable.applicationLocator) {
    throw new ProfessionalApplicationServiceError(
      'professional-application-operation-unavailable',
      `Professional application '${profile.id}' does not allow an application locator.`,
    );
  }
  if (
    applicationLocator?.kind === 'application-identity' &&
    !profile.applicationIdentities.some(
      (identity) => identity.value === applicationLocator.identity,
    )
  ) {
    throw new ProfessionalApplicationServiceError(
      'professional-application-identity-mismatch',
      `Application identity '${applicationLocator.identity}' does not match '${profile.id}'.`,
    );
  }
  if (binding.endpoint && !profile.configurable.endpoint) {
    throw new ProfessionalApplicationServiceError(
      'professional-application-operation-unavailable',
      `Professional application '${profile.id}' does not allow an endpoint.`,
    );
  }
  if (binding.defaultWorkflowId && !profile.configurable.defaultWorkflow) {
    throw new ProfessionalApplicationServiceError(
      'professional-application-operation-unavailable',
      `Professional application '${profile.id}' does not allow a default workflow.`,
    );
  }
}

function sameApplicationLocator(
  left: ProfessionalApplicationBinding['applicationLocator'],
  right: ProfessionalApplicationBinding['applicationLocator'],
): boolean {
  if (!left || !right) return left === right;
  if (left.kind !== right.kind) return false;
  if (left.kind === 'application-identity' && right.kind === 'application-identity') {
    return left.identity === right.identity;
  }
  if (left.kind === 'opaque-bookmark' && right.kind === 'opaque-bookmark') {
    return left.bookmarkId === right.bookmarkId;
  }
  return (
    left.kind === 'variable-path' && right.kind === 'variable-path' && left.path === right.path
  );
}

function requireAvailableOperation(
  profile: ProfessionalApplicationProfile,
  readiness: ProfessionalApplicationInspection,
  kind: ProfessionalApplicationOperation['kind'],
): ProfessionalApplicationOperation {
  const operation = profile.operations.find(
    (candidate) =>
      candidate.kind === kind && readiness.availableOperationIds.includes(candidate.id),
  );
  if (!operation || readiness.state !== 'ready') {
    throw new ProfessionalApplicationServiceError(
      'professional-application-operation-unavailable',
      `Professional application '${profile.id}' operation '${kind}' is unavailable.`,
    );
  }
  return operation;
}

function mimeMatches(pattern: string, mimeType: string): boolean {
  if (pattern === mimeType) return true;
  const slash = pattern.indexOf('/');
  return pattern.endsWith('/*') && mimeType.startsWith(`${pattern.slice(0, slash)}/`);
}

function requireIdentity(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requireUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} entries must be unique.`);
}

function persistenceError(message: string, cause?: unknown): LocalMetadataError {
  return new LocalMetadataError({
    code: 'metadata-transaction-failed',
    operation: 'professional-application-binding-persistence',
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}
