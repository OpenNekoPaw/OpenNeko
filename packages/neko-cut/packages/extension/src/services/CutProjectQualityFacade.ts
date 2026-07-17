import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ProjectData,
  ProjectExportReadiness,
  ProjectFileOps,
  ProjectQualityFacade,
  ProjectQualityOperation,
  ProjectQualityPreview,
  ProjectQualityProbe,
  ProjectQualityRequest,
  ProjectQualityResult,
  ProjectQualitySnapshot,
  ProjectSourceDescriptor,
  QualityDiagnostic,
  QualityProjectRef,
  QualityTarget,
  ResourceRef,
} from '@neko/shared';
import {
  PROJECT_QUALITY_CONTRACT_VERSION,
  createResourceRef,
  detectRuntimeOrCacheSourceHandle,
  hashStableValue,
  nkvSourcePathPolicy,
  validateProjectQualityPreview,
  validateQualityTarget,
} from '@neko/shared';
import { loadNkv } from '@neko/shared/nkv';

export type CutProjectSnapshotResult =
  | { readonly status: 'available'; readonly document: ProjectData }
  | { readonly status: 'not-open' }
  | { readonly status: 'unavailable'; readonly diagnostic: QualityDiagnostic };

export interface CutProjectSnapshotSource {
  getSnapshot(input: { readonly documentUri: string }): Promise<CutProjectSnapshotResult>;
}

export interface CutProjectReviewRenderer {
  renderReview(input: {
    readonly project: QualityProjectRef;
    readonly document: ProjectData;
    readonly revision: string;
    readonly mediaRange: QualityTarget['mediaRange'];
  }): Promise<{
    readonly previewRef: ResourceRef;
    readonly sessionRenderUri?: string;
  }>;
}

export interface CutProjectRuntimeProbe {
  probe(input: { readonly project: QualityProjectRef; readonly document: ProjectData }): Promise<{
    readonly available: boolean;
    readonly profileId?: string;
    readonly diagnostics?: readonly QualityDiagnostic[];
  }>;
}

export interface CutProjectExportReadinessProbe {
  check(input: {
    readonly project: QualityProjectRef;
    readonly document: ProjectData;
    readonly target: QualityTarget;
  }): Promise<{
    readonly ready: boolean;
    readonly requiredEvidenceIds?: readonly string[];
    readonly diagnostics?: readonly QualityDiagnostic[];
  }>;
}

export interface CutProjectQualityFacadeOptions {
  readonly fileOps: ProjectFileOps;
  readonly snapshotSource?: CutProjectSnapshotSource;
  readonly reviewRenderer?: CutProjectReviewRenderer;
  readonly runtimeProbe?: CutProjectRuntimeProbe;
  readonly exportReadinessProbe?: CutProjectExportReadinessProbe;
  readonly resolveSourcePath?: (sourcePath: string, projectFilePath: string) => string | undefined;
  readonly now?: () => Date;
}

interface LoadedCutProject {
  readonly document: ProjectData;
  readonly project: QualityProjectRef;
  readonly revision: string;
  readonly contentDigest: string;
  readonly snapshotRef: ResourceRef;
  readonly diagnostics: readonly QualityDiagnostic[];
}

export class CutProjectQualityFacade implements ProjectQualityFacade {
  private readonly now: () => Date;

  constructor(private readonly options: CutProjectQualityFacadeOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async validateProject(
    request: ProjectQualityRequest,
  ): Promise<ProjectQualityResult<QualityTarget>> {
    const loaded = await this.loadCurrentProject(request, 'validate-project');
    if (!loaded.ok) return loaded.result;
    return successResult(
      request,
      'validate-project',
      {
        ...request.target,
        revision: loaded.value.revision,
        contentDigest: loaded.value.contentDigest,
        projectRef: loaded.value.project,
      },
      loaded.value.diagnostics,
    );
  }

  async getProjectSnapshot(
    request: ProjectQualityRequest,
  ): Promise<ProjectQualityResult<ProjectQualitySnapshot>> {
    const loaded = await this.loadCurrentProject(request, 'get-project-snapshot');
    if (!loaded.ok) return loaded.result;
    return successResult(
      request,
      'get-project-snapshot',
      {
        project: loaded.value.project,
        snapshotRef: loaded.value.snapshotRef,
        createdAt: this.now().toISOString(),
      },
      loaded.value.diagnostics,
    );
  }

  async renderPreview(
    request: ProjectQualityRequest,
  ): Promise<ProjectQualityResult<ProjectQualityPreview>> {
    const loaded = await this.loadCurrentProject(request, 'render-preview');
    if (!loaded.ok) return loaded.result;
    if (!this.options.reviewRenderer) {
      return failedResult(
        request,
        'render-preview',
        diagnostic(
          'quality-evaluator-failed',
          'Cut review rendering is unavailable because no target-bound review renderer is registered.',
        ),
      );
    }

    const rendered = await this.options.reviewRenderer.renderReview({
      project: loaded.value.project,
      document: loaded.value.document,
      revision: loaded.value.revision,
      mediaRange: request.target.mediaRange,
    });
    const preview: ProjectQualityPreview = {
      project: loaded.value.project,
      previewRef: rendered.previewRef,
      ...(rendered.sessionRenderUri ? { sessionRenderUri: rendered.sessionRenderUri } : {}),
      createdAt: this.now().toISOString(),
    };
    const validation = validateProjectQualityPreview(preview);
    if (!validation.ok) {
      return failedResult(request, 'render-preview', ...validation.diagnostics);
    }
    return successResult(request, 'render-preview', preview, loaded.value.diagnostics);
  }

  async probeRuntime(
    request: ProjectQualityRequest,
  ): Promise<ProjectQualityResult<ProjectQualityProbe>> {
    const loaded = await this.loadCurrentProject(request, 'probe-runtime');
    if (!loaded.ok) return loaded.result;
    if (!this.options.runtimeProbe) {
      const diagnostics = [
        diagnostic(
          'quality-evaluator-failed',
          'Cut runtime is unavailable because no target-bound runtime probe is registered.',
          'warning',
        ),
      ];
      return successResult(
        request,
        'probe-runtime',
        { project: loaded.value.project, available: false, diagnostics },
        loaded.value.diagnostics,
      );
    }

    const probe = await this.options.runtimeProbe.probe({
      project: loaded.value.project,
      document: loaded.value.document,
    });
    return successResult(
      request,
      'probe-runtime',
      {
        project: loaded.value.project,
        available: probe.available,
        ...(probe.profileId ? { profileId: probe.profileId } : {}),
        diagnostics: probe.diagnostics ?? [],
      },
      loaded.value.diagnostics,
    );
  }

  async checkExportReadiness(
    request: ProjectQualityRequest,
  ): Promise<ProjectQualityResult<ProjectExportReadiness>> {
    const loaded = await this.loadCurrentProject(request, 'check-export-readiness');
    if (!loaded.ok) return loaded.result;

    const diagnostics = [...loaded.value.diagnostics];
    if (loaded.value.document.tracks.every((track) => track.elements.length === 0)) {
      diagnostics.push(
        diagnostic('invalid-quality-target', 'Cut export requires at least one timeline element.'),
      );
    }
    diagnostics.push(
      diagnostic(
        'partial-quality-coverage',
        '.nkv persists timeline resolution and fps, while container, codec, bitrate, and output path remain export-adapter settings.',
        'warning',
      ),
    );
    if (!this.options.exportReadinessProbe) {
      diagnostics.push(
        diagnostic(
          'quality-evaluator-failed',
          'Cut export readiness is unavailable because no target-bound export adapter is registered.',
        ),
      );
      return successResult(request, 'check-export-readiness', {
        project: loaded.value.project,
        ready: false,
        requiredEvidenceIds: [],
        diagnostics,
      });
    }

    const probe = await this.options.exportReadinessProbe.check({
      project: loaded.value.project,
      document: loaded.value.document,
      target: request.target,
    });
    diagnostics.push(...(probe.diagnostics ?? []));
    return successResult(request, 'check-export-readiness', {
      project: loaded.value.project,
      ready: probe.ready && !hasErrors(diagnostics),
      requiredEvidenceIds: probe.requiredEvidenceIds ?? [],
      diagnostics,
    });
  }

  private async loadCurrentProject(
    request: ProjectQualityRequest,
    operation: ProjectQualityOperation,
  ): Promise<
    | { readonly ok: true; readonly value: LoadedCutProject }
    | { readonly ok: false; readonly result: ProjectQualityResult<never> }
  > {
    const requestDiagnostics = validateCutProjectRequest(request);
    if (hasErrors(requestDiagnostics)) {
      return { ok: false, result: failedResult(request, operation, ...requestDiagnostics) };
    }

    const projectFilePath = tryDocumentUriToFilePath(request.project.documentUri);
    if (!projectFilePath) {
      return {
        ok: false,
        result: failedResult(
          request,
          operation,
          diagnostic(
            'invalid-quality-target',
            'Cut project documentUri must be a valid file URI or local path.',
            'error',
            ['project', 'documentUri'],
          ),
        ),
      };
    }

    const source = await this.readTargetBoundDocument(request.project.documentUri, projectFilePath);
    if (!source.ok) {
      return { ok: false, result: failedResult(request, operation, ...source.diagnostics) };
    }
    const loaded = loadNkv(JSON.stringify(source.document));
    const diagnostics: QualityDiagnostic[] = [
      ...requestDiagnostics,
      ...loaded.validation.errors.map(mapNkvDiagnostic),
      ...loaded.validation.warnings.map(mapNkvDiagnostic),
      ...(loaded.migration?.warnings ?? []).map((message) =>
        diagnostic('quality-evaluator-failed', `Cut migration warning: ${message}`, 'warning'),
      ),
    ];
    if (!loaded.validation.valid) {
      return { ok: false, result: failedResult(request, operation, ...diagnostics) };
    }

    diagnostics.push(...validateCutStructure(loaded.project));
    diagnostics.push(...validateTargetRange(request.target, loaded.project));
    diagnostics.push(...(await this.validateResources(loaded.project, projectFilePath)));
    if (hasErrors(diagnostics)) {
      return { ok: false, result: failedResult(request, operation, ...diagnostics) };
    }

    const contentDigest = hashStableValue(loaded.project);
    const revision = `nkv:${contentDigest}`;
    if (
      request.project.projectRevision !== revision ||
      (request.project.contentDigest !== undefined &&
        request.project.contentDigest !== contentDigest)
    ) {
      return {
        ok: false,
        result: failedResult(
          request,
          operation,
          diagnostic(
            'stale-quality-evidence',
            'The requested Cut project revision does not match the target-bound .nkv snapshot.',
            'error',
            ['project', 'projectRevision'],
          ),
        ),
      };
    }

    const project: QualityProjectRef = {
      domain: 'cut',
      documentUri: request.project.documentUri,
      projectRevision: revision,
      contentDigest,
    };
    return {
      ok: true,
      value: {
        document: loaded.project,
        project,
        revision,
        contentDigest,
        diagnostics,
        snapshotRef: createCutSnapshotRef(project, contentDigest),
      },
    };
  }

  private async readTargetBoundDocument(
    documentUri: string,
    projectFilePath: string,
  ): Promise<
    | { readonly ok: true; readonly document: ProjectData }
    | { readonly ok: false; readonly diagnostics: readonly QualityDiagnostic[] }
  > {
    if (this.options.snapshotSource) {
      const snapshot = await this.options.snapshotSource.getSnapshot({ documentUri });
      if (snapshot.status === 'available') return { ok: true, document: snapshot.document };
      if (snapshot.status === 'unavailable') {
        return { ok: false, diagnostics: [snapshot.diagnostic] };
      }
    }

    try {
      const bytes = await this.options.fileOps.readFile(projectFilePath);
      const loaded = loadNkv(new TextDecoder().decode(bytes));
      if (!loaded.validation.valid) {
        return {
          ok: false,
          diagnostics: [
            ...loaded.validation.errors.map(mapNkvDiagnostic),
            ...loaded.validation.warnings.map(mapNkvDiagnostic),
          ],
        };
      }
      return { ok: true, document: loaded.project };
    } catch (error) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'quality-evaluator-failed',
            `Failed to read Cut project: ${formatError(error)}`,
          ),
        ],
      };
    }
  }

  private async validateResources(
    document: ProjectData,
    projectFilePath: string,
  ): Promise<readonly QualityDiagnostic[]> {
    const diagnostics: QualityDiagnostic[] = [];
    for (const descriptor of nkvSourcePathPolicy.listSources(document)) {
      const identityDiagnostic = detectRuntimeOrCacheSourceHandle(descriptor);
      if (identityDiagnostic) {
        diagnostics.push(projectFileDiagnostic(identityDiagnostic));
        continue;
      }
      if (descriptor.allowRemote && /^https?:\/\//i.test(descriptor.path)) continue;
      const sourcePath = this.resolveSourcePath(descriptor, projectFilePath);
      if (!sourcePath) {
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Cut source ${descriptor.id} cannot be resolved from its durable project path.`,
            'error',
            descriptor.fieldPath,
          ),
        );
        continue;
      }
      try {
        await this.options.fileOps.readFile(sourcePath);
      } catch {
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Cut source ${descriptor.id} is missing: ${descriptor.path}`,
            'error',
            descriptor.fieldPath,
          ),
        );
      }
    }
    return diagnostics;
  }

  private resolveSourcePath(
    descriptor: ProjectSourceDescriptor,
    projectFilePath: string,
  ): string | undefined {
    if (this.options.resolveSourcePath) {
      return this.options.resolveSourcePath(descriptor.path, projectFilePath);
    }
    if (!descriptor.path.trim() || descriptor.path.includes('${')) return undefined;
    if (/^[a-z][a-z0-9+.-]*:/i.test(descriptor.path) || isAbsolute(descriptor.path)) {
      return undefined;
    }
    return resolve(dirname(projectFilePath), descriptor.path);
  }
}

export function createNkvProjectRef(documentUri: string, document: ProjectData): QualityProjectRef {
  const loaded = loadNkv(JSON.stringify(document));
  const contentDigest = hashStableValue(loaded.project);
  return {
    domain: 'cut',
    documentUri,
    projectRevision: `nkv:${contentDigest}`,
    contentDigest,
  };
}

function validateCutProjectRequest(request: ProjectQualityRequest): readonly QualityDiagnostic[] {
  const diagnostics: QualityDiagnostic[] = [];
  if (request.version !== PROJECT_QUALITY_CONTRACT_VERSION || !request.requestId.trim()) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'Cut ProjectQuality requests require the current contract version and a request id.',
      ),
    );
  }
  diagnostics.push(...validateQualityTarget(request.target).diagnostics);
  if (request.project.domain !== 'cut' || request.target.projectRef?.domain !== 'cut') {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'The Cut ProjectQuality facade only accepts cut project targets.',
        'error',
        ['project', 'domain'],
      ),
    );
  }
  if (
    request.target.projectRef?.documentUri !== request.project.documentUri ||
    request.target.projectRef?.projectRevision !== request.project.projectRevision
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'QualityTarget.projectRef must match the ProjectQuality request project.',
        'error',
        ['target', 'projectRef'],
      ),
    );
  }
  const documentPath = tryDocumentUriToFilePath(request.project.documentUri);
  if (!documentPath || extname(documentPath).toLowerCase() !== '.nkv') {
    diagnostics.push(
      diagnostic(
        'invalid-quality-target',
        'The Cut ProjectQuality facade requires a valid .nkv file URI or local path.',
        'error',
        ['project', 'documentUri'],
      ),
    );
  }
  return diagnostics;
}

function validateCutStructure(document: ProjectData): readonly QualityDiagnostic[] {
  const diagnostics: QualityDiagnostic[] = [];
  const trackIds = new Set<string>();
  const elementIds = new Set<string>();
  document.tracks.forEach((track, trackIndex) => {
    const trackPath = ['tracks', trackIndex] as const;
    if (!track.id.trim() || trackIds.has(track.id)) {
      diagnostics.push(
        diagnostic(
          'invalid-quality-target',
          `Cut track ids must be non-empty and unique: ${track.id || '<empty>'}.`,
          'error',
          [...trackPath, 'id'],
        ),
      );
    }
    trackIds.add(track.id);
    track.elements.forEach((element, elementIndex) => {
      const path = [...trackPath, 'elements', elementIndex];
      if (!element.id.trim() || elementIds.has(element.id)) {
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Cut element ids must be non-empty and unique across the project: ${element.id || '<empty>'}.`,
            'error',
            [...path, 'id'],
          ),
        );
      }
      elementIds.add(element.id);
      if (
        ((track.type === 'audio' || element.type === 'audio') &&
          (track.type !== 'audio' || element.type !== 'audio')) ||
        ((track.type === 'subtitle' || element.type === 'subtitle') &&
          (track.type !== 'subtitle' || element.type !== 'subtitle'))
      ) {
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Cut ${element.type} element ${element.id || '<empty>'} is incompatible with ${track.type} track ${track.id || '<empty>'}.`,
            'error',
            [...path, 'type'],
          ),
        );
      }
      if (element.type === 'subtitle' && !element.text.trim()) {
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Cut subtitle element ${element.id || '<empty>'} must contain non-empty text.`,
            'error',
            [...path, 'text'],
          ),
        );
      }
      if (
        !Number.isFinite(element.startTime) ||
        element.startTime < 0 ||
        !Number.isFinite(element.duration) ||
        element.duration <= 0 ||
        !Number.isFinite(element.trimStart) ||
        element.trimStart < 0 ||
        !Number.isFinite(element.trimEnd) ||
        element.trimEnd < 0 ||
        element.trimStart + element.trimEnd >= element.duration
      ) {
        diagnostics.push(
          diagnostic(
            'invalid-quality-target',
            `Cut element ${element.id || '<empty>'} has an invalid timeline range or trims.`,
            'error',
            path,
          ),
        );
      }
    });
  });
  return diagnostics;
}

function validateTargetRange(
  target: QualityTarget,
  document: ProjectData,
): readonly QualityDiagnostic[] {
  if (!target.mediaRange) return [];
  const duration = getProjectDuration(document);
  if (target.mediaRange.endSeconds <= duration) return [];
  return [
    diagnostic(
      'invalid-quality-target',
      `Requested review range ends at ${target.mediaRange.endSeconds}s, beyond the ${duration}s timeline.`,
      'error',
      ['target', 'mediaRange'],
    ),
  ];
}

function getProjectDuration(document: ProjectData): number {
  return document.tracks.reduce(
    (projectEnd, track) =>
      track.elements.reduce(
        (trackEnd, element) =>
          Math.max(
            trackEnd,
            element.startTime + element.duration - element.trimStart - element.trimEnd,
          ),
        projectEnd,
      ),
    0,
  );
}

function createCutSnapshotRef(project: QualityProjectRef, contentDigest: string): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'neko-cut',
    kind: 'document',
    source: {
      kind: 'document',
      uri: project.documentUri,
      identity: { hash: contentDigest },
      metadata: { domain: 'cut', projectRevision: project.projectRevision },
    },
    locator: { kind: 'file', uri: project.documentUri },
    fingerprint: { strategy: 'hash', value: contentDigest },
  });
}

function mapNkvDiagnostic(input: {
  readonly field: string;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}): QualityDiagnostic {
  return diagnostic(
    'invalid-quality-target',
    `NKV ${input.message}`,
    input.severity,
    input.field ? input.field.split('.').filter(Boolean) : undefined,
  );
}

function projectFileDiagnostic(input: {
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly path?: readonly (string | number)[];
}): QualityDiagnostic {
  return diagnostic('invalid-quality-target', input.message, input.severity, input.path);
}

function successResult<TData>(
  request: ProjectQualityRequest,
  operation: ProjectQualityResult<TData>['operation'],
  data: TData,
  diagnostics: readonly QualityDiagnostic[] = [],
): ProjectQualityResult<TData> {
  return {
    version: PROJECT_QUALITY_CONTRACT_VERSION,
    requestId: request.requestId,
    operation,
    ok: true,
    data,
    diagnostics,
  };
}

function failedResult(
  request: ProjectQualityRequest,
  operation: ProjectQualityResult<never>['operation'],
  ...diagnostics: readonly QualityDiagnostic[]
): ProjectQualityResult<never> {
  return {
    version: PROJECT_QUALITY_CONTRACT_VERSION,
    requestId: request.requestId,
    operation,
    ok: false,
    diagnostics:
      diagnostics.length > 0
        ? diagnostics
        : [diagnostic('quality-evaluator-failed', 'Cut project quality operation failed.')],
  };
}

function diagnostic(
  code: QualityDiagnostic['code'],
  message: string,
  severity: QualityDiagnostic['severity'] = 'error',
  path?: readonly (string | number)[],
): QualityDiagnostic {
  return { code, severity, message, ...(path ? { path } : {}) };
}

function tryDocumentUriToFilePath(documentUri: string): string | undefined {
  if (!documentUri.trim()) return undefined;
  try {
    return documentUri.startsWith('file://') ? fileURLToPath(documentUri) : documentUri;
  } catch {
    return undefined;
  }
}

function hasErrors(diagnostics: readonly QualityDiagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === 'error');
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
