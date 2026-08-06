import {
  isContentRepresentationLocator,
  isHostProjectedRuntimeValue,
  type ContentLocator,
  type ContentRepresentationLocator,
} from '@neko/content';
import {
  type QualityDiagnostic,
  type QualityProjectRef,
  type QualityTarget,
} from '@neko/generation';

export type ProjectQualityOperation =
  | 'validate-project'
  | 'get-project-snapshot'
  | 'render-preview'
  | 'probe-runtime'
  | 'check-export-readiness';

export interface ProjectQualityRequest {
  readonly requestId: string;
  readonly project: QualityProjectRef;
  readonly target: QualityTarget;
}

export interface ProjectQualitySnapshot {
  readonly project: QualityProjectRef;
  readonly snapshotLocator: ContentLocator;
  readonly createdAt: string;
}

export interface ProjectQualityPreview {
  readonly project: QualityProjectRef;
  readonly previewLocator: ContentRepresentationLocator;
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
    !hasOnlyFields(result, new Set(['requestId', 'operation', 'ok', 'data', 'diagnostics'])) ||
    !result.requestId.trim() ||
    !isProjectQualityOperation(result.operation)
  ) {
    diagnostics.push({
      code: 'invalid-quality-gate-result',
      severity: 'error',
      message:
        'ProjectQuality result has unknown fields, an invalid operation, or empty request id.',
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
  if (!isContentRepresentationLocator(preview.previewLocator)) {
    diagnostics.push({
      code: 'invalid-quality-gate-result',
      severity: 'error',
      message: 'ProjectQuality preview requires a valid ContentRepresentationLocator.',
      path: ['previewLocator'],
    });
  }
  if (preview.sessionRenderUri && !isHostProjectedRuntimeValue(preview.sessionRenderUri)) {
    diagnostics.push({
      code: 'invalid-quality-gate-result',
      severity: 'error',
      message: 'sessionRenderUri is display-only and must not be represented as durable identity.',
      path: ['sessionRenderUri'],
    });
  }
  return { ok: diagnostics.length === 0, diagnostics };
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

function hasOnlyFields(value: object, allowedFields: ReadonlySet<string>): boolean {
  return Object.keys(value).every((field) => allowedFields.has(field));
}
