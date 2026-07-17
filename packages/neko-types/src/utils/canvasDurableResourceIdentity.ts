import type { CanvasAuthoringDiagnostic } from '../types/canvas-authoring-contracts';
import { isRuntimeOnlyCanvasAuthoringResourceIdentityValue } from '../types/canvas-authoring-contracts';
import { isResourceRef } from '../types/resource-cache';

export interface CanvasDurableResourceIdentityValidationOptions {
  readonly rootLabel?: string;
}

const STABLE_PATH_PREFIX_PATTERN = /^\$\{[A-Z][A-Z0-9_]*\}\//;
const PROJECT_RELATIVE_PATH_PATTERN = /^(?:\.\/)?(?!\/)(?![a-zA-Z]:[\\/])[^:?#]+$/;

const RUNTIME_IDENTITY_KEY_PATTERN =
  /(?:^|\.)(?:cachePath|cacheUri|webviewUri|webviewUrl|blobUrl|objectUrl|runtimeAssetPath|runtimeThumbnailPath|runtimeReferenceImagePath|previewUrl|previewUri|streamId|engineToken|runtimeHandle|rangeUrl|entryBaseUrl|token)$/i;

const RUNTIME_IDENTITY_VALUE_PATTERNS: readonly RegExp[] = [
  /^runtime:canvas-generated-(?:group|candidate):/i,
  /^vscode-resource:\/\//i,
  /^vscode-webview-resource:\/\//i,
  /^vscode-webview:\/\//i,
  /^blob:/i,
  /^data:/i,
  /^https?:\/\/(?:127\.0\.0\.1|0\.0\.0\.0|localhost|\[::1\])(?::|\/)/i,
  /^https?:\/\/[^/]*\.vscode-cdn\.net\//i,
  /(?:^|[\\/])\.neko[\\/](?:\.cache|cache)(?:[\\/]|$)/i,
  /(?:^|[\\/])cachePath(?:[\\/]|$)/i,
  /^\/tmp(?:\/|$)/i,
  /^\/private\/tmp(?:\/|$)/i,
  /^\/var\/folders(?:\/|$)/i,
  /^\/private\/var\/folders(?:\/|$)/i,
  /^[A-Z]:\\Users\\[^\\]+\\AppData\\Local\\Temp(?:\\|$)/i,
];

const NKC_DURABLE_IDENTITY_FIELDS = new Set([
  'assetPath',
  'thumbnailPath',
  'scriptPath',
  'docPath',
  'modelPath',
  'canvasPath',
  'projectPath',
  'referenceImagePath',
  'resourceRef',
  'documentResourceRef',
  'legacyGeneratedSourceRef',
  'sourceMediaRefs',
  'generatedMediaRefs',
  'projectionId',
  'groupId',
  'candidateId',
  'renderUri',
  'renderUrl',
  'cachePath',
  'previewUri',
  'previewUrl',
]);

export function validateCanvasDurableResourceIdentity(
  value: unknown,
  options: CanvasDurableResourceIdentityValidationOptions = {},
): readonly CanvasAuthoringDiagnostic[] {
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  collectDurableIdentityDiagnostics(value, options.rootLabel ?? 'value', diagnostics, new Set());
  return diagnostics;
}

export function assertNoRuntimeResourceIdentity(value: unknown, rootLabel = 'value'): void {
  const diagnostics = validateCanvasDurableResourceIdentity(value, { rootLabel });
  const firstError = diagnostics.find((diagnostic) => diagnostic.severity === 'error');
  if (firstError) {
    throw new Error(
      `${firstError.code}: ${firstError.message} (${firstError.target ?? rootLabel})`,
    );
  }
}

export function validateNkcNodeDurableResourceIdentity(
  data: unknown,
  rootLabel: string,
): readonly CanvasAuthoringDiagnostic[] {
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  collectNkcNodeIdentityDiagnostics(data, rootLabel, diagnostics, new Set());
  return diagnostics;
}

export function createCanvasAuthoringDiagnostic(
  severity: CanvasAuthoringDiagnostic['severity'],
  code: string,
  message: string,
  details: Omit<CanvasAuthoringDiagnostic, 'severity' | 'code' | 'message'> = {},
): CanvasAuthoringDiagnostic {
  return {
    severity,
    code,
    message,
    ...details,
  };
}

function collectDurableIdentityDiagnostics(
  value: unknown,
  path: string,
  diagnostics: CanvasAuthoringDiagnostic[],
  seen: Set<object>,
): void {
  if (typeof value === 'string') {
    if (isRuntimeOnlyString(value) || RUNTIME_IDENTITY_KEY_PATTERN.test(path)) {
      if (isStableStringIdentity(value) && !RUNTIME_IDENTITY_KEY_PATTERN.test(path)) {
        return;
      }
      diagnostics.push(
        createCanvasAuthoringDiagnostic(
          'error',
          'runtime-only-resource-identity',
          'Canvas authoring data must not persist runtime handles, cache paths, temp paths, preview URLs, or Engine tokens.',
          { target: path, received: value },
        ),
      );
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectDurableIdentityDiagnostics(item, `${path}[${index}]`, diagnostics, seen),
    );
    return;
  }

  for (const [key, field] of Object.entries(value)) {
    const fieldPath = path ? `${path}.${key}` : key;
    if (RUNTIME_IDENTITY_KEY_PATTERN.test(fieldPath)) {
      diagnostics.push(
        createCanvasAuthoringDiagnostic(
          'error',
          'runtime-only-resource-identity',
          `Canvas authoring field "${key}" is runtime-only and cannot be persisted.`,
          { target: fieldPath, received: field },
        ),
      );
      continue;
    }
    collectDurableIdentityDiagnostics(field, fieldPath, diagnostics, seen);
  }
}

function collectNkcNodeIdentityDiagnostics(
  value: unknown,
  path: string,
  diagnostics: CanvasAuthoringDiagnostic[],
  seen: Set<object>,
): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);

  if (isResourceRef(value)) {
    diagnostics.push(...validateCanvasDurableResourceIdentity(value, { rootLabel: path }));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectNkcNodeIdentityDiagnostics(item, `${path}[${index}]`, diagnostics, seen),
    );
    return;
  }
  for (const [key, field] of Object.entries(value)) {
    const fieldPath = `${path}.${key}`;
    if (NKC_DURABLE_IDENTITY_FIELDS.has(key)) {
      if (RUNTIME_IDENTITY_KEY_PATTERN.test(key)) {
        diagnostics.push(
          createCanvasAuthoringDiagnostic(
            'error',
            'runtime-only-resource-identity',
            `Canvas authoring field "${key}" is runtime-only and cannot be persisted.`,
            { target: fieldPath, received: field },
          ),
        );
        continue;
      }
      diagnostics.push(...validateCanvasDurableResourceIdentity(field, { rootLabel: fieldPath }));
      continue;
    }
    collectNkcNodeIdentityDiagnostics(field, fieldPath, diagnostics, seen);
  }
}

function isRuntimeOnlyString(value: string): boolean {
  return (
    isRuntimeOnlyCanvasAuthoringResourceIdentityValue(value) ||
    RUNTIME_IDENTITY_VALUE_PATTERNS.some((pattern) => pattern.test(value))
  );
}

function isStableStringIdentity(value: string): boolean {
  return STABLE_PATH_PREFIX_PATTERN.test(value) || PROJECT_RELATIVE_PATH_PATTERN.test(value);
}
