import type {
  AgentCapabilityTrustLevel,
  ContentLocator,
  ProcessorOutputLocator,
  ProcessorOutputOwnership,
  ResourceRef,
} from '@neko/shared';
import type { AgentCapabilitySource } from './capability';

export const EXTERNAL_PROCESSOR_SCHEMA = 'neko.externalProcessor';
export const EXTERNAL_PROCESSOR_SCHEMA_VERSION = 2;

export const EXTERNAL_PROCESSOR_ROOT_ALIASES = [
  'workspace',
  'mediaLibrary',
  'extensionPrivateResources',
] as const;

export type ExternalProcessorRootAlias = (typeof EXTERNAL_PROCESSOR_ROOT_ALIASES)[number];

export const EXTERNAL_PROCESSOR_SOURCE_SCOPES = [
  'builtin',
  'project',
  'personal',
  'extension',
] as const;

export type ExternalProcessorSourceScope = (typeof EXTERNAL_PROCESSOR_SOURCE_SCOPES)[number];

export const EXTERNAL_PROCESSOR_REGISTRY_CHANGE_KINDS = [
  'registered',
  'updated',
  'unregistered',
  'enabled',
  'disabled',
  'diagnostics-changed',
] as const;

export type ExternalProcessorRegistryChangeKind =
  (typeof EXTERNAL_PROCESSOR_REGISTRY_CHANGE_KINDS)[number];

export type ExternalProcessorOutputOwnership = Exclude<ProcessorOutputOwnership, 'promoted'>;

export type ExternalProcessorParamType = 'string' | 'number' | 'boolean' | 'enum';

export type ExternalProcessorDiagnosticSeverity = 'error' | 'warning' | 'info';

export type ExternalProcessorDiagnosticCode =
  | 'invalid-manifest'
  | 'unknown-schema'
  | 'unknown-schema-version'
  | 'invalid-processor-kind'
  | 'missing-required-field'
  | 'invalid-field-type'
  | 'invalid-root-alias'
  | 'illegal-output-ownership'
  | 'undeclared-template-reference'
  | 'invalid-template-reference'
  | 'unsupported-env-request'
  | 'non-portable-output'
  | 'disabled-processor'
  | 'untrusted-processor'
  | 'unauthorized-path'
  | 'invalid-cwd'
  | 'blocked-env-key'
  | 'unknown-env-key'
  | 'network-policy-unavailable'
  | 'missing-executable'
  | 'execution-failed'
  | 'execution-timeout'
  | 'missing-output';

export interface ExternalProcessorDiagnostic {
  readonly code: ExternalProcessorDiagnosticCode;
  readonly severity: ExternalProcessorDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ExternalProcessorEntry {
  readonly executable: string;
  readonly args: readonly string[];
}

export interface ExternalProcessorInputDeclaration {
  readonly accepts: readonly string[];
  readonly required?: boolean;
}

export interface ExternalProcessorOutputDeclaration {
  readonly produces: readonly string[];
  readonly ownership: ExternalProcessorOutputOwnership;
  readonly pathHint?: string;
}

export interface ExternalProcessorParamDeclaration {
  readonly type: ExternalProcessorParamType;
  readonly required?: boolean;
  readonly allowed?: readonly (string | number | boolean)[];
  readonly default?: string | number | boolean;
}

export interface ExternalProcessorPolicy {
  readonly requiresApproval: boolean;
  readonly allowNetwork: boolean;
  readonly allowedInputRoots: readonly ExternalProcessorRootAlias[];
  readonly allowedOutputOwnerships: readonly ExternalProcessorOutputOwnership[];
  readonly timeoutMs?: number;
  readonly cwdRoot?: ExternalProcessorRootAlias;
}

export interface ExternalProcessorEnvProfile {
  readonly inherits?: readonly string[];
  readonly configured?: readonly string[];
  readonly runtime?: readonly string[];
  readonly denySecrets?: boolean;
}

export interface ExternalProcessorManifest {
  readonly schema: typeof EXTERNAL_PROCESSOR_SCHEMA;
  readonly schemaVersion: typeof EXTERNAL_PROCESSOR_SCHEMA_VERSION;
  readonly id: string;
  readonly kind: 'external-processor';
  readonly displayName: string;
  readonly version: string;
  readonly entry: ExternalProcessorEntry;
  readonly inputs: Readonly<Record<string, ExternalProcessorInputDeclaration>>;
  readonly outputs: Readonly<Record<string, ExternalProcessorOutputDeclaration>>;
  readonly params?: Readonly<Record<string, ExternalProcessorParamDeclaration>>;
  readonly policy: ExternalProcessorPolicy;
  readonly envProfile?: ExternalProcessorEnvProfile;
}

export interface ExternalProcessorSource {
  readonly sourceScope: ExternalProcessorSourceScope;
  readonly agentCapabilitySource: AgentCapabilitySource;
  readonly sourceId: string;
  readonly locationRef?: string;
  readonly packageId?: string;
  readonly trustLevel?: AgentCapabilityTrustLevel;
}

export interface ExternalProcessorRegistration {
  readonly id: string;
  readonly registrationId: string;
  readonly version: string;
  readonly manifest: ExternalProcessorManifest;
  readonly sourceScope: ExternalProcessorSourceScope;
  readonly agentCapabilitySource: AgentCapabilitySource;
  readonly trustLevel: AgentCapabilityTrustLevel;
  readonly enabled: boolean;
  readonly revision: number;
  readonly locationRef?: string;
  readonly packageId?: string;
  readonly diagnostics: readonly ExternalProcessorDiagnostic[];
}

export interface ExternalProcessorRegistryChange {
  readonly revision: number;
  readonly kind: ExternalProcessorRegistryChangeKind;
  readonly registrationId: string;
  readonly reason?: string;
}

export interface ExternalProcessorSelector {
  readonly id?: string;
  readonly registrationId?: string;
}

export interface ExternalProcessorCatalog {
  readonly revision: number;
  readonly processors: readonly ExternalProcessorRegistration[];
  readonly diagnostics: readonly ExternalProcessorDiagnostic[];
}

export interface ExternalProcessorRegistryContext {
  readonly allowedTrustLevels?: readonly AgentCapabilityTrustLevel[];
  readonly includeDisabled?: boolean;
}

export type ExternalProcessorInvocationInputBinding =
  | {
      readonly slot: string;
      readonly locator: ContentLocator;
    }
  | {
      readonly slot: string;
      readonly output: ProcessorOutputLocator;
    };

export interface ExternalProcessorInvocationOutputBinding {
  readonly slot: string;
  readonly ownership: ExternalProcessorOutputOwnership;
  readonly pathHint?: string;
}

export interface ExternalProcessorRunIdentity {
  readonly processorRunId: string;
  readonly stageId: string;
  readonly attempt: number;
  readonly parentProcessorRunId?: string;
  readonly parentResourceRef?: ResourceRef;
}

export interface ExternalProcessorInvocation {
  readonly processorId: string;
  readonly registrationId: string;
  readonly registrationRevision: number;
  readonly run: ExternalProcessorRunIdentity;
  readonly inputs: readonly ExternalProcessorInvocationInputBinding[];
  readonly outputs: readonly ExternalProcessorInvocationOutputBinding[];
  readonly params?: Readonly<Record<string, string | number | boolean>>;
}

export interface ExternalProcessorOutput {
  readonly slot: string;
  readonly output: ProcessorOutputLocator;
  readonly ownership: ExternalProcessorOutputOwnership;
  readonly sizeBytes?: number;
  readonly mimeType?: string;
}

export interface ExternalProcessorResult {
  readonly status: 'succeeded' | 'failed' | 'cancelled';
  readonly processorId: string;
  readonly registrationId: string;
  readonly registrationRevision: number;
  readonly run: ExternalProcessorRunIdentity;
  readonly outputs: readonly ExternalProcessorOutput[];
  readonly diagnostics: readonly ExternalProcessorDiagnostic[];
  readonly exitCode?: number;
}

export interface ExternalProcessorManifestValidationResult {
  readonly manifest?: ExternalProcessorManifest;
  readonly diagnostics: readonly ExternalProcessorDiagnostic[];
}

export interface ExternalProcessorManifestValidationOptions {
  readonly allowSecretEnv?: boolean;
}

export interface ExternalProcessorProjectManifestFile {
  readonly path: string;
  readonly contents: string;
}

export interface ExternalProcessorPersonalRegistryEntry {
  readonly id: string;
  readonly manifestPath: string;
  readonly contents: string;
  readonly enabled?: boolean;
}

export interface ExternalProcessorPersonalRegistry {
  readonly version: 1;
  readonly entries: readonly ExternalProcessorPersonalRegistryEntry[];
}

export interface ExternalProcessorExtensionContribution {
  readonly extensionId: string;
  readonly contributionId?: string;
  readonly trustLevel?: AgentCapabilityTrustLevel;
  readonly manifest: ExternalProcessorManifest;
}

export interface ExternalProcessorDiscoveryResult {
  readonly registrations: readonly ExternalProcessorRegistration[];
  readonly diagnostics: readonly ExternalProcessorDiagnostic[];
}

export interface ExternalProcessorRegistry {
  upsert(
    source: ExternalProcessorSource,
    manifest: ExternalProcessorManifest,
    options?: ExternalProcessorRegistryUpsertOptions,
  ): ExternalProcessorRegistration;
  unregister(selector: ExternalProcessorSelector, reason: string): ExternalProcessorRegistryChange;
  setEnabled(
    selector: ExternalProcessorSelector,
    enabled: boolean,
    reason: string,
  ): ExternalProcessorRegistryChange;
  list(context?: ExternalProcessorRegistryContext): ExternalProcessorCatalog;
  resolve(
    id: string,
    context?: ExternalProcessorRegistryContext,
  ): ExternalProcessorRegistration | ExternalProcessorDiagnostic;
  onDidChange(
    listener: ExternalProcessorRegistryChangeListener,
  ): ExternalProcessorRegistrySubscription;
}

export interface ExternalProcessorRegistryUpsertOptions {
  readonly enabled?: boolean;
  readonly diagnostics?: readonly ExternalProcessorDiagnostic[];
}

export type ExternalProcessorRegistryChangeListener = (
  event: ExternalProcessorRegistryChange,
) => void;

export interface ExternalProcessorRegistrySubscription {
  dispose(): void;
}

type TemplateNamespace = 'input' | 'output' | 'params';

const TEMPLATE_PATTERN = /\$\{([^}]+)\}/g;
const SECRET_ENV_PATTERNS = [
  /(^|_)TOKEN$/i,
  /(^|_)SECRET$/i,
  /(^|_)PASSWORD$/i,
  /(^|_)CREDENTIAL(S)?$/i,
  /(^|_)COOKIE$/i,
  /^AWS_/i,
  /^GITHUB_TOKEN$/i,
  /^NPM_TOKEN$/i,
  /^SSH_AUTH_SOCK$/i,
];

export function validateExternalProcessorManifest(
  value: unknown,
  options: ExternalProcessorManifestValidationOptions = {},
): ExternalProcessorManifestValidationResult {
  const diagnostics: ExternalProcessorDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      diagnostics: [
        diagnostic(
          'invalid-manifest',
          'error',
          'External processor manifest must be a JSON object.',
        ),
      ],
    };
  }

  const schema = readString(value, 'schema', diagnostics);
  const schemaVersion = value['schemaVersion'];
  const kind = readString(value, 'kind', diagnostics);
  const id = readString(value, 'id', diagnostics);
  const displayName = readString(value, 'displayName', diagnostics);
  const version = readString(value, 'version', diagnostics);

  if (schema !== undefined && schema !== EXTERNAL_PROCESSOR_SCHEMA) {
    diagnostics.push(
      diagnostic('unknown-schema', 'error', `Unknown processor schema: ${schema}`, 'schema'),
    );
  }
  if (schemaVersion !== EXTERNAL_PROCESSOR_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic(
        'unknown-schema-version',
        'error',
        'External processor manifest schemaVersion must be 1.',
        'schemaVersion',
      ),
    );
  }
  if (kind !== undefined && kind !== 'external-processor') {
    diagnostics.push(
      diagnostic(
        'invalid-processor-kind',
        'error',
        `External processor kind must be "external-processor".`,
        'kind',
      ),
    );
  }

  const entry = readEntry(value['entry'], diagnostics);
  const inputs = readInputs(value['inputs'], diagnostics);
  const outputs = readOutputs(value['outputs'], diagnostics);
  const params = readParams(value['params'], diagnostics);
  const policy = readPolicy(value['policy'], diagnostics);
  const envProfile = readEnvProfile(value['envProfile'], diagnostics, options);

  if (entry) {
    validateTemplateReferences(entry.args, inputs, outputs, params, diagnostics);
  }
  if (outputs && policy) {
    validateOutputOwnerships(outputs, policy.allowedOutputOwnerships, diagnostics);
  }

  if (diagnostics.some((item) => item.severity === 'error')) {
    return { diagnostics };
  }

  return {
    manifest: {
      schema: EXTERNAL_PROCESSOR_SCHEMA,
      schemaVersion: EXTERNAL_PROCESSOR_SCHEMA_VERSION,
      id: id!,
      kind: 'external-processor',
      displayName: displayName!,
      version: version!,
      entry: entry!,
      inputs: inputs!,
      outputs: outputs!,
      ...(params ? { params } : {}),
      policy: policy!,
      ...(envProfile ? { envProfile } : {}),
    },
    diagnostics,
  };
}

export function createExternalProcessorRegistry(): ExternalProcessorRegistry {
  return new DefaultExternalProcessorRegistry();
}

export function registerBuiltinExternalProcessors(
  registry: ExternalProcessorRegistry,
  manifests: readonly ExternalProcessorManifest[],
): ExternalProcessorDiscoveryResult {
  const registrations = manifests.map((manifest) =>
    registry.upsert(
      {
        sourceScope: 'builtin',
        agentCapabilitySource: 'builtin',
        sourceId: 'builtin',
        trustLevel: 'core',
      },
      manifest,
    ),
  );
  return { registrations, diagnostics: [] };
}

export function registerProjectExternalProcessorManifests(input: {
  readonly registry: ExternalProcessorRegistry;
  readonly workspaceSourceId: string;
  readonly files: readonly ExternalProcessorProjectManifestFile[];
}): ExternalProcessorDiscoveryResult {
  const registrations: ExternalProcessorRegistration[] = [];
  const diagnostics: ExternalProcessorDiagnostic[] = [];
  for (const file of input.files) {
    const parsed = parseExternalProcessorManifestJson(file.contents, file.path);
    if (!parsed.value) {
      diagnostics.push(...parsed.diagnostics);
      continue;
    }
    const result = validateExternalProcessorManifest(parsed.value);
    if (!result.manifest) {
      diagnostics.push(...addLocationToDiagnostics(result.diagnostics, file.path));
      continue;
    }
    registrations.push(
      input.registry.upsert(
        {
          sourceScope: 'project',
          agentCapabilitySource: 'local',
          sourceId: input.workspaceSourceId,
          locationRef: file.path,
        },
        result.manifest,
      ),
    );
  }
  return { registrations, diagnostics };
}

export function registerPersonalExternalProcessorManifests(input: {
  readonly registry: ExternalProcessorRegistry;
  readonly personalSourceId: string;
  readonly entries: readonly ExternalProcessorPersonalRegistryEntry[];
}): ExternalProcessorDiscoveryResult {
  const registrations: ExternalProcessorRegistration[] = [];
  const diagnostics: ExternalProcessorDiagnostic[] = [];
  for (const entry of input.entries) {
    const parsed = parseExternalProcessorManifestJson(entry.contents, entry.manifestPath);
    if (!parsed.value) {
      diagnostics.push(...parsed.diagnostics);
      continue;
    }
    const result = validateExternalProcessorManifest(parsed.value);
    if (!result.manifest) {
      diagnostics.push(...addLocationToDiagnostics(result.diagnostics, entry.manifestPath));
      continue;
    }
    registrations.push(
      input.registry.upsert(
        {
          sourceScope: 'personal',
          agentCapabilitySource: 'local',
          sourceId: input.personalSourceId,
          locationRef: entry.manifestPath,
        },
        result.manifest,
        { enabled: entry.enabled ?? false },
      ),
    );
  }
  return { registrations, diagnostics };
}

export function registerExtensionExternalProcessorContributions(input: {
  readonly registry: ExternalProcessorRegistry;
  readonly contributions: readonly ExternalProcessorExtensionContribution[];
}): ExternalProcessorDiscoveryResult {
  const registrations: ExternalProcessorRegistration[] = [];
  const diagnostics: ExternalProcessorDiagnostic[] = [];
  for (const contribution of input.contributions) {
    const contributionDiagnostics: ExternalProcessorDiagnostic[] = [];
    const trustLevel =
      contribution.trustLevel === 'core' ? 'community' : (contribution.trustLevel ?? 'community');
    if (contribution.trustLevel === 'core') {
      contributionDiagnostics.push(
        diagnostic(
          'untrusted-processor',
          'warning',
          `Extension processor "${contribution.extensionId}" cannot self-declare core trust.`,
          undefined,
          { extensionId: contribution.extensionId },
        ),
      );
    }
    registrations.push(
      input.registry.upsert(
        {
          sourceScope: 'extension',
          agentCapabilitySource: 'plugin',
          sourceId: contribution.extensionId,
          trustLevel,
        },
        contribution.manifest,
        {
          diagnostics: contributionDiagnostics,
        },
      ),
    );
    diagnostics.push(...contributionDiagnostics);
  }
  return { registrations, diagnostics };
}

export function parseExternalProcessorManifestJson(
  contents: string,
  locationRef?: string,
): { readonly value?: unknown; readonly diagnostics: readonly ExternalProcessorDiagnostic[] } {
  try {
    return { value: JSON.parse(contents), diagnostics: [] };
  } catch (error) {
    return {
      diagnostics: [
        diagnostic(
          'invalid-manifest',
          'error',
          'External processor manifest must be valid JSON.',
          undefined,
          {
            ...(locationRef ? { locationRef } : {}),
            error: error instanceof Error ? error.message : String(error),
          },
        ),
      ],
    };
  }
}

export function isExternalProcessorRootAlias(value: string): value is ExternalProcessorRootAlias {
  return (EXTERNAL_PROCESSOR_ROOT_ALIASES as readonly string[]).includes(value);
}

export function isExternalProcessorSourceScope(
  value: string,
): value is ExternalProcessorSourceScope {
  return (EXTERNAL_PROCESSOR_SOURCE_SCOPES as readonly string[]).includes(value);
}

export function matchesExternalProcessorSecretEnvPattern(key: string): boolean {
  return SECRET_ENV_PATTERNS.some((pattern) => pattern.test(key));
}

function readEntry(
  value: unknown,
  diagnostics: ExternalProcessorDiagnostic[],
): ExternalProcessorEntry | undefined {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('missing-required-field', 'error', 'entry must be an object.', 'entry'),
    );
    return undefined;
  }
  const executable = readString(value, 'executable', diagnostics, 'entry.executable');
  const args = readStringArray(value['args'], diagnostics, 'entry.args');
  if (!executable || !args) return undefined;
  return { executable, args };
}

class DefaultExternalProcessorRegistry implements ExternalProcessorRegistry {
  private readonly registrations = new Map<string, ExternalProcessorRegistration>();
  private readonly listeners = new Set<ExternalProcessorRegistryChangeListener>();
  private revision = 0;

  upsert(
    source: ExternalProcessorSource,
    manifest: ExternalProcessorManifest,
    options: ExternalProcessorRegistryUpsertOptions = {},
  ): ExternalProcessorRegistration {
    const registrationId = createExternalProcessorRegistrationId(source, manifest);
    const existing = this.registrations.get(registrationId);
    const nextRevision = this.nextRevision();
    const registration: ExternalProcessorRegistration = {
      id: manifest.id,
      registrationId,
      version: manifest.version,
      manifest,
      sourceScope: source.sourceScope,
      agentCapabilitySource: source.agentCapabilitySource,
      trustLevel: source.trustLevel ?? defaultExternalProcessorTrustLevel(source),
      enabled: options.enabled ?? existing?.enabled ?? true,
      revision: nextRevision,
      ...(source.locationRef ? { locationRef: source.locationRef } : {}),
      ...(source.packageId ? { packageId: source.packageId } : {}),
      diagnostics: options.diagnostics ?? existing?.diagnostics ?? [],
    };
    this.registrations.set(registrationId, registration);
    this.emit({
      revision: nextRevision,
      kind: existing ? 'updated' : 'registered',
      registrationId,
    });
    return registration;
  }

  unregister(selector: ExternalProcessorSelector, reason: string): ExternalProcessorRegistryChange {
    const registration = this.findRegistration(selector);
    const registrationId = registration?.registrationId ?? selector.registrationId ?? selector.id;
    if (!registrationId) {
      throw new Error('ExternalProcessorRegistry.unregister requires id or registrationId.');
    }
    if (registration) {
      this.registrations.delete(registration.registrationId);
    }
    const change = {
      revision: this.nextRevision(),
      kind: 'unregistered' as const,
      registrationId,
      reason,
    };
    this.emit(change);
    return change;
  }

  setEnabled(
    selector: ExternalProcessorSelector,
    enabled: boolean,
    reason: string,
  ): ExternalProcessorRegistryChange {
    const registration = this.findRegistration(selector);
    if (!registration) {
      throw new Error('ExternalProcessorRegistry.setEnabled could not resolve registration.');
    }
    const nextRevision = this.nextRevision();
    const next: ExternalProcessorRegistration = {
      ...registration,
      enabled,
      revision: nextRevision,
      diagnostics: enabled
        ? registration.diagnostics
        : [...registration.diagnostics, diagnostic('disabled-processor', 'warning', reason)],
    };
    this.registrations.set(registration.registrationId, next);
    const change = {
      revision: nextRevision,
      kind: enabled ? ('enabled' as const) : ('disabled' as const),
      registrationId: registration.registrationId,
      reason,
    };
    this.emit(change);
    return change;
  }

  list(context: ExternalProcessorRegistryContext = {}): ExternalProcessorCatalog {
    const trust = context.allowedTrustLevels ? new Set(context.allowedTrustLevels) : undefined;
    const processors = Array.from(this.registrations.values()).filter((registration) => {
      if (!context.includeDisabled && !registration.enabled) return false;
      if (trust && !trust.has(registration.trustLevel)) return false;
      return true;
    });
    return {
      revision: this.revision,
      processors,
      diagnostics: processors.flatMap((registration) => registration.diagnostics),
    };
  }

  resolve(
    id: string,
    context: ExternalProcessorRegistryContext = {},
  ): ExternalProcessorRegistration | ExternalProcessorDiagnostic {
    const matches = Array.from(this.registrations.values()).filter(
      (registration) => registration.id === id || registration.registrationId === id,
    );
    const visible = matches.find((registration) => {
      if (!context.includeDisabled && !registration.enabled) return false;
      if (
        context.allowedTrustLevels &&
        !context.allowedTrustLevels.includes(registration.trustLevel)
      ) {
        return false;
      }
      return true;
    });
    if (visible) return visible;

    const disabled = matches.find((registration) => !registration.enabled);
    if (disabled) {
      return diagnostic(
        'disabled-processor',
        'error',
        `Processor "${id}" is disabled.`,
        undefined,
        { id },
      );
    }
    const untrusted = matches.find(
      (registration) =>
        context.allowedTrustLevels && !context.allowedTrustLevels.includes(registration.trustLevel),
    );
    if (untrusted) {
      return diagnostic(
        'untrusted-processor',
        'error',
        `Processor "${id}" is blocked by trust policy.`,
        undefined,
        { id, trustLevel: untrusted.trustLevel },
      );
    }
    return diagnostic(
      'disabled-processor',
      'error',
      `Processor "${id}" is not registered.`,
      undefined,
      {
        id,
      },
    );
  }

  onDidChange(
    listener: ExternalProcessorRegistryChangeListener,
  ): ExternalProcessorRegistrySubscription {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  private findRegistration(
    selector: ExternalProcessorSelector,
  ): ExternalProcessorRegistration | undefined {
    if (selector.registrationId) return this.registrations.get(selector.registrationId);
    if (!selector.id) return undefined;
    return Array.from(this.registrations.values()).find(
      (registration) => registration.id === selector.id,
    );
  }

  private nextRevision(): number {
    this.revision += 1;
    return this.revision;
  }

  private emit(change: ExternalProcessorRegistryChange): void {
    for (const listener of Array.from(this.listeners)) {
      listener(change);
    }
  }
}

function createExternalProcessorRegistrationId(
  source: ExternalProcessorSource,
  manifest: ExternalProcessorManifest,
): string {
  return `${source.sourceScope}:${source.sourceId}:${manifest.id}`;
}

function defaultExternalProcessorTrustLevel(
  source: ExternalProcessorSource,
): AgentCapabilityTrustLevel {
  return source.sourceScope === 'builtin' ? 'core' : 'untrusted';
}

function readInputs(
  value: unknown,
  diagnostics: ExternalProcessorDiagnostic[],
): Readonly<Record<string, ExternalProcessorInputDeclaration>> | undefined {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('missing-required-field', 'error', 'inputs must be an object.', 'inputs'),
    );
    return undefined;
  }
  const inputs: Record<string, ExternalProcessorInputDeclaration> = {};
  for (const [key, declaration] of Object.entries(value)) {
    if (!isRecord(declaration)) {
      diagnostics.push(
        diagnostic(
          'invalid-field-type',
          'error',
          `Input "${key}" must be an object.`,
          `inputs.${key}`,
        ),
      );
      continue;
    }
    const accepts = readStringArray(declaration['accepts'], diagnostics, `inputs.${key}.accepts`);
    if (!accepts) continue;
    inputs[key] = {
      accepts,
      ...(typeof declaration['required'] === 'boolean'
        ? { required: declaration['required'] }
        : {}),
    };
  }
  return inputs;
}

function readOutputs(
  value: unknown,
  diagnostics: ExternalProcessorDiagnostic[],
): Readonly<Record<string, ExternalProcessorOutputDeclaration>> | undefined {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('missing-required-field', 'error', 'outputs must be an object.', 'outputs'),
    );
    return undefined;
  }
  const outputs: Record<string, ExternalProcessorOutputDeclaration> = {};
  for (const [key, declaration] of Object.entries(value)) {
    if (!isRecord(declaration)) {
      diagnostics.push(
        diagnostic(
          'invalid-field-type',
          'error',
          `Output "${key}" must be an object.`,
          `outputs.${key}`,
        ),
      );
      continue;
    }
    const produces = readStringArray(
      declaration['produces'],
      diagnostics,
      `outputs.${key}.produces`,
    );
    const ownership = readOutputOwnership(
      declaration['ownership'],
      diagnostics,
      `outputs.${key}.ownership`,
    );
    if (!produces || !ownership) continue;
    outputs[key] = {
      produces,
      ownership,
      ...(typeof declaration['pathHint'] === 'string' ? { pathHint: declaration['pathHint'] } : {}),
    };
  }
  return outputs;
}

function readParams(
  value: unknown,
  diagnostics: ExternalProcessorDiagnostic[],
): Readonly<Record<string, ExternalProcessorParamDeclaration>> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('invalid-field-type', 'error', 'params must be an object.', 'params'),
    );
    return undefined;
  }
  const params: Record<string, ExternalProcessorParamDeclaration> = {};
  for (const [key, declaration] of Object.entries(value)) {
    if (!isRecord(declaration)) {
      diagnostics.push(
        diagnostic(
          'invalid-field-type',
          'error',
          `Param "${key}" must be an object.`,
          `params.${key}`,
        ),
      );
      continue;
    }
    const type = declaration['type'];
    if (!isParamType(type)) {
      diagnostics.push(
        diagnostic(
          'invalid-field-type',
          'error',
          `Param "${key}" has invalid type.`,
          `params.${key}.type`,
        ),
      );
      continue;
    }
    const allowed = readOptionalScalarArray(
      declaration['allowed'],
      diagnostics,
      `params.${key}.allowed`,
    );
    params[key] = {
      type,
      ...(typeof declaration['required'] === 'boolean'
        ? { required: declaration['required'] }
        : {}),
      ...(allowed ? { allowed } : {}),
      ...(isScalar(declaration['default']) ? { default: declaration['default'] } : {}),
    };
  }
  return params;
}

function readPolicy(
  value: unknown,
  diagnostics: ExternalProcessorDiagnostic[],
): ExternalProcessorPolicy | undefined {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('missing-required-field', 'error', 'policy must be an object.', 'policy'),
    );
    return undefined;
  }
  const requiresApproval = readBoolean(value, 'requiresApproval', diagnostics);
  const allowNetwork = readBoolean(value, 'allowNetwork', diagnostics);
  const allowedInputRoots = readRootAliasArray(
    value['allowedInputRoots'],
    diagnostics,
    'policy.allowedInputRoots',
  );
  const allowedOutputOwnerships = readOutputOwnershipArray(
    value['allowedOutputOwnerships'],
    diagnostics,
    'policy.allowedOutputOwnerships',
  );
  if (
    requiresApproval === undefined ||
    allowNetwork === undefined ||
    !allowedInputRoots ||
    !allowedOutputOwnerships
  ) {
    return undefined;
  }
  return {
    requiresApproval,
    allowNetwork,
    allowedInputRoots,
    allowedOutputOwnerships,
    ...(typeof value['timeoutMs'] === 'number' ? { timeoutMs: value['timeoutMs'] } : {}),
    ...(typeof value['cwdRoot'] === 'string' && isExternalProcessorRootAlias(value['cwdRoot'])
      ? { cwdRoot: value['cwdRoot'] }
      : {}),
  };
}

function readEnvProfile(
  value: unknown,
  diagnostics: ExternalProcessorDiagnostic[],
  options: ExternalProcessorManifestValidationOptions,
): ExternalProcessorEnvProfile | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('invalid-field-type', 'error', 'envProfile must be an object.', 'envProfile'),
    );
    return undefined;
  }
  const inherits = readOptionalStringArray(value['inherits'], diagnostics, 'envProfile.inherits');
  const configured = readOptionalStringArray(
    value['configured'],
    diagnostics,
    'envProfile.configured',
  );
  const runtime = readOptionalStringArray(value['runtime'], diagnostics, 'envProfile.runtime');
  const denySecrets = value['denySecrets'];
  if (denySecrets !== undefined && typeof denySecrets !== 'boolean') {
    diagnostics.push(
      diagnostic(
        'invalid-field-type',
        'error',
        'envProfile.denySecrets must be a boolean.',
        'envProfile.denySecrets',
      ),
    );
  }

  const effectiveDenySecrets = denySecrets !== false || !options.allowSecretEnv;
  if (denySecrets === false && !options.allowSecretEnv) {
    diagnostics.push(
      diagnostic(
        'unsupported-env-request',
        'error',
        'Non-core processor manifests cannot disable Host secret env policy.',
        'envProfile.denySecrets',
      ),
    );
  }

  if (effectiveDenySecrets) {
    for (const key of inherits ?? []) {
      if (matchesExternalProcessorSecretEnvPattern(key)) {
        diagnostics.push(
          diagnostic(
            'unsupported-env-request',
            'error',
            `Env key "${key}" matches Host baseline secret denylist.`,
            'envProfile.inherits',
            { key },
          ),
        );
      }
    }
  }

  return {
    ...(inherits ? { inherits } : {}),
    ...(configured ? { configured } : {}),
    ...(runtime ? { runtime } : {}),
    ...(typeof denySecrets === 'boolean' ? { denySecrets } : {}),
  };
}

function validateOutputOwnerships(
  outputs: Readonly<Record<string, ExternalProcessorOutputDeclaration>>,
  allowedOutputOwnerships: readonly ExternalProcessorOutputOwnership[],
  diagnostics: ExternalProcessorDiagnostic[],
): void {
  const allowed = new Set(allowedOutputOwnerships);
  for (const [key, output] of Object.entries(outputs)) {
    if (!allowed.has(output.ownership)) {
      diagnostics.push(
        diagnostic(
          'illegal-output-ownership',
          'error',
          `Output "${key}" uses ownership "${output.ownership}" not declared in policy.allowedOutputOwnerships.`,
          `outputs.${key}.ownership`,
        ),
      );
    }
  }
}

function readOutputOwnership(
  value: unknown,
  diagnostics: ExternalProcessorDiagnostic[],
  path: string,
): ExternalProcessorOutputOwnership | undefined {
  if (value === 'intermediate' || value === 'debug' || value === 'candidate') return value;
  diagnostics.push(
    diagnostic(
      'illegal-output-ownership',
      'error',
      `${path} must be intermediate, debug, or candidate.`,
      path,
    ),
  );
  return undefined;
}

function readOutputOwnershipArray(
  value: unknown,
  diagnostics: ExternalProcessorDiagnostic[],
  path: string,
): readonly ExternalProcessorOutputOwnership[] | undefined {
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic('invalid-field-type', 'error', `${path} must be an array.`, path));
    return undefined;
  }
  const ownerships: ExternalProcessorOutputOwnership[] = [];
  for (const [index, item] of value.entries()) {
    const ownership = readOutputOwnership(item, diagnostics, `${path}.${index}`);
    if (ownership) ownerships.push(ownership);
  }
  return ownerships;
}

function validateTemplateReferences(
  args: readonly string[],
  inputs: Readonly<Record<string, ExternalProcessorInputDeclaration>> | undefined,
  outputs: Readonly<Record<string, ExternalProcessorOutputDeclaration>> | undefined,
  params: Readonly<Record<string, ExternalProcessorParamDeclaration>> | undefined,
  diagnostics: ExternalProcessorDiagnostic[],
): void {
  const declared: Record<TemplateNamespace, ReadonlySet<string>> = {
    input: new Set(Object.keys(inputs ?? {})),
    output: new Set(Object.keys(outputs ?? {})),
    params: new Set(Object.keys(params ?? {})),
  };

  for (const [index, arg] of args.entries()) {
    for (const match of arg.matchAll(TEMPLATE_PATTERN)) {
      const reference = match[1] ?? '';
      const [namespace, name, extra] = reference.split('.');
      if (!isTemplateNamespace(namespace) || !name || extra !== undefined) {
        diagnostics.push(
          diagnostic(
            'invalid-template-reference',
            'error',
            `Invalid template reference "\${${reference}}".`,
            `entry.args.${index}`,
          ),
        );
        continue;
      }
      if (!declared[namespace].has(name)) {
        diagnostics.push(
          diagnostic(
            'undeclared-template-reference',
            'error',
            `Template reference "\${${reference}}" points to an undeclared ${namespace}.`,
            `entry.args.${index}`,
          ),
        );
      }
    }
  }
}

function readString(
  value: Record<string, unknown>,
  key: string,
  diagnostics: ExternalProcessorDiagnostic[],
  path = key,
): string | undefined {
  const raw = value[key];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    diagnostics.push(
      diagnostic('missing-required-field', 'error', `${path} must be a non-empty string.`, path),
    );
    return undefined;
  }
  return raw;
}

function readBoolean(
  value: Record<string, unknown>,
  key: string,
  diagnostics: ExternalProcessorDiagnostic[],
): boolean | undefined {
  const raw = value[key];
  if (typeof raw !== 'boolean') {
    diagnostics.push(
      diagnostic('missing-required-field', 'error', `${key} must be a boolean.`, key),
    );
    return undefined;
  }
  return raw;
}

function readStringArray(
  value: unknown,
  diagnostics: ExternalProcessorDiagnostic[],
  path: string,
): readonly string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    diagnostics.push(
      diagnostic('invalid-field-type', 'error', `${path} must be an array of strings.`, path),
    );
    return undefined;
  }
  return value;
}

function readOptionalStringArray(
  value: unknown,
  diagnostics: ExternalProcessorDiagnostic[],
  path: string,
): readonly string[] | undefined {
  if (value === undefined) return undefined;
  return readStringArray(value, diagnostics, path);
}

function readOptionalScalarArray(
  value: unknown,
  diagnostics: ExternalProcessorDiagnostic[],
  path: string,
): readonly (string | number | boolean)[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every(isScalar)) {
    diagnostics.push(
      diagnostic('invalid-field-type', 'error', `${path} must be a scalar array.`, path),
    );
    return undefined;
  }
  return value;
}

function readRootAliasArray(
  value: unknown,
  diagnostics: ExternalProcessorDiagnostic[],
  path: string,
): readonly ExternalProcessorRootAlias[] | undefined {
  const raw = readStringArray(value, diagnostics, path);
  if (!raw) return undefined;
  const roots: ExternalProcessorRootAlias[] = [];
  for (const [index, item] of raw.entries()) {
    if (!isExternalProcessorRootAlias(item)) {
      diagnostics.push(
        diagnostic(
          'invalid-root-alias',
          'error',
          `${path}.${index} must be a known root alias.`,
          `${path}.${index}`,
        ),
      );
      continue;
    }
    roots.push(item);
  }
  return roots;
}

function diagnostic(
  code: ExternalProcessorDiagnosticCode,
  severity: ExternalProcessorDiagnosticSeverity,
  message: string,
  path?: string,
  details?: Readonly<Record<string, unknown>>,
): ExternalProcessorDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path ? { path } : {}),
    ...(details ? { details } : {}),
  };
}

function addLocationToDiagnostics(
  diagnostics: readonly ExternalProcessorDiagnostic[],
  locationRef: string,
): readonly ExternalProcessorDiagnostic[] {
  return diagnostics.map((item) => ({
    ...item,
    details: {
      ...(item.details ?? {}),
      locationRef,
    },
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isParamType(value: unknown): value is ExternalProcessorParamType {
  return value === 'string' || value === 'number' || value === 'boolean' || value === 'enum';
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isTemplateNamespace(value: string | undefined): value is TemplateNamespace {
  return value === 'input' || value === 'output' || value === 'params';
}
