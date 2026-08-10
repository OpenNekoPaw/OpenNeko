import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { AgentCreatorVisibleArtifactDeliveryPort } from '@neko/agent-runtime/runtime';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
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

export interface DesktopWorkspaceBoardDeliveryOptions {
  readonly applicationInstanceId: string;
  readonly metadataStore: LocalMetadataStore;
  readonly workspaceRegistry: Pick<DesktopWorkspaceRegistry, 'restore'>;
  readonly host: Pick<NekoHostPorts, 'files' | 'diagnostics'>;
  readonly coordinateCanvasMutation: <TResult>(
    workspaceId: string,
    operation: () => Promise<TResult>,
  ) => Promise<TResult>;
  readonly createIdentity?: () => string;
}

interface WorkspaceBoardBinding {
  readonly workspacePath: string;
  readonly coordinator: WorkspaceBoardDeliveryCoordinator;
}

export class DesktopWorkspaceBoardDelivery implements AgentCreatorVisibleArtifactDeliveryPort {
  private readonly bindings = new Map<string, WorkspaceBoardBinding>();
  private readonly createIdentity: () => string;

  constructor(private readonly options: DesktopWorkspaceBoardDeliveryOptions) {
    this.createIdentity = options.createIdentity ?? randomUUID;
  }

  async deliver(
    input: Parameters<AgentCreatorVisibleArtifactDeliveryPort['deliver']>[0],
  ): ReturnType<AgentCreatorVisibleArtifactDeliveryPort['deliver']> {
    try {
      const workspace = await this.restoreExactWorkspace(input.workspaceId);
      const coordinator = this.coordinatorFor(workspace);
      const results = await this.options.coordinateCanvasMutation(workspace.workspaceId, () =>
        coordinator.enqueue(createAgentBoardProjectionRequest(input, workspace)),
      );
      const blocked = results.find(
        (result) => result.status === 'blocked' || result.status === 'conflict',
      );
      if (blocked) return this.blockedOutcome(input.workspaceId, blocked);
      return { status: 'accepted' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = message.startsWith('workspace-board-open-session-dirty:')
        ? 'workspace-board-open-session-dirty'
        : 'desktop-workspace-board-delivery-failed';
      this.reportBlocked(input.workspaceId, code, message);
      return {
        status: 'blocked',
        diagnostic: { code, message },
      };
    }
  }

  async flushWorkspace(workspace: AssetWorkspaceResolution): Promise<void> {
    try {
      const results = await this.options.coordinateCanvasMutation(workspace.workspaceId, () =>
        this.coordinatorFor(workspace).flush(),
      );
      for (const result of results) {
        if (result.status === 'blocked' || result.status === 'conflict') {
          this.blockedOutcome(workspace.workspaceId, result);
        }
      }
    } catch (error) {
      this.reportBlocked(
        workspace.workspaceId,
        'desktop-workspace-board-resume-failed',
        error instanceof Error ? error.message : String(error),
      );
    }
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

  private coordinatorFor(workspace: AssetWorkspaceResolution): WorkspaceBoardDeliveryCoordinator {
    const existing = this.bindings.get(workspace.workspaceId);
    if (existing?.workspacePath === workspace.workspacePath) return existing.coordinator;
    const coordinator = new WorkspaceBoardDeliveryCoordinator({
      ledger: new WorkspaceBoardDeliveryLedger({
        metadataStore: this.options.metadataStore,
        workspaceId: workspace.workspaceId,
        createIdentity: this.createIdentity,
      }),
      mutation: new WorkspaceBoardNodeMutation({
        workspace,
        host: this.options.host,
        createIdentity: this.createIdentity,
      }),
      holderId: `${this.options.applicationInstanceId}:${workspace.workspaceId}`,
    });
    this.bindings.set(workspace.workspaceId, {
      workspacePath: workspace.workspacePath,
      coordinator,
    });
    return coordinator;
  }

  private blockedOutcome(
    workspaceId: string,
    result: CanvasWorkspaceProjectionResult,
  ): Awaited<ReturnType<AgentCreatorVisibleArtifactDeliveryPort['deliver']>> {
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

function createAgentBoardProjectionRequest(
  input: Parameters<AgentCreatorVisibleArtifactDeliveryPort['deliver']>[0],
  workspace: AssetWorkspaceResolution,
): CanvasWorkspaceProjectionRequest {
  if (input.artifacts.length === 0) {
    throw new Error('Workspace Board delivery requires at least one creator-visible artifact.');
  }
  const deliveryId = `agent-turn:${hashStableValue({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    turnId: input.turnId,
    runId: input.runId,
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
      operationId: input.turnId,
      runId: input.runId,
    },
    artifacts: input.artifacts.map((artifact): CanvasWorkspaceProjectionArtifact => {
      const provenance = {
        deliveryId,
        artifactId: artifact.artifactId,
        contentFingerprint: artifact.contentFingerprint,
        kind: artifact.kind,
        role: artifact.role,
        sourceId: artifact.sourceId,
        ...(artifact.sourceArtifactIds ? { sourceArtifactIds: artifact.sourceArtifactIds } : {}),
        operationId: input.turnId,
        runId: input.runId,
        createdAt,
      };
      if (artifact.kind === 'markdown') {
        if (!artifact.markdown?.trim()) {
          throw new Error(`Markdown artifact '${artifact.artifactId}' has no durable content.`);
        }
        return { kind: 'markdown', title: artifact.title, markdown: artifact.markdown, provenance };
      }
      if (!artifact.contentLocator) {
        throw new Error(
          `Resource artifact '${artifact.artifactId}' has no durable content locator.`,
        );
      }
      return {
        kind: artifact.kind,
        title: artifact.title,
        contentLocator: artifact.contentLocator,
        provenance,
        ...(artifact.mimeType ? { mimeType: artifact.mimeType } : {}),
        ...(artifact.generation ? { generation: artifact.generation } : {}),
        ...(artifact.intrinsicDimensions
          ? { intrinsicDimensions: artifact.intrinsicDimensions }
          : {}),
      };
    }),
  };
}
