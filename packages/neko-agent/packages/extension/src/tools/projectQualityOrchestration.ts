import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  PROJECT_QUALITY_CONTRACT_VERSION,
  validateProjectQualityResult,
  type ProjectQualityFacade,
  type ProjectQualityRequest,
  type ProjectQualityResult,
  type QualityDiagnostic,
  type QualityEvidence,
  type QualityEvaluatorClass,
  type QualityIssue,
  type QualityProjectRef,
  type QualityTarget,
  type ResourceRef,
} from '@neko/shared';

export interface ProjectQualityFacadeResolver {
  resolve(project: QualityProjectRef): Promise<ProjectQualityFacade | undefined>;
}

export interface ProjectQualityOrchestrationOptions {
  readonly now?: () => string;
  readonly createId?: (prefix: string) => string;
}

export async function collectProjectQualityEvidence(
  target: QualityTarget,
  resolver: ProjectQualityFacadeResolver,
  options: ProjectQualityOrchestrationOptions = {},
): Promise<readonly QualityEvidence[]> {
  const project = target.projectRef;
  if (target.kind !== 'project-artifact' || !project) {
    throw new Error(
      'invalid-quality-target: ProjectQuality orchestration requires a project target.',
    );
  }
  const facade = await resolver.resolve(project);
  if (!facade) {
    throw new Error(
      `quality-project-facade-unavailable: No owning ProjectQuality facade is available for ${project.domain}.`,
    );
  }

  const now = options.now ?? (() => new Date().toISOString());
  const createId = options.createId ?? ((prefix) => `${prefix}-${crypto.randomUUID()}`);
  const request: ProjectQualityRequest = {
    version: PROJECT_QUALITY_CONTRACT_VERSION,
    requestId: createId('project-quality-request'),
    project,
    target,
  };
  const validation = await facade.validateProject(request);
  assertProjectQualityResult(validation, 'validate-project');
  if (!validation.ok) {
    return [
      createEvidence(target, 'structural', validation.diagnostics, [], now(), createId, {
        id: 'project.valid',
        value: false,
        passed: false,
      }),
    ];
  }

  const snapshot = await facade.getProjectSnapshot(request);
  const runtime = await facade.probeRuntime(request);
  const readiness = await facade.checkExportReadiness(request);
  assertProjectQualityResult(snapshot, 'get-project-snapshot');
  assertProjectQualityResult(runtime, 'probe-runtime');
  assertProjectQualityResult(readiness, 'check-export-readiness');

  const snapshotRefs = snapshot.ok ? [snapshot.data.snapshotRef] : [];
  const structuralDiagnostics = [...validation.diagnostics, ...snapshot.diagnostics];
  const runtimeDiagnostics = [
    ...runtime.diagnostics,
    ...(runtime.ok ? runtime.data.diagnostics : []),
  ];
  const readinessDiagnostics = [
    ...readiness.diagnostics,
    ...(readiness.ok ? readiness.data.diagnostics : []),
  ];
  return [
    createEvidence(target, 'structural', structuralDiagnostics, snapshotRefs, now(), createId, {
      id: 'project.valid',
      value: snapshot.ok,
      passed: snapshot.ok && !hasError(structuralDiagnostics),
    }),
    createEvidence(target, 'technical', runtimeDiagnostics, snapshotRefs, now(), createId, {
      id: 'project.runtime.available',
      value: runtime.ok && runtime.data.available,
      passed: runtime.ok && runtime.data.available && !hasError(runtimeDiagnostics),
    }),
    createEvidence(target, 'policy', readinessDiagnostics, snapshotRefs, now(), createId, {
      id: 'project.export.ready',
      value: readiness.ok && readiness.data.ready,
      passed: readiness.ok && readiness.data.ready && !hasError(readinessDiagnostics),
    }),
  ];
}

function assertProjectQualityResult(
  result: ProjectQualityResult<unknown>,
  operation: ProjectQualityResult<unknown>['operation'],
): void {
  const contract = validateProjectQualityResult(result);
  if (result.operation !== operation || !contract.ok) {
    throw new Error(
      `invalid-project-quality-result: ${operation}: ${contract.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join('; ')}`,
    );
  }
}

function createEvidence(
  target: QualityTarget,
  evaluatorClass: QualityEvaluatorClass,
  diagnostics: readonly QualityDiagnostic[],
  sourceEvidenceRefs: readonly ResourceRef[],
  createdAt: string,
  createId: (prefix: string) => string,
  metric: QualityEvidence['metrics'][number],
): QualityEvidence {
  return {
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    evidenceId: createId('project-quality-evidence'),
    evaluator: {
      id: `owning-project-quality/${target.projectRef?.domain ?? 'unknown'}/${evaluatorClass}`,
      version: String(PROJECT_QUALITY_CONTRACT_VERSION),
      evaluatorClass,
    },
    target,
    state: 'current',
    metrics: [metric],
    issues: diagnostics.map((diagnostic, index) => diagnosticIssue(diagnostic, index, createId)),
    coverage: {
      mode: 'structural-only',
      description: `Owning ${target.projectRef?.domain ?? 'project'} facade ${evaluatorClass} evidence.`,
    },
    createdAt,
    sourceEvidenceRefs,
  };
}

function diagnosticIssue(
  diagnostic: QualityDiagnostic,
  index: number,
  createId: (prefix: string) => string,
): QualityIssue {
  return {
    id: createId(`project-quality-issue-${index}`),
    category: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.path ? { location: { fieldPath: diagnostic.path } } : {}),
  };
}

function hasError(diagnostics: readonly QualityDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
