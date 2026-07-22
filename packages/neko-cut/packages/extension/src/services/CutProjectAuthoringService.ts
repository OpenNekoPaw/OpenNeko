import * as path from 'path';
import { fileURLToPath } from 'url';
import type {
  CanvasCutDraftDiagnostic,
  CanvasCutDraftPayload,
  CanvasTimelineSyncPayload,
  NekoProjectAuthoringResult,
  NekoProjectAuthoringTarget,
  ProjectFileDiagnostic,
  ProjectData,
  ProjectSourceAddRequest,
  ProjectSourceAddResult,
} from '@neko/shared';
import {
  NEKO_PROJECT_AUTHORING_CONTRACT_VERSION,
  createNekoProjectAuthoringDiagnostic,
  createNekoProjectAuthoringResult,
} from '@neko/shared';
import { createServiceId } from '../base';
import type { IProjectSessionService } from './ProjectSessionService';
import { ProjectSessionService } from './ProjectSessionService';
import { createNkvProjectRef } from './CutProjectQualityFacade';
import { addCutTimelineClip, type CutTimelineClipMediaType } from './cutTimelineAuthoring';
import {
  addCutStoryboardToTimeline,
  normalizeCutStoryboardImportPayload,
  projectCanvasCutDraftToStoryboardImportResult,
  type CutStoryboardImportPayload,
  type CutStoryboardTimelineRef,
} from './cutStoryboardAuthoring';
import {
  validateCutProjectAuthoringTarget,
  type CutProjectAuthoringTargetMode,
} from './cutProjectAuthoringTarget';

export interface CutProjectAuthoringCreateOptions {
  readonly name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
}

export interface CutProjectAuthoringLoadRequest {
  readonly target: NekoProjectAuthoringTarget;
}

export interface CutProjectAuthoringCreateRequest {
  readonly target: NekoProjectAuthoringTarget;
  readonly options?: CutProjectAuthoringCreateOptions;
}

export interface CutProjectAuthoringUpdateRequest {
  readonly target: NekoProjectAuthoringTarget;
  readonly expectedProjectRevision?: string;
  readonly projectData: ProjectData;
}

export interface CutProjectAuthoringImportGeneratedClipRequest {
  readonly target: NekoProjectAuthoringTarget;
  readonly expectedProjectRevision?: string;
  readonly sourcePath?: string;
  readonly bytes?: Uint8Array;
  readonly name?: string;
  readonly mediaType?: CutTimelineClipMediaType;
  readonly duration?: number;
  readonly startTime?: number;
  readonly trackId?: string;
  readonly trackIndex?: number;
  readonly requestId?: string;
  readonly createProjectOptions?: CutProjectAuthoringCreateOptions;
}

export interface CutProjectAuthoringImportMediaSourceRequest {
  readonly target: NekoProjectAuthoringTarget;
  readonly expectedProjectRevision?: string;
  readonly sourcePath: string;
  readonly name?: string;
  readonly mediaType?: CutTimelineClipMediaType;
  readonly duration?: number;
  readonly startTime?: number;
  readonly trackId?: string;
  readonly trackIndex?: number;
  readonly requestId?: string;
  readonly createProjectOptions?: CutProjectAuthoringCreateOptions;
}

export interface CutProjectAuthoringImportStoryboardRequest {
  readonly target: NekoProjectAuthoringTarget;
  readonly expectedProjectRevision?: string;
  readonly payload: unknown;
  readonly createProjectOptions?: CutProjectAuthoringCreateOptions;
}

export interface CutProjectAuthoringImportCanvasDraftRequest {
  readonly target: NekoProjectAuthoringTarget;
  readonly expectedProjectRevision?: string;
  readonly payload: CanvasCutDraftPayload;
  readonly createProjectOptions?: CutProjectAuthoringCreateOptions;
}

export interface CutProjectAuthoringImportedClip {
  readonly sourcePath: string;
  readonly mediaType: CutTimelineClipMediaType;
  readonly trackId: string;
  readonly elementId: string;
  readonly createdTrack: boolean;
  readonly startTime: number;
  readonly duration: number;
  readonly sourceIngest: ProjectSourceAddResult;
}

export interface CutProjectAuthoringImportedStoryboard {
  readonly projectName: string;
  readonly shotCount: number;
  readonly refs: readonly CutStoryboardTimelineRef[];
  readonly importedAt: number;
  readonly syncPayload: CanvasTimelineSyncPayload;
}

export type CutProjectSourceIngest = (
  documentUri: string,
  request: ProjectSourceAddRequest,
) => Promise<ProjectSourceAddResult>;

export interface CutProjectAuthoringServiceOptions {
  readonly ingestSource?: CutProjectSourceIngest;
  readonly createId?: () => string;
  readonly createProjectSession?: () => IProjectSessionService;
}

export interface ICutProjectAuthoringService {
  loadProject(
    request: CutProjectAuthoringLoadRequest,
  ): Promise<NekoProjectAuthoringResult<ProjectData>>;
  createProject(
    request: CutProjectAuthoringCreateRequest,
  ): Promise<NekoProjectAuthoringResult<ProjectData>>;
  updateProjectData(
    request: CutProjectAuthoringUpdateRequest,
  ): Promise<NekoProjectAuthoringResult<ProjectData>>;
  importGeneratedClip(
    request: CutProjectAuthoringImportGeneratedClipRequest,
  ): Promise<NekoProjectAuthoringResult<CutProjectAuthoringImportedClip>>;
  importMediaSource(
    request: CutProjectAuthoringImportMediaSourceRequest,
  ): Promise<NekoProjectAuthoringResult<CutProjectAuthoringImportedClip>>;
  importStoryboard(
    request: CutProjectAuthoringImportStoryboardRequest,
  ): Promise<NekoProjectAuthoringResult<CutProjectAuthoringImportedStoryboard>>;
  importCanvasDraft(
    request: CutProjectAuthoringImportCanvasDraftRequest,
  ): Promise<NekoProjectAuthoringResult<CutProjectAuthoringImportedStoryboard>>;
}

export const ICutProjectAuthoringService = createServiceId<ICutProjectAuthoringService>(
  'cutProjectAuthoringService',
);

export class CutProjectAuthoringService implements ICutProjectAuthoringService {
  constructor(
    private readonly projectSession: IProjectSessionService = new ProjectSessionService(),
    private readonly options: CutProjectAuthoringServiceOptions = {},
  ) {}

  async loadProject(
    request: CutProjectAuthoringLoadRequest,
  ): Promise<NekoProjectAuthoringResult<ProjectData>> {
    const target = resolveFileBackedTarget(request.target, 'existing');
    if (!target.ok) return target.result;
    const { projectSession, dispose } = this.createOperationProjectSession();

    try {
      await projectSession.load(target.filePath);
      const project = projectSession.getProjectData();
      if (!project) {
        return failedResult(
          request.target,
          'write-failed',
          'Cut project loaded without project data.',
        );
      }
      return createNekoProjectAuthoringResult({
        ok: true,
        documentUri: target.documentUri,
        target: {
          kind: 'file',
          documentUri: target.documentUri,
          created: false,
          reveal: request.target.reveal ?? false,
        },
        created: false,
        revealed: false,
        projectRef: createNkvProjectRef(target.documentUri, project),
        diagnostics: [],
        data: project,
      });
    } catch (error) {
      return failedResult(
        request.target,
        'write-failed',
        formatError(error, 'Failed to load Cut project.'),
      );
    } finally {
      dispose();
    }
  }

  async createProject(
    request: CutProjectAuthoringCreateRequest,
  ): Promise<NekoProjectAuthoringResult<ProjectData>> {
    const target = resolveFileBackedTarget(request.target, 'create');
    if (!target.ok) return target.result;
    const { projectSession, dispose } = this.createOperationProjectSession();

    try {
      await projectSession.createFile(target.filePath, request.options);
      const project = projectSession.getProjectData();
      if (!project) {
        return failedResult(
          request.target,
          'write-failed',
          'Cut project created without project data.',
        );
      }
      return createNekoProjectAuthoringResult({
        ok: true,
        documentUri: target.documentUri,
        target: {
          kind: 'new',
          documentUri: target.documentUri,
          title: request.target.title,
          created: true,
          reveal: request.target.reveal ?? false,
        },
        created: true,
        revealed: false,
        projectRef: createNkvProjectRef(target.documentUri, project),
        diagnostics: [],
        data: project,
      });
    } catch (error) {
      return failedResult(
        request.target,
        'write-failed',
        formatError(error, 'Failed to create Cut project.'),
      );
    } finally {
      dispose();
    }
  }

  async updateProjectData(
    request: CutProjectAuthoringUpdateRequest,
  ): Promise<NekoProjectAuthoringResult<ProjectData>> {
    const target = resolveFileBackedTarget(request.target, 'existing');
    if (!target.ok) return target.result;
    const { projectSession, dispose } = this.createOperationProjectSession();

    try {
      await projectSession.load(target.filePath);
      const revisionFailure = validateExpectedProjectRevision(
        request.target,
        target.documentUri,
        projectSession.getProjectData(),
        request.expectedProjectRevision,
      );
      if (revisionFailure) return revisionFailure;
      await projectSession.updateProjectData(request.projectData);
      const project = projectSession.getProjectData() ?? request.projectData;
      return createNekoProjectAuthoringResult({
        ok: true,
        documentUri: target.documentUri,
        target: {
          kind: 'file',
          documentUri: target.documentUri,
          created: false,
          reveal: request.target.reveal ?? false,
        },
        created: false,
        revealed: false,
        projectRef: createNkvProjectRef(target.documentUri, project),
        diagnostics: [],
        data: project,
      });
    } catch (error) {
      return failedResult(
        request.target,
        'write-failed',
        formatError(error, 'Failed to update Cut project.'),
      );
    } finally {
      dispose();
    }
  }

  async importGeneratedClip(
    request: CutProjectAuthoringImportGeneratedClipRequest,
  ): Promise<NekoProjectAuthoringResult<CutProjectAuthoringImportedClip>> {
    const target = resolveFileBackedTarget(request.target, 'existing-or-create');
    if (!target.ok) return target.result;
    if (!this.options.ingestSource) {
      return failedResult(
        request.target,
        'authoring-capability-unavailable',
        'Cut generated clip import requires a source ingest port.',
      );
    }
    const { projectSession, dispose } = this.createOperationProjectSession();

    try {
      const created = target.targetKind === 'new';
      if (created) {
        await projectSession.createFile(target.filePath, {
          ...request.createProjectOptions,
          name:
            request.createProjectOptions?.name ??
            request.target.title ??
            request.name ??
            'Generated Clip Timeline',
        });
      } else {
        await projectSession.load(target.filePath);
      }

      const revisionFailure = validateExpectedProjectRevision(
        request.target,
        target.documentUri,
        projectSession.getProjectData(),
        request.expectedProjectRevision,
      );
      if (revisionFailure) return revisionFailure;

      const sourceRequest = createGeneratedClipSourceRequest(request, target.documentUri);
      const sourceIngest = await this.options.ingestSource(target.documentUri, sourceRequest);
      if (!sourceIngest.ok || !sourceIngest.durablePath) {
        const diagnostics = sourceDiagnosticsToAuthoringDiagnostics(sourceIngest.diagnostics);
        return createNekoProjectAuthoringResult<CutProjectAuthoringImportedClip>({
          ok: false,
          documentUri: target.documentUri,
          created,
          revealed: false,
          target: {
            kind: target.targetKind,
            documentUri: target.documentUri,
            title: request.target.title,
            created,
            reveal: request.target.reveal ?? false,
          },
          diagnostics:
            diagnostics.length > 0
              ? diagnostics
              : [
                  createNekoProjectAuthoringDiagnostic({
                    code: 'source-resolution-failed',
                    message: 'Cut generated clip source ingest did not produce a durable path.',
                  }),
                ],
        });
      }

      if (!created && request.expectedProjectRevision) {
        await projectSession.load(target.filePath);
        const postIngestRevisionFailure = validateExpectedProjectRevision(
          request.target,
          target.documentUri,
          projectSession.getProjectData(),
          request.expectedProjectRevision,
        );
        if (postIngestRevisionFailure) return postIngestRevisionFailure;
      }

      const project = projectSession.getProjectData();
      if (!project) {
        return failedResult(
          request.target,
          'write-failed',
          'Cut project loaded without project data.',
        );
      }

      const clip = addCutTimelineClip({
        projectData: project,
        sourcePath: sourceIngest.durablePath,
        name: resolveClipName(request, sourceIngest.durablePath),
        mediaType: request.mediaType ?? inferClipMediaType(sourceIngest.durablePath),
        ...(request.duration !== undefined ? { duration: request.duration } : {}),
        ...(request.startTime !== undefined ? { startTime: request.startTime } : {}),
        ...(request.trackId ? { trackId: request.trackId } : {}),
        ...(request.trackIndex !== undefined ? { trackIndex: request.trackIndex } : {}),
        ...(this.options.createId ? { createId: this.options.createId } : {}),
      });
      await projectSession.updateProjectData(clip.projectData);

      return createNekoProjectAuthoringResult({
        ok: true,
        documentUri: target.documentUri,
        target: {
          kind: target.targetKind,
          documentUri: target.documentUri,
          title: request.target.title,
          created,
          reveal: request.target.reveal ?? false,
        },
        created,
        revealed: false,
        projectRef: createNkvProjectRef(target.documentUri, clip.projectData),
        diagnostics: [],
        data: {
          sourcePath: clip.sourcePath,
          mediaType: clip.mediaType,
          trackId: clip.trackId,
          elementId: clip.elementId,
          createdTrack: clip.createdTrack,
          startTime: clip.startTime,
          duration: clip.duration,
          sourceIngest,
        },
      });
    } catch (error) {
      return failedResult(
        request.target,
        'write-failed',
        formatError(error, 'Failed to import generated clip into Cut project.'),
      );
    } finally {
      dispose();
    }
  }

  async importMediaSource(
    request: CutProjectAuthoringImportMediaSourceRequest,
  ): Promise<NekoProjectAuthoringResult<CutProjectAuthoringImportedClip>> {
    const target = resolveFileBackedTarget(request.target, 'existing-or-create');
    if (!target.ok) return target.result;
    if (!this.options.ingestSource) {
      return failedResult(
        request.target,
        'authoring-capability-unavailable',
        'Cut media source import requires a source ingest port.',
      );
    }
    const { projectSession, dispose } = this.createOperationProjectSession();

    try {
      const created = target.targetKind === 'new';
      if (created) {
        await projectSession.createFile(target.filePath, {
          ...request.createProjectOptions,
          name:
            request.createProjectOptions?.name ??
            request.target.title ??
            request.name ??
            'Media Timeline',
        });
      } else {
        await projectSession.load(target.filePath);
      }

      const revisionFailure = validateExpectedProjectRevision(
        request.target,
        target.documentUri,
        projectSession.getProjectData(),
        request.expectedProjectRevision,
      );
      if (revisionFailure) return revisionFailure;

      const sourceRequest = createMediaSourceAddRequest(request, target.documentUri);
      const sourceIngest = await this.options.ingestSource(target.documentUri, sourceRequest);
      if (!sourceIngest.ok || !sourceIngest.durablePath) {
        const diagnostics = sourceDiagnosticsToAuthoringDiagnostics(sourceIngest.diagnostics);
        return createNekoProjectAuthoringResult<CutProjectAuthoringImportedClip>({
          ok: false,
          documentUri: target.documentUri,
          created,
          revealed: false,
          target: {
            kind: target.targetKind,
            documentUri: target.documentUri,
            title: request.target.title,
            created,
            reveal: request.target.reveal ?? false,
          },
          diagnostics:
            diagnostics.length > 0
              ? diagnostics
              : [
                  createNekoProjectAuthoringDiagnostic({
                    code: 'source-resolution-failed',
                    message: 'Cut media source ingest did not produce a durable path.',
                  }),
                ],
        });
      }

      if (!created && request.expectedProjectRevision) {
        await projectSession.load(target.filePath);
        const postIngestRevisionFailure = validateExpectedProjectRevision(
          request.target,
          target.documentUri,
          projectSession.getProjectData(),
          request.expectedProjectRevision,
        );
        if (postIngestRevisionFailure) return postIngestRevisionFailure;
      }

      const project = projectSession.getProjectData();
      if (!project) {
        return failedResult(
          request.target,
          'write-failed',
          'Cut project loaded without project data.',
        );
      }

      const clip = addCutTimelineClip({
        projectData: project,
        sourcePath: sourceIngest.durablePath,
        name: resolveClipName(request, sourceIngest.durablePath),
        mediaType: request.mediaType ?? inferClipMediaType(sourceIngest.durablePath),
        ...(request.duration !== undefined ? { duration: request.duration } : {}),
        ...(request.startTime !== undefined ? { startTime: request.startTime } : {}),
        ...(request.trackId ? { trackId: request.trackId } : {}),
        ...(request.trackIndex !== undefined ? { trackIndex: request.trackIndex } : {}),
        ...(this.options.createId ? { createId: this.options.createId } : {}),
      });
      await projectSession.updateProjectData(clip.projectData);

      return createNekoProjectAuthoringResult({
        ok: true,
        documentUri: target.documentUri,
        target: {
          kind: target.targetKind,
          documentUri: target.documentUri,
          title: request.target.title,
          created,
          reveal: request.target.reveal ?? false,
        },
        created,
        revealed: false,
        projectRef: createNkvProjectRef(target.documentUri, clip.projectData),
        diagnostics: [],
        data: {
          sourcePath: clip.sourcePath,
          mediaType: clip.mediaType,
          trackId: clip.trackId,
          elementId: clip.elementId,
          createdTrack: clip.createdTrack,
          startTime: clip.startTime,
          duration: clip.duration,
          sourceIngest,
        },
      });
    } catch (error) {
      return failedResult(
        request.target,
        'write-failed',
        formatError(error, 'Failed to import media source into Cut project.'),
      );
    } finally {
      dispose();
    }
  }

  async importStoryboard(
    request: CutProjectAuthoringImportStoryboardRequest,
  ): Promise<NekoProjectAuthoringResult<CutProjectAuthoringImportedStoryboard>> {
    const payload = normalizeCutStoryboardImportPayload(request.payload);
    if (!payload) {
      return failedResult(
        request.target,
        'source-resolution-failed',
        'Cut storyboard import requires at least one valid storyboard shot.',
      );
    }
    return this.importStoryboardPayload({
      target: request.target,
      payload,
      expectedProjectRevision: request.expectedProjectRevision,
      createProjectOptions: request.createProjectOptions,
    });
  }

  async importCanvasDraft(
    request: CutProjectAuthoringImportCanvasDraftRequest,
  ): Promise<NekoProjectAuthoringResult<CutProjectAuthoringImportedStoryboard>> {
    const projection = projectCanvasCutDraftToStoryboardImportResult(request.payload);
    if (!projection.ok) {
      return createNekoProjectAuthoringResult<CutProjectAuthoringImportedStoryboard>({
        ok: false,
        diagnostics: canvasDraftDiagnosticsToAuthoringDiagnostics(projection.diagnostics),
      });
    }
    return this.importStoryboardPayload({
      target: request.target,
      payload: projection.payload,
      expectedProjectRevision: request.expectedProjectRevision,
      createProjectOptions: {
        ...request.createProjectOptions,
        name: request.createProjectOptions?.name ?? projection.payload.projectName,
      },
    });
  }

  private async importStoryboardPayload(request: {
    readonly target: NekoProjectAuthoringTarget;
    readonly payload: CutStoryboardImportPayload;
    readonly expectedProjectRevision?: string;
    readonly createProjectOptions?: CutProjectAuthoringCreateOptions;
  }): Promise<NekoProjectAuthoringResult<CutProjectAuthoringImportedStoryboard>> {
    const target = resolveFileBackedTarget(request.target, 'existing-or-create');
    if (!target.ok) return target.result;
    const { projectSession, dispose } = this.createOperationProjectSession();

    try {
      const created = target.targetKind === 'new';
      if (created) {
        await projectSession.createFile(target.filePath, {
          ...request.createProjectOptions,
          name:
            request.createProjectOptions?.name ??
            request.target.title ??
            request.payload.projectName,
        });
      } else {
        await projectSession.load(target.filePath);
      }

      const revisionFailure = validateExpectedProjectRevision(
        request.target,
        target.documentUri,
        projectSession.getProjectData(),
        request.expectedProjectRevision,
      );
      if (revisionFailure) return revisionFailure;

      const project = projectSession.getProjectData();
      if (!project) {
        return failedResult(
          request.target,
          'write-failed',
          'Cut project loaded without project data.',
        );
      }

      const timeline = addCutStoryboardToTimeline({
        projectData: project,
        payload: request.payload,
        ...(this.options.createId ? { createId: this.options.createId } : {}),
      });
      await projectSession.updateProjectData(timeline.projectData);

      return createNekoProjectAuthoringResult({
        ok: true,
        documentUri: target.documentUri,
        target: {
          kind: target.targetKind,
          documentUri: target.documentUri,
          title: request.target.title,
          created,
          reveal: request.target.reveal ?? false,
        },
        created,
        revealed: false,
        projectRef: createNkvProjectRef(target.documentUri, timeline.projectData),
        diagnostics: [],
        data: {
          projectName: request.payload.projectName,
          shotCount: request.payload.shots.length,
          refs: timeline.refs,
          importedAt: timeline.importedAt,
          syncPayload: timeline.syncPayload,
        },
      });
    } catch (error) {
      return failedResult(
        request.target,
        'write-failed',
        formatError(error, 'Failed to import storyboard into Cut project.'),
      );
    } finally {
      dispose();
    }
  }

  private createOperationProjectSession(): {
    readonly projectSession: IProjectSessionService;
    readonly dispose: () => void;
  } {
    const projectSession = this.options.createProjectSession?.() ?? this.projectSession;
    return {
      projectSession,
      dispose: this.options.createProjectSession ? () => projectSession.dispose() : () => undefined,
    };
  }
}

function validateExpectedProjectRevision<TData>(
  target: NekoProjectAuthoringTarget,
  documentUri: string,
  project: ProjectData | null,
  expectedProjectRevision: string | undefined,
): NekoProjectAuthoringResult<TData> | undefined {
  if (!expectedProjectRevision || target.kind === 'new') return undefined;
  if (!project) {
    return failedResult(target, 'write-failed', 'Cut project loaded without project data.');
  }
  const actualProjectRevision = createNkvProjectRef(documentUri, project).projectRevision;
  if (actualProjectRevision === expectedProjectRevision) return undefined;
  return failedResult(
    target,
    'stale-project-revision',
    `Cut project revision changed: expected ${expectedProjectRevision}, received ${actualProjectRevision}.`,
  );
}

type ResolvedCutAuthoringTarget =
  | {
      readonly ok: true;
      readonly filePath: string;
      readonly documentUri: string;
      readonly targetKind: 'file' | 'new';
    }
  | {
      readonly ok: false;
      readonly result: NekoProjectAuthoringResult<never>;
    };

function resolveFileBackedTarget(
  target: NekoProjectAuthoringTarget,
  mode: CutProjectAuthoringTargetMode,
): ResolvedCutAuthoringTarget {
  const validation = validateCutProjectAuthoringTarget(target, mode);
  if (!validation.ok) {
    return {
      ok: false,
      result: createNekoProjectAuthoringResult({
        ok: false,
        diagnostics: validation.diagnostics,
      }),
    };
  }
  if (!target.documentUri || (target.kind !== 'file' && target.kind !== 'new')) {
    return {
      ok: false,
      result: failedResult(
        target,
        target.kind === 'new' ? 'workspace-required' : 'missing-authoring-target',
        target.kind === 'new'
          ? 'Cut create-new authoring requires an adapter-resolved documentUri.'
          : 'Cut authoring requires documentUri.',
      ),
    };
  }
  return {
    ok: true,
    filePath: documentUriToFilePath(target.documentUri),
    documentUri: target.documentUri,
    targetKind: target.kind,
  };
}

function failedResult<TData = never>(
  target: NekoProjectAuthoringTarget | undefined,
  code: Parameters<typeof createNekoProjectAuthoringDiagnostic>[0]['code'],
  message: string,
): NekoProjectAuthoringResult<TData> {
  return {
    version: NEKO_PROJECT_AUTHORING_CONTRACT_VERSION,
    ok: false,
    diagnostics: [
      createNekoProjectAuthoringDiagnostic({
        code,
        message,
      }),
    ],
    ...(target?.documentUri ? { documentUri: target.documentUri } : {}),
  };
}

function documentUriToFilePath(documentUri: string): string {
  if (documentUri.startsWith('file://')) {
    return fileURLToPath(documentUri);
  }
  return documentUri;
}

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error ? `${fallback} ${error.message}` : fallback;
}

function createGeneratedClipSourceRequest(
  request: CutProjectAuthoringImportGeneratedClipRequest,
  documentUri: string,
): ProjectSourceAddRequest {
  const mediaType =
    request.mediaType ?? inferClipMediaType(request.sourcePath ?? request.name ?? '');
  const fileName = ensureMediaFileExtension(
    request.name ?? basenamePath(request.sourcePath),
    mediaType,
  );
  return {
    requestId: request.requestId ?? `cut-authoring-import-generated-${Date.now()}`,
    kind: 'generated-output',
    formatId: 'nkv',
    documentUri,
    ...(request.sourcePath ? { sourcePath: request.sourcePath } : {}),
    ...(request.bytes ? { bytes: request.bytes } : {}),
    browserFile: {
      name: fileName,
      type: mimeTypeForMedia(fileName, mediaType),
      ...(request.bytes ? { size: request.bytes.byteLength } : {}),
    },
    assetDirectory: 'media',
    metadata: {
      addToTimeline: true,
      mediaType,
      ...(request.duration !== undefined
        ? { duration: request.duration }
        : mediaType === 'image'
          ? { duration: 3 }
          : {}),
      ...(request.startTime !== undefined ? { startTime: request.startTime } : {}),
      ...(request.trackId ? { trackId: request.trackId } : {}),
      ...(request.trackIndex !== undefined ? { trackIndex: request.trackIndex } : {}),
      name: fileName,
      sourceCommand: 'neko.cut.authoring.importGeneratedClip',
    },
  };
}

function createMediaSourceAddRequest(
  request: CutProjectAuthoringImportMediaSourceRequest,
  documentUri: string,
): ProjectSourceAddRequest {
  const mediaType = request.mediaType ?? inferClipMediaType(request.sourcePath);
  const fileName = ensureMediaFileExtension(
    request.name ?? basenamePath(request.sourcePath),
    mediaType,
  );
  return {
    requestId: request.requestId ?? `cut-authoring-add-source-${Date.now()}`,
    kind: 'programmatic',
    formatId: 'nkv',
    documentUri,
    sourcePath: request.sourcePath,
    browserFile: {
      name: fileName,
      type: mimeTypeForMedia(fileName, mediaType),
    },
    assetDirectory: 'media',
    metadata: {
      addToTimeline: true,
      mediaType,
      ...(request.duration !== undefined ? { duration: request.duration } : {}),
      ...(request.startTime !== undefined ? { startTime: request.startTime } : {}),
      ...(request.trackId ? { trackId: request.trackId } : {}),
      ...(request.trackIndex !== undefined ? { trackIndex: request.trackIndex } : {}),
      name: fileName,
      sourceCommand: 'neko.cut.authoring.addSourceToTimeline',
    },
  };
}

function sourceDiagnosticsToAuthoringDiagnostics(
  diagnostics: readonly ProjectFileDiagnostic[],
): ReturnType<typeof createNekoProjectAuthoringDiagnostic>[] {
  return diagnostics.map((diagnostic) =>
    createNekoProjectAuthoringDiagnostic({
      code: mapProjectFileDiagnosticCode(diagnostic.code),
      severity: diagnostic.severity,
      message: diagnostic.message,
      path: diagnostic.path,
      sourceId: diagnostic.sourceId,
      context: diagnostic.context,
      projectFileDiagnostic: diagnostic,
    }),
  );
}

function canvasDraftDiagnosticsToAuthoringDiagnostics(
  diagnostics: readonly CanvasCutDraftDiagnostic[],
): ReturnType<typeof createNekoProjectAuthoringDiagnostic>[] {
  return diagnostics.map((diagnostic) =>
    createNekoProjectAuthoringDiagnostic({
      code: 'source-resolution-failed',
      severity: diagnostic.severity,
      message: diagnostic.message,
      path: diagnostic.path,
      context: {
        code: diagnostic.code,
        ...(diagnostic.routeId ? { routeId: diagnostic.routeId } : {}),
        ...(diagnostic.unitId ? { unitId: diagnostic.unitId } : {}),
        ...(diagnostic.nodeId ? { nodeId: diagnostic.nodeId } : {}),
      },
    }),
  );
}

function mapProjectFileDiagnosticCode(
  code: ProjectFileDiagnostic['code'],
): Parameters<typeof createNekoProjectAuthoringDiagnostic>[0]['code'] {
  if (code === 'runtime-handle-persisted') return 'runtime-handle-persisted';
  if (code === 'cache-source-persisted') return 'cache-source-persisted';
  if (code === 'write-failed' || code === 'codec-save-failed') return 'write-failed';
  return 'source-resolution-failed';
}

function resolveClipName(
  request:
    CutProjectAuthoringImportGeneratedClipRequest | CutProjectAuthoringImportMediaSourceRequest,
  durablePath: string,
): string {
  const mediaType = request.mediaType ?? inferClipMediaType(durablePath);
  return ensureMediaFileExtension(
    request.name ?? basenamePath(request.sourcePath ?? durablePath),
    mediaType,
  );
}

function inferClipMediaType(filePath: string): CutTimelineClipMediaType {
  const ext = extnamePath(filePath).toLowerCase();
  if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext)) return 'audio';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) return 'image';
  return 'video';
}

function ensureMediaFileExtension(name: string, mediaType: CutTimelineClipMediaType): string {
  if (extnamePath(name)) return name;
  if (mediaType === 'image') return `${name}.png`;
  if (mediaType === 'audio') return `${name}.wav`;
  return `${name}.mp4`;
}

function mimeTypeForMedia(filePath: string, mediaType: CutTimelineClipMediaType): string {
  const ext = extnamePath(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (mediaType === 'image') return 'image/png';
  if (mediaType === 'audio') return 'audio/wav';
  return 'video/mp4';
}

function basenamePath(filePath: string | undefined): string {
  if (!filePath) return 'generated-clip';
  return path.basename(filePath);
}

function extnamePath(filePath: string): string {
  return path.extname(filePath);
}
