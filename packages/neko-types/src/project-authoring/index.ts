import type { QualityProjectRef } from '../types/media-quality';
import type {
  ProjectFileDiagnostic,
  ProjectFileDiagnosticValue,
} from '../project-file-io/diagnostics';

export const NEKO_PROJECT_AUTHORING_CONTRACT_VERSION = 1 as const;

export type NekoProjectAuthoringContractVersion = typeof NEKO_PROJECT_AUTHORING_CONTRACT_VERSION;

export type NekoProjectAuthoringTargetKind = 'active' | 'file' | 'new';

export interface NekoProjectAuthoringTarget {
  readonly kind?: NekoProjectAuthoringTargetKind;
  readonly documentUri?: string;
  readonly title?: string;
  readonly reveal?: boolean;
}

export interface ResolvedNekoProjectAuthoringTarget {
  readonly kind: NekoProjectAuthoringTargetKind;
  readonly documentUri: string;
  readonly title?: string;
  readonly created: boolean;
  readonly reveal: boolean;
}

export type NekoProjectAuthoringDiagnosticSeverity = 'info' | 'warning' | 'error';

export type NekoProjectAuthoringDiagnosticCode =
  | 'missing-authoring-target'
  | 'workspace-required'
  | 'interactive-editor-required'
  | 'stream-required'
  | 'authoring-capability-unavailable'
  | 'authoring-command-removed'
  | 'authoring-ui-bound-route'
  | 'authoring-core-ui-dependency'
  | 'authoring-reveal-failed'
  | 'invalid-authoring-target'
  | 'invalid-authoring-result'
  | 'invalid-authoring-operation'
  | 'runtime-handle-persisted'
  | 'cache-source-persisted'
  | 'source-resolution-failed'
  | 'missing-project-revision'
  | 'stale-project-revision'
  | 'write-failed';

export type NekoProjectAuthoringDiagnosticValue = ProjectFileDiagnosticValue;

export interface NekoProjectAuthoringDiagnostic {
  readonly code: NekoProjectAuthoringDiagnosticCode;
  readonly severity: NekoProjectAuthoringDiagnosticSeverity;
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly sourceId?: string;
  readonly context?: Record<string, NekoProjectAuthoringDiagnosticValue>;
  readonly projectFileDiagnostic?: ProjectFileDiagnostic;
}

export interface NekoProjectAuthoringDiagnosticInput {
  readonly code: NekoProjectAuthoringDiagnosticCode;
  readonly severity?: NekoProjectAuthoringDiagnosticSeverity;
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly sourceId?: string;
  readonly context?: Record<string, NekoProjectAuthoringDiagnosticValue>;
  readonly projectFileDiagnostic?: ProjectFileDiagnostic;
}

export interface NekoProjectAuthoringResult<TData = unknown> {
  readonly version: NekoProjectAuthoringContractVersion;
  readonly ok: boolean;
  readonly documentUri?: string;
  readonly target?: ResolvedNekoProjectAuthoringTarget;
  readonly created?: boolean;
  readonly revealed?: boolean;
  readonly projectRef?: QualityProjectRef;
  readonly diagnostics: readonly NekoProjectAuthoringDiagnostic[];
  readonly data?: TData;
}

export type NekoProjectAuthoringOperationKind =
  'document-authoring' | 'interactive-editor' | 'projection-only';

export type NekoProjectAuthoringClientKind =
  'vscode' | 'tui' | 'electron' | 'agent' | 'assets' | 'package-api';

export type NekoProjectAuthoringCommandDisposition =
  'canonical-authoring' | 'ui-only-wrapper' | 'removed' | 'fail-closed-migration-diagnostic';

export interface NekoProjectAuthoringCommandDescriptor {
  readonly commandId: string;
  readonly domain: string;
  readonly operationId: string;
  readonly operationKind: NekoProjectAuthoringOperationKind;
  readonly disposition: NekoProjectAuthoringCommandDisposition;
  readonly canonicalCommandId?: string;
  readonly requiresActiveEditor?: boolean;
  readonly allowsCreateNew?: boolean;
  readonly clients?: readonly NekoProjectAuthoringClientKind[];
}

export interface NekoProjectAuthoringOperationDescriptor {
  readonly id: string;
  readonly domain: string;
  readonly kind: NekoProjectAuthoringOperationKind;
  readonly canonicalCommandId?: string;
  readonly canonicalApiName?: string;
  readonly allowsCreateNew?: boolean;
  readonly requiresDocumentUri?: boolean;
  readonly requiresActiveEditor?: boolean;
  readonly sourceBearing?: boolean;
  readonly clients?: readonly NekoProjectAuthoringClientKind[];
  readonly legacyCommands?: readonly NekoProjectAuthoringCommandDescriptor[];
}

export interface NekoProjectAuthoringAdapterDescriptor {
  readonly client: NekoProjectAuthoringClientKind;
  readonly operationId: string;
  readonly usesCoreAuthoringContract: boolean;
  readonly handlesRevealAfterWrite?: boolean;
  readonly coreSource?: string;
}

export interface NekoProjectAuthoringValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly NekoProjectAuthoringDiagnostic[];
}

export interface NekoProjectAuthoringStaticGuardRule {
  readonly id: string;
  readonly pattern: string | RegExp;
  readonly code: NekoProjectAuthoringDiagnosticCode;
  readonly message: string;
}

export interface NekoProjectAuthoringStaticGuardResult {
  readonly ok: boolean;
  readonly diagnostics: readonly NekoProjectAuthoringDiagnostic[];
}

export const NEKO_PROJECT_AUTHORING_LEGACY_UI_BOUND_COMMAND_IDS = [
  'neko.cut.importGeneratedClip',
  'neko.sketch.importAsset',
  'neko.model.importAsset',
] as const;

export const NEKO_PROJECT_AUTHORING_OPERATION_KINDS = [
  'document-authoring',
  'interactive-editor',
  'projection-only',
] as const satisfies readonly NekoProjectAuthoringOperationKind[];

export const NEKO_PROJECT_AUTHORING_CLIENT_KINDS = [
  'vscode',
  'tui',
  'electron',
  'agent',
  'assets',
  'package-api',
] as const satisfies readonly NekoProjectAuthoringClientKind[];

export const NEKO_PROJECT_AUTHORING_DEFAULT_STATIC_GUARD_RULES: readonly NekoProjectAuthoringStaticGuardRule[] =
  [
    ...NEKO_PROJECT_AUTHORING_LEGACY_UI_BOUND_COMMAND_IDS.map((commandId) => ({
      id: `legacy-command:${commandId}`,
      pattern: commandId,
      code: 'authoring-ui-bound-route' as const,
      message: `Durable authoring must not target legacy UI-bound command ${commandId}.`,
    })),
    {
      id: 'webview-import-generated-clip-message',
      pattern: /type:\s*['"]importGeneratedClip['"]/,
      code: 'authoring-ui-bound-route',
      message: 'Durable Cut authoring must not use the Webview importGeneratedClip message.',
    },
    {
      id: 'webview-project-snapshot-authoring',
      pattern: /requestWebviewProjectSnapshot/,
      code: 'authoring-ui-bound-route',
      message: 'Host-originated durable authoring must not depend on Webview snapshots.',
    },
  ];

const CORE_UI_DEPENDENCY_RULES: readonly NekoProjectAuthoringStaticGuardRule[] = [
  {
    id: 'vscode-window-import',
    pattern: /vscode\.window\b|\bwindow\.show(?:Information|Warning|Error)Message\b/,
    code: 'authoring-core-ui-dependency',
    message: 'Core authoring services must keep VSCode window APIs in host adapters.',
  },
  {
    id: 'react-import',
    pattern: /from\s+['"]react(?:\/[^'"]*)?['"]|import\s+['"]react(?:\/[^'"]*)?['"]/,
    code: 'authoring-core-ui-dependency',
    message: 'Core authoring services must not import React.',
  },
  {
    id: 'electron-window-import',
    pattern: /from\s+['"]electron['"]|BrowserWindow/,
    code: 'authoring-core-ui-dependency',
    message: 'Core authoring services must keep Electron window state in adapters.',
  },
  {
    id: 'webview-panel-reference',
    pattern: /WebviewPanel|activeWebviewPanel|webviewPanel/,
    code: 'authoring-core-ui-dependency',
    message: 'Core authoring services must not depend on Webview panel state.',
  },
];

const RUNTIME_HANDLE_VALUE_PATTERNS: readonly RegExp[] = [
  /^vscode-resource:\/\//i,
  /^vscode-webview-resource:\/\//i,
  /^vscode-webview:\/\//i,
  /^blob:/i,
  /^data:/i,
  /^https?:\/\/(?:127\.0\.0\.1|0\.0\.0\.0|localhost|\[::1\])(?::|\/)/i,
  /(?:^|[\\/])\.neko[\\/](?:\.cache|cache)(?:[\\/]|$)/i,
  /^\/tmp(?:\/|$)/i,
  /^\/private\/tmp(?:\/|$)/i,
  /^\/var\/folders(?:\/|$)/i,
  /^\/private\/var\/folders(?:\/|$)/i,
  /^[A-Z]:\\Users\\[^\\]+\\AppData\\Local\\Temp(?:\\|$)/i,
];

export function createNekoProjectAuthoringDiagnostic(
  input: NekoProjectAuthoringDiagnosticInput,
): NekoProjectAuthoringDiagnostic {
  return {
    code: input.code,
    severity: input.severity ?? 'error',
    message: input.message,
    ...(input.path ? { path: [...input.path] } : {}),
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.context ? { context: input.context } : {}),
    ...(input.projectFileDiagnostic ? { projectFileDiagnostic: input.projectFileDiagnostic } : {}),
  };
}

export function createNekoProjectAuthoringResult<TData = unknown>(
  input: Omit<NekoProjectAuthoringResult<TData>, 'version'>,
): NekoProjectAuthoringResult<TData> {
  return {
    version: NEKO_PROJECT_AUTHORING_CONTRACT_VERSION,
    ok: input.ok,
    diagnostics: [...input.diagnostics],
    ...(input.documentUri ? { documentUri: input.documentUri } : {}),
    ...(input.target ? { target: input.target } : {}),
    ...(input.created !== undefined ? { created: input.created } : {}),
    ...(input.revealed !== undefined ? { revealed: input.revealed } : {}),
    ...(input.projectRef ? { projectRef: { ...input.projectRef } } : {}),
    ...(input.data !== undefined ? { data: input.data } : {}),
  };
}

export function hasNekoProjectAuthoringErrors(
  diagnostics: readonly NekoProjectAuthoringDiagnostic[],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

export function isNekoProjectAuthoringOperationKind(
  value: unknown,
): value is NekoProjectAuthoringOperationKind {
  return (
    typeof value === 'string' &&
    NEKO_PROJECT_AUTHORING_OPERATION_KINDS.includes(value as NekoProjectAuthoringOperationKind)
  );
}

export function isNekoProjectAuthoringClientKind(
  value: unknown,
): value is NekoProjectAuthoringClientKind {
  return (
    typeof value === 'string' &&
    NEKO_PROJECT_AUTHORING_CLIENT_KINDS.includes(value as NekoProjectAuthoringClientKind)
  );
}

export function isNekoProjectAuthoringRuntimeHandleValue(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    RUNTIME_HANDLE_VALUE_PATTERNS.some((pattern) => pattern.test(value))
  );
}

export function validateNekoProjectAuthoringTarget(
  target: NekoProjectAuthoringTarget | undefined,
  options: { readonly createNewAllowed?: boolean } = {},
): NekoProjectAuthoringValidationResult {
  if (!target) {
    return {
      ok: false,
      diagnostics: [
        createNekoProjectAuthoringDiagnostic({
          code: 'missing-authoring-target',
          message: 'A durable authoring target is required.',
        }),
      ],
    };
  }

  const diagnostics: NekoProjectAuthoringDiagnostic[] = [];
  if (target.kind === 'file' && !target.documentUri) {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'invalid-authoring-target',
        message: 'A file authoring target requires documentUri.',
        path: ['target', 'documentUri'],
      }),
    );
  }
  if (target.kind === 'new' && options.createNewAllowed !== true) {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'missing-authoring-target',
        message: 'This durable authoring operation does not allow create-new targets.',
        path: ['target', 'kind'],
      }),
    );
  }
  if (target.documentUri && isNekoProjectAuthoringRuntimeHandleValue(target.documentUri)) {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'runtime-handle-persisted',
        message: 'Authoring target documentUri must be durable, not a runtime handle.',
        path: ['target', 'documentUri'],
      }),
    );
  }
  return { ok: !hasNekoProjectAuthoringErrors(diagnostics), diagnostics };
}

export function validateNekoProjectAuthoringResult(
  result: NekoProjectAuthoringResult,
): NekoProjectAuthoringValidationResult {
  const diagnostics: NekoProjectAuthoringDiagnostic[] = [];
  if (result.version !== NEKO_PROJECT_AUTHORING_CONTRACT_VERSION) {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'invalid-authoring-result',
        message: `Unsupported project authoring result version: ${String(result.version)}.`,
        path: ['version'],
      }),
    );
  }
  if (result.ok && !result.documentUri) {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'invalid-authoring-result',
        message: 'Successful durable authoring results must include documentUri.',
        path: ['documentUri'],
      }),
    );
  }
  if (result.projectRef) {
    if (!result.projectRef.documentUri.trim() || !result.projectRef.projectRevision.trim()) {
      diagnostics.push(
        createNekoProjectAuthoringDiagnostic({
          code: 'invalid-authoring-result',
          message: 'Returned project references require documentUri and projectRevision.',
          path: ['projectRef'],
        }),
      );
    } else if (isNekoProjectAuthoringRuntimeHandleValue(result.projectRef.documentUri)) {
      diagnostics.push(
        createNekoProjectAuthoringDiagnostic({
          code: 'invalid-authoring-result',
          message: 'Returned project references cannot use runtime or cache identity.',
          path: ['projectRef', 'documentUri'],
        }),
      );
    } else if (result.documentUri && result.projectRef.documentUri !== result.documentUri) {
      diagnostics.push(
        createNekoProjectAuthoringDiagnostic({
          code: 'invalid-authoring-result',
          message: 'Returned project reference must identify the written document.',
          path: ['projectRef', 'documentUri'],
          context: {
            documentUri: result.documentUri,
            projectDocumentUri: result.projectRef.documentUri,
          },
        }),
      );
    }
  }
  if (result.ok && result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'invalid-authoring-result',
        message: 'Successful durable authoring results must not contain error diagnostics.',
        path: ['diagnostics'],
      }),
    );
  }
  return { ok: !hasNekoProjectAuthoringErrors(diagnostics), diagnostics };
}

export function validateNekoProjectAuthoringOperationDescriptor(
  descriptor: NekoProjectAuthoringOperationDescriptor,
): NekoProjectAuthoringValidationResult {
  const diagnostics: NekoProjectAuthoringDiagnostic[] = [];
  if (!isNekoProjectAuthoringOperationKind(descriptor.kind)) {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'invalid-authoring-operation',
        message: `Unknown authoring operation kind: ${String(descriptor.kind)}.`,
        path: ['kind'],
      }),
    );
  }
  if (descriptor.kind === 'document-authoring') {
    if (descriptor.requiresActiveEditor) {
      diagnostics.push(
        createNekoProjectAuthoringDiagnostic({
          code: 'invalid-authoring-operation',
          message: 'Document-authoring operations must not require an active editor.',
          path: ['requiresActiveEditor'],
        }),
      );
    }
    if (!descriptor.canonicalCommandId && !descriptor.canonicalApiName) {
      diagnostics.push(
        createNekoProjectAuthoringDiagnostic({
          code: 'invalid-authoring-operation',
          message: 'Document-authoring operations require a canonical command or API name.',
          path: ['canonicalCommandId'],
        }),
      );
    }
  }
  if (descriptor.kind !== 'document-authoring' && descriptor.allowsCreateNew) {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'invalid-authoring-operation',
        severity: 'warning',
        message: 'Only document-authoring operations should allow create-new targets.',
        path: ['allowsCreateNew'],
      }),
    );
  }
  return { ok: !hasNekoProjectAuthoringErrors(diagnostics), diagnostics };
}

export function validateNekoProjectAuthoringCommandDescriptor(
  descriptor: NekoProjectAuthoringCommandDescriptor,
): NekoProjectAuthoringValidationResult {
  const diagnostics: NekoProjectAuthoringDiagnostic[] = [];
  if (
    descriptor.operationKind === 'document-authoring' &&
    descriptor.disposition !== 'canonical-authoring' &&
    !descriptor.canonicalCommandId
  ) {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'authoring-ui-bound-route',
        message:
          'Non-canonical document authoring commands must point to a canonical authoring command.',
        path: ['canonicalCommandId'],
        context: { commandId: descriptor.commandId, disposition: descriptor.disposition },
      }),
    );
  }
  if (
    descriptor.disposition === 'canonical-authoring' &&
    !descriptor.commandId.includes('.authoring.')
  ) {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'invalid-authoring-operation',
        severity: 'warning',
        message: 'Canonical durable authoring commands should include an authoring namespace.',
        path: ['commandId'],
        context: { commandId: descriptor.commandId },
      }),
    );
  }
  if (descriptor.operationKind === 'document-authoring' && descriptor.requiresActiveEditor) {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'invalid-authoring-operation',
        message: 'Document-authoring commands must not require an active editor.',
        path: ['requiresActiveEditor'],
        context: { commandId: descriptor.commandId },
      }),
    );
  }
  return { ok: !hasNekoProjectAuthoringErrors(diagnostics), diagnostics };
}

export function validateNekoProjectAuthoringAdapterDescriptor(
  descriptor: NekoProjectAuthoringAdapterDescriptor,
): NekoProjectAuthoringValidationResult {
  const diagnostics: NekoProjectAuthoringDiagnostic[] = [];
  if (!isNekoProjectAuthoringClientKind(descriptor.client)) {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'invalid-authoring-operation',
        message: `Unknown authoring client: ${String(descriptor.client)}.`,
        path: ['client'],
      }),
    );
  }
  if (!descriptor.usesCoreAuthoringContract) {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'authoring-capability-unavailable',
        message: 'Client adapters must call the core package authoring contract.',
        path: ['usesCoreAuthoringContract'],
      }),
    );
  }
  if (descriptor.coreSource) {
    diagnostics.push(
      ...scanNekoProjectAuthoringCoreDependencies(descriptor.coreSource).diagnostics,
    );
  }
  return { ok: !hasNekoProjectAuthoringErrors(diagnostics), diagnostics };
}

export function scanNekoProjectAuthoringStaticGuards(
  source: string,
  rules: readonly NekoProjectAuthoringStaticGuardRule[] = NEKO_PROJECT_AUTHORING_DEFAULT_STATIC_GUARD_RULES,
): NekoProjectAuthoringStaticGuardResult {
  const diagnostics = rules.flatMap((rule) => {
    const matched =
      typeof rule.pattern === 'string' ? source.includes(rule.pattern) : rule.pattern.test(source);
    return matched
      ? [
          createNekoProjectAuthoringDiagnostic({
            code: rule.code,
            message: rule.message,
            context: { ruleId: rule.id },
          }),
        ]
      : [];
  });
  return { ok: diagnostics.length === 0, diagnostics };
}

export function scanNekoProjectAuthoringCoreDependencies(
  source: string,
): NekoProjectAuthoringStaticGuardResult {
  return scanNekoProjectAuthoringStaticGuards(source, CORE_UI_DEPENDENCY_RULES);
}

export * from './project-quality';
