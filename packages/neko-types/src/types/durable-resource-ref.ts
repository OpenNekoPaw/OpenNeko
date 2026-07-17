import { isResourceRef, type ResourceRef } from './resource-cache';

export type DurableResourceRefDiagnosticCode =
  'invalid-resource-ref' | 'runtime-resource-identity' | 'preview-resource-identity';

export interface DurableResourceRefDiagnostic {
  readonly code: DurableResourceRefDiagnosticCode;
  readonly severity: 'error';
  readonly message: string;
  readonly path: readonly (string | number)[];
}

export interface DurableResourceRefValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly DurableResourceRefDiagnostic[];
}

const RUNTIME_RESOURCE_PATTERNS = [
  /^vscode-(?:webview-resource|resource):/i,
  /^vscode-webview:\/\//i,
  /(?:^|[\\/])\.neko[\\/]\.?cache(?:[\\/]|$)/i,
  /(?:^|[\\/])cache(?:[\\/]|$)/i,
  /^(?:render|preview|engine-session|provider-task):\/\//i,
  /^blob:/i,
] as const;

export function isRuntimeOnlyResourceIdentityValue(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    RUNTIME_RESOURCE_PATTERNS.some((pattern) => pattern.test(value.trim()))
  );
}

export function validateDurableResourceRef(
  value: unknown,
  path: readonly (string | number)[] = ['resourceRef'],
): DurableResourceRefValidationResult {
  if (!isResourceRef(value)) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'invalid-resource-ref',
          severity: 'error',
          message: 'A structurally valid ResourceRef is required.',
          path,
        },
      ],
    };
  }

  const diagnostics: DurableResourceRefDiagnostic[] = [];
  if (
    value.kind === 'preview' ||
    value.source.kind === 'preview-asset' ||
    value.locator?.kind === 'preview-asset'
  ) {
    diagnostics.push({
      code: 'preview-resource-identity',
      severity: 'error',
      message: 'Preview resources are derived session artifacts and cannot be durable identity.',
      path,
    });
  }

  for (const [fieldPath, fieldValue] of resourceIdentityValues(value)) {
    if (isRuntimeOnlyResourceIdentityValue(fieldValue)) {
      diagnostics.push({
        code: 'runtime-resource-identity',
        severity: 'error',
        message: 'ResourceRef contains a cache, render, Webview, task, or session-only identity.',
        path: [...path, ...fieldPath],
      });
    }
  }

  return { ok: diagnostics.length === 0, diagnostics };
}

function resourceIdentityValues(resource: ResourceRef): readonly [readonly string[], unknown][] {
  const values: [readonly string[], unknown][] = [
    [['id'], resource.id],
    [['source', 'filePath'], resource.source.filePath],
    [['source', 'uri'], resource.source.uri],
    [['source', 'projectRelativePath'], resource.source.projectRelativePath],
  ];

  const locator = resource.locator;
  if (locator?.kind === 'file') {
    values.push([['locator', 'path'], locator.path], [['locator', 'uri'], locator.uri]);
  } else if (locator?.kind === 'preview-asset') {
    values.push([['locator', 'route'], locator.route]);
  } else if (locator?.kind === 'document') {
    values.push([['locator', 'entryPath'], locator.entryPath]);
  }

  return values;
}
