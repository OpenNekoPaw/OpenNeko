import { isResourceRef, type ResourceRef } from '../types/resource-cache';
import type { QualityDiagnostic, QualityProjectRef, QualityTarget } from '../types/media-quality';
import { isRuntimeOnlyResourceIdentityValue } from '../types/durable-resource-ref';

export const PROJECT_QUALITY_CONTRACT_VERSION = 1 as const;

export type ProjectQualityOperation =
  | 'validate-project'
  | 'get-project-snapshot'
  | 'render-preview'
  | 'probe-runtime'
  | 'check-export-readiness';

export interface ProjectQualityRequest {
  readonly version: typeof PROJECT_QUALITY_CONTRACT_VERSION;
  readonly requestId: string;
  readonly project: QualityProjectRef;
  readonly target: QualityTarget;
}

export interface ProjectQualitySnapshot {
  readonly project: QualityProjectRef;
  readonly snapshotRef: ResourceRef;
  readonly createdAt: string;
}

export interface ProjectQualityPreview {
  readonly project: QualityProjectRef;
  readonly previewRef: ResourceRef;
  readonly sessionRenderUri?: string;
  readonly createdAt: string;
}

export interface ProjectQualityProbe {
  readonly project: QualityProjectRef;
  readonly available: boolean;
  readonly profileId?: string;
  readonly diagnostics: readonly QualityDiagnostic[];
}

export interface ProjectExportReadiness {
  readonly project: QualityProjectRef;
  readonly ready: boolean;
  readonly requiredEvidenceIds: readonly string[];
  readonly diagnostics: readonly QualityDiagnostic[];
}

export interface ProjectQualityResult<TData> {
  readonly version: typeof PROJECT_QUALITY_CONTRACT_VERSION;
  readonly requestId: string;
  readonly operation: ProjectQualityOperation;
  readonly ok: boolean;
  readonly data?: TData;
  readonly diagnostics: readonly QualityDiagnostic[];
}

export interface ProjectQualityFacade {
  validateProject(request: ProjectQualityRequest): Promise<ProjectQualityResult<QualityTarget>>;
  getProjectSnapshot(
    request: ProjectQualityRequest,
  ): Promise<ProjectQualityResult<ProjectQualitySnapshot>>;
  renderPreview(
    request: ProjectQualityRequest,
  ): Promise<ProjectQualityResult<ProjectQualityPreview>>;
  probeRuntime(request: ProjectQualityRequest): Promise<ProjectQualityResult<ProjectQualityProbe>>;
  checkExportReadiness(
    request: ProjectQualityRequest,
  ): Promise<ProjectQualityResult<ProjectExportReadiness>>;
}

export interface ProjectQualityContractValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly QualityDiagnostic[];
}

export function validateProjectQualityResult<TData>(
  result: ProjectQualityResult<TData>,
): ProjectQualityContractValidationResult {
  const diagnostics: QualityDiagnostic[] = [];
  if (
    result.version !== PROJECT_QUALITY_CONTRACT_VERSION ||
    !result.requestId.trim() ||
    !isProjectQualityOperation(result.operation)
  ) {
    diagnostics.push({
      code: 'invalid-quality-gate-result',
      severity: 'error',
      message: 'ProjectQuality result has an unsupported version, operation, or empty request id.',
    });
  }
  if (result.ok && result.data === undefined) {
    diagnostics.push({
      code: 'invalid-quality-gate-result',
      severity: 'error',
      message: 'Successful ProjectQuality results require data.',
      path: ['data'],
    });
  }
  if (result.ok && result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    diagnostics.push({
      code: 'invalid-quality-gate-result',
      severity: 'error',
      message: 'Successful ProjectQuality results cannot contain error diagnostics.',
      path: ['diagnostics'],
    });
  }
  if (!result.ok && result.diagnostics.length === 0) {
    diagnostics.push({
      code: 'invalid-quality-gate-result',
      severity: 'error',
      message: 'Failed ProjectQuality results require explicit diagnostics.',
      path: ['diagnostics'],
    });
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

export function validateProjectQualityPreview(
  preview: ProjectQualityPreview,
): ProjectQualityContractValidationResult {
  const diagnostics: QualityDiagnostic[] = [];
  if (!isResourceRef(preview.previewRef)) {
    diagnostics.push({
      code: 'invalid-quality-gate-result',
      severity: 'error',
      message: 'ProjectQuality preview requires a structurally valid preview ResourceRef.',
      path: ['previewRef'],
    });
  } else if (
    projectQualityPreviewIdentityValues(preview.previewRef).some(isRuntimeOnlyResourceIdentityValue)
  ) {
    diagnostics.push({
      code: 'invalid-quality-gate-result',
      severity: 'error',
      message:
        'ProjectQuality previewRef cannot use cache, render, Webview, or session-only identity.',
      path: ['previewRef'],
    });
  }
  if (preview.sessionRenderUri && !isRuntimeOnlyResourceIdentityValue(preview.sessionRenderUri)) {
    diagnostics.push({
      code: 'invalid-quality-gate-result',
      severity: 'error',
      message: 'sessionRenderUri is display-only and must not be represented as durable identity.',
      path: ['sessionRenderUri'],
    });
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

function projectQualityPreviewIdentityValues(ref: ResourceRef): readonly unknown[] {
  const values: unknown[] = [
    ref.id,
    ref.source.filePath,
    ref.source.uri,
    ref.source.projectRelativePath,
  ];
  if (ref.locator?.kind === 'file') values.push(ref.locator.path, ref.locator.uri);
  if (ref.locator?.kind === 'preview-asset') values.push(ref.locator.route);
  return values;
}

function isProjectQualityOperation(value: unknown): value is ProjectQualityOperation {
  return (
    value === 'validate-project' ||
    value === 'get-project-snapshot' ||
    value === 'render-preview' ||
    value === 'probe-runtime' ||
    value === 'check-export-readiness'
  );
}
