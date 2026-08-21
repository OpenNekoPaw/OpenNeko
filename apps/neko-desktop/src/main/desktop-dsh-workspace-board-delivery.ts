import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import type {
  DshWorkspaceBoardArtifactDeliveryInput,
  DshWorkspaceBoardArtifactDeliveryOutcome,
  DshWorkspaceBoardArtifactDeliveryPort,
} from '@neko/agent-runtime/application';
import type { ContentReadService } from '@neko/content';
import {
  WorkspaceBoardDeliveryCoordinator,
  WorkspaceBoardDeliveryLedger,
  type CanvasWorkspaceProjectionArtifact,
  type CanvasWorkspaceProjectionRequest,
  type CanvasWorkspaceProjectionResult,
} from '@neko/canvas-domain';
import { WorkspaceBoardNodeMutation } from '@neko/canvas-node';
import type { NekoHostPorts } from '@neko/host/ports';
import type { LocalMetadataStore } from '@neko/local-metadata';
import { hashStableValue } from '@neko/shared';
import type { DesktopWorkspaceRegistry } from './desktop-workspace-registry';

export interface DesktopDshWorkspaceBoardDeliveryOptions {
  readonly applicationInstanceId: string;
  readonly metadataStore: LocalMetadataStore;
  readonly workspaceRegistry: Pick<DesktopWorkspaceRegistry, 'restore'>;
  readonly host: Pick<NekoHostPorts, 'files' | 'diagnostics'>;
  readonly coordinateCanvasMutation: <TResult>(
    workspaceId: string,
    operation: () => Promise<TResult>,
  ) => Promise<TResult>;
  readonly createContentRead: (workspacePath: string) => Pick<ContentReadService, 'stat'>;
  readonly createIdentity?: () => string;
}

interface WorkspaceBoardBinding {
  readonly workspacePath: string;
  readonly ledger: WorkspaceBoardDeliveryLedger;
  readonly coordinator: WorkspaceBoardDeliveryCoordinator;
}

export class DesktopDshWorkspaceBoardDelivery implements DshWorkspaceBoardArtifactDeliveryPort {
  private readonly bindings = new Map<string, WorkspaceBoardBinding>();
  private readonly createIdentity: () => string;

  constructor(private readonly options: DesktopDshWorkspaceBoardDeliveryOptions) {
    this.createIdentity = options.createIdentity ?? randomUUID;
  }

  async deliver(
    input: DshWorkspaceBoardArtifactDeliveryInput,
  ): Promise<DshWorkspaceBoardArtifactDeliveryOutcome> {
    try {
      const workspace = await this.restoreExactWorkspace(input.workspaceId);
      const binding = this.bindingFor(workspace);
      const deliveryId = createDshWorkspaceBoardProjectionRequest(input, workspace).process
        .deliveryId;
      if (await binding.ledger.getReceipt(deliveryId)) return { status: 'accepted' };
      const results = await this.options.coordinateCanvasMutation(
        workspace.workspaceId,
        async () => {
          const resumed = await binding.coordinator.flush();
          if (await binding.ledger.getReceipt(deliveryId)) return resumed;
          const existing = (await binding.ledger.listPending()).some(
            (task) => task.request.process.deliveryId === deliveryId,
          );
          if (existing) return resumed;
          const request = createDshWorkspaceBoardProjectionRequest(
            await this.resolveSourceFingerprints(input, workspace),
            workspace,
          );
          return [...resumed, ...(await binding.coordinator.enqueue(request))];
        },
      );
      const blocked = results.find(
        (result) =>
          result.deliveryId === deliveryId &&
          (result.status === 'blocked' || result.status === 'conflict'),
      );
      return blocked ? this.blockedOutcome(workspace.workspaceId, blocked) : { status: 'accepted' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = message.startsWith('workspace-board-open-session-dirty:')
        ? 'workspace-board-open-session-dirty'
        : 'desktop-dsh-workspace-board-delivery-failed';
      this.reportBlocked(input.workspaceId, code, message);
      return { status: 'blocked', diagnostic: { code, message } };
    }
  }

  private async resolveSourceFingerprints(
    input: DshWorkspaceBoardArtifactDeliveryInput,
    workspace: AssetWorkspaceResolution,
  ): Promise<DshWorkspaceBoardArtifactDeliveryInput> {
    const contentRead = this.options.createContentRead(workspace.workspacePath);
    return resolveDshWorkspaceBoardSourceFingerprints(input, contentRead);
  }

  private async restoreExactWorkspace(workspaceId: string): Promise<AssetWorkspaceResolution> {
    if (!this.options.workspaceRegistry.restore) {
      throw new Error('Desktop Workspace registry cannot restore an exact Workspace identity.');
    }
    const workspace = await this.options.workspaceRegistry.restore(workspaceId);
    if (workspace.workspaceId !== workspaceId) {
      throw new Error(
        `Workspace Board delivery resolved '${workspace.workspaceId}' instead of '${workspaceId}'.`,
      );
    }
    return workspace;
  }

  private bindingFor(workspace: AssetWorkspaceResolution): WorkspaceBoardBinding {
    const existing = this.bindings.get(workspace.workspaceId);
    if (existing?.workspacePath === workspace.workspacePath) return existing;
    const ledger = new WorkspaceBoardDeliveryLedger({
      metadataStore: this.options.metadataStore,
      workspaceId: workspace.workspaceId,
      createIdentity: this.createIdentity,
    });
    const coordinator = new WorkspaceBoardDeliveryCoordinator({
      ledger,
      mutation: new WorkspaceBoardNodeMutation({
        workspace,
        host: this.options.host,
        createIdentity: this.createIdentity,
      }),
      holderId: `${this.options.applicationInstanceId}:${workspace.workspaceId}`,
    });
    const binding = {
      workspacePath: workspace.workspacePath,
      ledger,
      coordinator,
    };
    this.bindings.set(workspace.workspaceId, binding);
    return binding;
  }

  private blockedOutcome(
    workspaceId: string,
    result: CanvasWorkspaceProjectionResult,
  ): DshWorkspaceBoardArtifactDeliveryOutcome {
    const diagnostic = result.diagnostics[0];
    const code = diagnostic?.code ?? `workspace-board-${result.status}`;
    const message = diagnostic?.message ?? `Workspace Board delivery ended as ${result.status}.`;
    this.reportBlocked(workspaceId, code, message);
    return { status: 'blocked', diagnostic: { code, message } };
  }

  private reportBlocked(workspaceId: string, code: string, message: string): void {
    this.options.host.diagnostics?.report({
      code,
      severity: 'error',
      message,
      metadata: { workspaceId },
    });
  }
}

export async function resolveDshWorkspaceBoardSourceFingerprints(
  input: DshWorkspaceBoardArtifactDeliveryInput,
  contentRead: Pick<ContentReadService, 'stat'>,
): Promise<DshWorkspaceBoardArtifactDeliveryInput> {
  const artifacts = await Promise.all(
    input.artifacts.map(async (artifact) => {
      if (artifact.role !== 'source') return artifact;
      const source = await contentRead.stat(artifact.contentLocator);
      if (source.status === 'unavailable') {
        throw new Error(`DSH Workspace Board source is unavailable: ${source.diagnostic.code}.`);
      }
      return {
        ...artifact,
        contentFingerprint: `content:${source.fingerprint.strategy}:${source.fingerprint.value}`,
      };
    }),
  );
  return { ...input, artifacts };
}

export function createDshWorkspaceBoardProjectionRequest(
  input: DshWorkspaceBoardArtifactDeliveryInput,
  workspace: AssetWorkspaceResolution,
): CanvasWorkspaceProjectionRequest {
  if (input.artifacts.length === 0) {
    throw new Error('DSH Workspace Board delivery requires at least one artifact.');
  }
  const deliveryId = `dsh-turn:${hashStableValue({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    dshSessionId: input.dshSessionId,
    turn: input.turn,
    target: 'workspace-board',
  })}`;
  const createdAt = new Date(input.completedAt).toISOString();
  return {
    target: {
      workspaceId: workspace.workspaceId,
      workspaceUri: pathToFileURL(workspace.workspacePath).href,
    },
    process: {
      deliveryId,
      sourceHost: 'desktop',
      createdAt,
      operationId: `${input.dshSessionId}:turn:${input.turn}`,
    },
    artifacts: input.artifacts.map((artifact): CanvasWorkspaceProjectionArtifact => {
      const provenance = {
        deliveryId,
        artifactId: artifact.artifactId,
        contentFingerprint: artifact.contentFingerprint,
        kind: artifact.kind,
        role: artifact.role,
        sourceId: artifact.sourceId,
        ...('sourceArtifactIds' in artifact
          ? { sourceArtifactIds: artifact.sourceArtifactIds }
          : {}),
        operationId: `${input.dshSessionId}:turn:${input.turn}`,
        createdAt,
      };
      return artifact.kind === 'markdown'
        ? {
            kind: 'markdown',
            title: artifact.title,
            markdown: artifact.markdown,
            provenance,
          }
        : {
            kind: artifact.kind,
            title: artifact.title,
            contentLocator: artifact.contentLocator,
            provenance,
          };
    }),
  };
}
