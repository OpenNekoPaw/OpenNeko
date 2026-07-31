import {
  createWorkspaceMediaLibrarySyncMetadataBinding,
  type LocalMetadataRepositories,
} from '@neko/shared/local-metadata';
import {
  DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
  parseDesktopProjectPortabilityExecuteRequest,
  parseDesktopProjectPortabilityRequest,
  parseDesktopProjectPortabilityResumeRequest,
  type DesktopProjectPortabilityCancelResult,
  type DesktopProjectPortabilityExecuteResult,
  type DesktopProjectPortabilityIdentity,
  type DesktopProjectPortabilityInspectResult,
  type DesktopProjectPortabilityPlanResult,
  type DesktopProjectPortabilityProgressEvent,
} from '../shared/project-portability-contract';
import { DesktopPortableMediaLibrarySnapshotService } from './desktop-portable-media-library-snapshot';
import { DesktopWorkspaceMediaLibrarySyncService } from './desktop-workspace-media-library-sync';
import type { DesktopWorkspaceResolution } from './desktop-workspace-registry';

export interface DesktopProjectPortabilityShellPort {
  getProjection(windowId: string): Promise<{ readonly endpointEpoch: string }>;
  resolveProjectWorkspace(projectId: string): Promise<DesktopWorkspaceResolution>;
}

export class DesktopProjectPortabilityRuntime {
  private readonly syncService: DesktopWorkspaceMediaLibrarySyncService;
  private readonly snapshotService: DesktopPortableMediaLibrarySnapshotService;
  private readonly eventSequences = new Map<string, number>();

  constructor(
    private readonly options: {
      readonly globalMediaLibraryRoot: string;
      readonly metadataRepositories: LocalMetadataRepositories;
      readonly shell: DesktopProjectPortabilityShellPort;
      readonly selectDestination: (input: {
        readonly windowId: string;
        readonly projectDisplayName: string;
      }) => Promise<string | undefined>;
    },
  ) {
    this.syncService = new DesktopWorkspaceMediaLibrarySyncService(
      options.globalMediaLibraryRoot,
      options.metadataRepositories,
    );
    this.snapshotService = new DesktopPortableMediaLibrarySnapshotService({
      metadataRepositories: options.metadataRepositories,
      syncService: this.syncService,
    });
  }

  async inspect(windowId: string, value: unknown): Promise<DesktopProjectPortabilityInspectResult> {
    const request = parseDesktopProjectPortabilityRequest(value);
    const context = await this.resolveContext(windowId, request.identity);
    const [projection, resumableSnapshot] = await Promise.all([
      this.syncService.inspect(context.workspace),
      createWorkspaceMediaLibrarySyncMetadataBinding({
        workspaceId: context.workspace.workspaceId,
        repositories: this.options.metadataRepositories,
      }).findResumableSnapshot(),
    ]);
    return {
      version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
      requestId: request.requestId,
      identity: request.identity,
      portability: projection.portability,
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
      workspace: context.workspace,
      destinationPath,
    });
    return {
      version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
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
      workspace: context.workspace,
      snapshotId: request.snapshotId,
      destinationPath,
    });
    return {
      version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
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
      workspace: context.workspace,
      snapshotId: request.snapshotId,
      expectedOperationRevision: request.expectedOperationRevision,
      onProgress: (progress) => {
        const sequence = (this.eventSequences.get(progress.snapshotId) ?? 0) + 1;
        this.eventSequences.set(progress.snapshotId, sequence);
        publish({
          version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
          sequence,
          identity: request.identity,
          progress,
        });
      },
    });
    return {
      version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
      requestId: request.requestId,
      identity: request.identity,
      snapshotId: result.snapshotId,
      requirementRevision: result.requirementRevision,
      status: 'completed',
      ...(result.metadataDiagnostic ? { metadataDiagnostic: result.metadataDiagnostic } : {}),
    };
  }

  async cancel(windowId: string, value: unknown): Promise<DesktopProjectPortabilityCancelResult> {
    const request = parseDesktopProjectPortabilityResumeRequest(value);
    const context = await this.resolveContext(windowId, request.identity);
    await this.snapshotService.cancel({
      workspace: context.workspace,
      snapshotId: request.snapshotId,
    });
    return {
      version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
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
  ): Promise<{ readonly workspace: DesktopWorkspaceResolution }> {
    if (identity.windowId !== windowId) {
      throw new Error('Project portability Window identity is stale.');
    }
    const [projection, workspace] = await Promise.all([
      this.options.shell.getProjection(windowId),
      this.options.shell.resolveProjectWorkspace(identity.projectId),
    ]);
    if (
      projection.endpointEpoch !== identity.endpointEpoch ||
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
    version: DESKTOP_PROJECT_PORTABILITY_CONTRACT_VERSION,
    requestId,
    identity,
    status: 'cancelled',
  };
}
