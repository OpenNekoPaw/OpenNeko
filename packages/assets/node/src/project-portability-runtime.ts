import { type LocalMetadataRepositories } from '@neko/local-metadata';
import { createWorkspaceMediaLibrarySyncMetadataBinding } from './workspace-media-library-sync-binding';
import {
  parseDesktopProjectPortabilityExecuteRequest,
  parseDesktopProjectPortabilityRequest,
  parseDesktopProjectPortabilityResumeRequest,
  type DesktopProjectPortabilityCancelResult,
  type DesktopProjectPortabilityExecuteResult,
  type DesktopProjectPortabilityIdentity,
  type DesktopProjectPortabilityInspectResult,
  type DesktopProjectPortabilityPlanResult,
  type DesktopProjectPortabilityProgressEvent,
} from '@neko/assets-domain/contracts';
import { PortableMediaLibrarySnapshotService } from './portable-media-library-snapshot';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { inspectProjectMediaLibraryPortability } from './project-media-library-portability';

export interface ProjectPortabilityShellPort {
  getProjection(windowId: string): Promise<{ readonly rendererSessionId: string }>;
  resolveProjectWorkspace(projectId: string): Promise<AssetWorkspaceResolution>;
}

export class ProjectPortabilityRuntime {
  private readonly snapshotService: PortableMediaLibrarySnapshotService;
  private readonly eventSequences = new Map<string, number>();

  constructor(
    private readonly options: {
      readonly globalMediaLibraryRoot: string;
      readonly metadataRepositories: LocalMetadataRepositories;
      readonly shell: ProjectPortabilityShellPort;
      readonly selectDestination: (input: {
        readonly windowId: string;
        readonly projectDisplayName: string;
      }) => Promise<string | undefined>;
    },
  ) {
    this.snapshotService = new PortableMediaLibrarySnapshotService({
      metadataRepositories: options.metadataRepositories,
      globalMediaLibraryRoot: options.globalMediaLibraryRoot,
    });
  }

  async inspect(windowId: string, value: unknown): Promise<DesktopProjectPortabilityInspectResult> {
    const request = parseDesktopProjectPortabilityRequest(value);
    const context = await this.resolveContext(windowId, request.identity);
    const inspection = await inspectProjectMediaLibraryPortability({
      projectId: request.identity.projectId,
      workspace: context.workspace,
      globalMediaLibraryRoot: this.options.globalMediaLibraryRoot,
    });
    const metadata = createWorkspaceMediaLibrarySyncMetadataBinding({
      workspaceId: context.workspace.workspaceId,
      repositories: this.options.metadataRepositories,
    });
    const [resumableSnapshot, completedSnapshot] = await Promise.all([
      metadata.findResumableSnapshot(),
      inspection.references.requirements.coverage === 'complete'
        ? metadata.findCompletedSnapshot(inspection.references.requirements.fingerprint)
        : Promise.resolve(null),
    ]);
    return {
      requestId: request.requestId,
      identity: request.identity,
      portability: completedSnapshot
        ? { ...inspection.portability, state: 'portable-snapshot-ready' }
        : inspection.portability,
      ...(resumableSnapshot ? { resumableSnapshot } : {}),
    };
  }

  async plan(windowId: string, value: unknown): Promise<DesktopProjectPortabilityPlanResult> {
    const request = parseDesktopProjectPortabilityRequest(value);
    const context = await this.resolveContext(windowId, request.identity);
    const destinationPath = await this.options.selectDestination({
      windowId,
      projectDisplayName: context.workspace.displayName,
    });
    if (!destinationPath) return cancelledPlan(request.requestId, request.identity);
    const plan = await this.snapshotService.plan({
      projectId: request.identity.projectId,
      workspace: context.workspace,
      destinationPath,
    });
    return {
      requestId: request.requestId,
      identity: request.identity,
      status: 'planned',
      plan,
    };
  }

  async resume(windowId: string, value: unknown): Promise<DesktopProjectPortabilityPlanResult> {
    const request = parseDesktopProjectPortabilityResumeRequest(value);
    const context = await this.resolveContext(windowId, request.identity);
    const destinationPath = await this.options.selectDestination({
      windowId,
      projectDisplayName: context.workspace.displayName,
    });
    if (!destinationPath) return cancelledPlan(request.requestId, request.identity);
    const plan = await this.snapshotService.resume({
      projectId: request.identity.projectId,
      workspace: context.workspace,
      snapshotId: request.snapshotId,
      destinationPath,
    });
    return {
      requestId: request.requestId,
      identity: request.identity,
      status: 'planned',
      plan,
    };
  }

  async execute(
    windowId: string,
    value: unknown,
    publish: (event: DesktopProjectPortabilityProgressEvent) => void,
  ): Promise<DesktopProjectPortabilityExecuteResult> {
    const request = parseDesktopProjectPortabilityExecuteRequest(value);
    const context = await this.resolveContext(windowId, request.identity);
    const result = await this.snapshotService.execute({
      projectId: request.identity.projectId,
      workspace: context.workspace,
      snapshotId: request.snapshotId,
      expectedOperationFingerprint: request.expectedOperationFingerprint,
      onProgress: (progress) => {
        const sequence = (this.eventSequences.get(progress.snapshotId) ?? 0) + 1;
        this.eventSequences.set(progress.snapshotId, sequence);
        publish({
          sequence,
          identity: request.identity,
          progress,
        });
      },
    });
    return {
      requestId: request.requestId,
      identity: request.identity,
      snapshotId: result.snapshotId,
      requirementFingerprint: result.requirementFingerprint,
      status: 'completed',
      ...(result.metadataDiagnostic ? { metadataDiagnostic: result.metadataDiagnostic } : {}),
    };
  }

  async cancel(windowId: string, value: unknown): Promise<DesktopProjectPortabilityCancelResult> {
    const request = parseDesktopProjectPortabilityResumeRequest(value);
    const context = await this.resolveContext(windowId, request.identity);
    await this.snapshotService.cancel({
      projectId: request.identity.projectId,
      workspace: context.workspace,
      snapshotId: request.snapshotId,
    });
    return {
      requestId: request.requestId,
      identity: request.identity,
      snapshotId: request.snapshotId,
      status: 'cancelled',
    };
  }

  detachWindow(windowId: string): void {
    void windowId;
    this.eventSequences.clear();
  }

  private async resolveContext(
    windowId: string,
    identity: DesktopProjectPortabilityIdentity,
  ): Promise<{ readonly workspace: AssetWorkspaceResolution }> {
    if (identity.windowId !== windowId) {
      throw new Error('Project portability Window identity is stale.');
    }
    const [projection, workspace] = await Promise.all([
      this.options.shell.getProjection(windowId),
      this.options.shell.resolveProjectWorkspace(identity.projectId),
    ]);
    if (
      projection.rendererSessionId !== identity.rendererSessionId ||
      workspace.workspaceId !== identity.workspaceId
    ) {
      throw new Error('Project portability project identity is stale.');
    }
    return { workspace };
  }
}

function cancelledPlan(
  requestId: string,
  identity: DesktopProjectPortabilityIdentity,
): DesktopProjectPortabilityPlanResult {
  return {
    requestId,
    identity,
    status: 'cancelled',
  };
}
