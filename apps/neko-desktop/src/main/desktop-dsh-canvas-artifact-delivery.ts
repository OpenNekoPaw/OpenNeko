import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import type {
  DshCanvasArtifactDeliveryInput,
  DshCanvasArtifactDeliveryOutcome,
  DshCanvasArtifactDeliveryPort,
} from '@neko/agent-runtime/application';
import { materializeDshCanvasImageOverviews } from '@neko/agent-runtime/application';
import type { DshAcpImageAttachmentReadProjection } from '@neko/agent-contracts/dsh-acp';
import type { CanvasWorkspaceTurnTarget } from '@neko/canvas-domain';
import type { ContentReadService } from '@neko/content-domain';
import {
  createNodeHostContentReadService,
  NodeAuthorizedWorkspaceWriter,
  type NodeDocumentEntryReader,
} from '@neko/content-domain/node';
import {
  CanvasWorkspaceDeliveryCoordinator,
  CanvasWorkspaceDeliveryLedger,
  createGenerationJobWorkspaceDeliveryRequest,
  type CanvasWorkspaceProjectionArtifact,
  type CanvasWorkspaceProjectionRequest,
  type CanvasWorkspaceProjectionResult,
} from '@neko/canvas-domain';
import type { GenerationJobSnapshot } from '@neko/generation-domain/job';
import { CanvasWorkspaceNodeMutation } from '@neko/canvas-node';
import type { NekoHostPorts } from '@neko/host/ports';
import type { LocalMetadataStore } from '@neko/local-metadata';
import { hashStableValue } from '@neko/shared';
import type { DesktopWorkspaceRegistry } from './desktop-workspace-registry';

export interface DesktopDshCanvasArtifactDeliveryOptions {
  readonly applicationInstanceId: string;
  readonly metadataStore: LocalMetadataStore;
  readonly workspaceRegistry: Pick<DesktopWorkspaceRegistry, 'restore'>;
  readonly host: Pick<NekoHostPorts, 'files' | 'diagnostics'>;
  readonly coordinateCanvasMutation: <TResult>(
    target: CanvasWorkspaceTurnTarget,
    operation: () => Promise<TResult>,
  ) => Promise<TResult>;
  readonly createContentRead: (workspacePath: string) => ContentReadService;
  readonly readImageAttachment: (
    sessionId: string,
    attachmentId: string,
  ) => Promise<DshAcpImageAttachmentReadProjection>;
  readonly createIdentity?: () => string;
}

interface CanvasDeliveryBinding {
  readonly workspacePath: string;
  readonly ledger: CanvasWorkspaceDeliveryLedger;
  readonly coordinator: CanvasWorkspaceDeliveryCoordinator;
}

export interface DesktopDshGenerationCanvasProjectionInput {
  readonly workspaceId: string;
  readonly dshSessionId: string;
  readonly turn: number;
  readonly toolCallId: string;
  readonly canvasTurnTarget: CanvasWorkspaceTurnTarget;
  readonly snapshot: GenerationJobSnapshot;
}

export function createDshCanvasArtifactContentRead(input: {
  readonly workspacePath: string;
  readonly documentEntryReader: NodeDocumentEntryReader;
}): ContentReadService {
  return createNodeHostContentReadService({
    workspaceRoot: input.workspacePath,
    documentEntryReader: input.documentEntryReader,
  });
}

export class DesktopDshCanvasArtifactDelivery implements DshCanvasArtifactDeliveryPort {
  private readonly bindings = new Map<string, CanvasDeliveryBinding>();
  private readonly createIdentity: () => string;

  constructor(private readonly options: DesktopDshCanvasArtifactDeliveryOptions) {
    this.createIdentity = options.createIdentity ?? randomUUID;
  }

  async deliver(input: DshCanvasArtifactDeliveryInput): Promise<DshCanvasArtifactDeliveryOutcome> {
    try {
      const workspace = await this.restoreExactWorkspace(input.workspaceId);
      const deliveryId = createDshCanvasArtifactProjectionRequest(input, workspace).process
        .deliveryId;
      const results = await this.enqueueProjection(workspace, deliveryId, async () => {
        await materializeDshCanvasImageOverviews(input, {
          readAttachment: this.options.readImageAttachment,
          contentRead: this.options.createContentRead(workspace.workspacePath),
          writer: new NodeAuthorizedWorkspaceWriter({ workspaceRoot: workspace.workspacePath }),
        });
        return createDshCanvasArtifactProjectionRequest(
          await this.resolveResourceFingerprints(input, workspace),
          workspace,
        );
      });
      const blocked = results.find(
        (result) =>
          result.deliveryId === deliveryId &&
          (result.status === 'blocked' || result.status === 'conflict'),
      );
      return blocked ? this.blockedOutcome(workspace.workspaceId, blocked) : { status: 'accepted' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = message.startsWith('canvas-delivery-open-session-dirty:')
        ? 'canvas-delivery-open-session-dirty'
        : 'desktop-dsh-canvas-artifact-delivery-failed';
      this.reportBlocked(input.workspaceId, code, message);
      return { status: 'blocked', diagnostic: { code, message } };
    }
  }

  async projectGenerationJob(
    input: DesktopDshGenerationCanvasProjectionInput,
  ): Promise<DshCanvasArtifactDeliveryOutcome> {
    try {
      const workspace = await this.restoreExactWorkspace(input.workspaceId);
      const projectionTarget = resolveProjectionTarget(input, workspace);
      const operationId = `${input.dshSessionId}:turn:${input.turn}:tool:${input.toolCallId}`;
      const request = createGenerationJobWorkspaceDeliveryRequest(input.snapshot, {
        ...projectionTarget,
        sourceHost: 'desktop',
        operationId,
      });
      const results = await this.enqueueProjection(
        workspace,
        request.process.deliveryId,
        async () => request,
      );
      const blocked = results.find(
        (result) =>
          result.deliveryId === request.process.deliveryId &&
          (result.status === 'blocked' || result.status === 'conflict'),
      );
      return blocked ? this.blockedOutcome(workspace.workspaceId, blocked) : { status: 'accepted' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = message.startsWith('canvas-delivery-open-session-dirty:')
        ? 'canvas-delivery-open-session-dirty'
        : 'desktop-dsh-generation-canvas-artifact-projection-failed';
      this.reportBlocked(input.workspaceId, code, message);
      return { status: 'blocked', diagnostic: { code, message } };
    }
  }

  private async resolveResourceFingerprints(
    input: DshCanvasArtifactDeliveryInput,
    workspace: AssetWorkspaceResolution,
  ): Promise<DshCanvasArtifactDeliveryInput> {
    const contentRead = this.options.createContentRead(workspace.workspacePath);
    return resolveDshCanvasArtifactResourceFingerprints(input, contentRead);
  }

  private async enqueueProjection(
    workspace: AssetWorkspaceResolution,
    deliveryId: string,
    createRequest: () => Promise<CanvasWorkspaceProjectionRequest>,
  ): Promise<readonly CanvasWorkspaceProjectionResult[]> {
    const binding = this.bindingFor(workspace);
    if (await binding.ledger.getReceipt(deliveryId)) return [];
    const resumed = await binding.coordinator.flush();
    if (await binding.ledger.getReceipt(deliveryId)) return resumed;
    const existing = (await binding.ledger.listPending()).some(
      (task) => task.request.process.deliveryId === deliveryId,
    );
    if (existing) return resumed;
    return [...resumed, ...(await binding.coordinator.enqueue(await createRequest()))];
  }

  private async restoreExactWorkspace(workspaceId: string): Promise<AssetWorkspaceResolution> {
    if (!this.options.workspaceRegistry.restore) {
      throw new Error('Desktop Workspace registry cannot restore an exact Workspace identity.');
    }
    const workspace = await this.options.workspaceRegistry.restore(workspaceId);
    if (workspace.workspaceId !== workspaceId) {
      throw new Error(
        `Canvas delivery resolved '${workspace.workspaceId}' instead of '${workspaceId}'.`,
      );
    }
    return workspace;
  }

  private bindingFor(workspace: AssetWorkspaceResolution): CanvasDeliveryBinding {
    const existing = this.bindings.get(workspace.workspaceId);
    if (existing?.workspacePath === workspace.workspacePath) return existing;
    const ledger = new CanvasWorkspaceDeliveryLedger({
      metadataStore: this.options.metadataStore,
      workspaceId: workspace.workspaceId,
      createIdentity: this.createIdentity,
    });
    const nodeMutation = new CanvasWorkspaceNodeMutation({
      workspace,
      host: this.options.host,
      createIdentity: this.createIdentity,
    });
    const coordinator = new CanvasWorkspaceDeliveryCoordinator({
      ledger,
      mutation: {
        coordinate: (target, operation) =>
          this.options.coordinateCanvasMutation(
            { workspaceId: target.workspaceId, canvasId: target.canvasId },
            operation,
          ),
        loadLatest: nodeMutation.loadLatest.bind(nodeMutation),
        saveAtomic: nodeMutation.saveAtomic.bind(nodeMutation),
      },
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
  ): DshCanvasArtifactDeliveryOutcome {
    const diagnostic = result.diagnostics[0];
    const code = diagnostic?.code ?? `canvas-delivery-${result.status}`;
    const message = diagnostic?.message ?? `Canvas delivery ended as ${result.status}.`;
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

export async function resolveDshCanvasArtifactResourceFingerprints(
  input: DshCanvasArtifactDeliveryInput,
  contentRead: Pick<ContentReadService, 'stat'>,
): Promise<DshCanvasArtifactDeliveryInput> {
  const artifacts = await Promise.all(
    input.artifacts.map(async (artifact) => {
      const source = await contentRead.stat(artifact.contentLocator);
      if (source.status === 'unavailable') {
        throw new Error(`DSH Canvas source is unavailable: ${source.diagnostic.code}.`);
      }
      return {
        ...artifact,
        contentFingerprint: `content:${source.fingerprint.strategy}:${source.fingerprint.value}`,
      };
    }),
  );
  return { ...input, artifacts };
}

export function createDshCanvasArtifactProjectionRequest(
  input: DshCanvasArtifactDeliveryInput,
  workspace: AssetWorkspaceResolution,
): CanvasWorkspaceProjectionRequest {
  if (input.artifacts.length === 0) {
    throw new Error('DSH Canvas delivery requires at least one artifact.');
  }
  const identity = {
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    dshSessionId: input.dshSessionId,
    turn: input.turn,
    target: input.canvasTurnTarget,
  } as const;
  const deliveryId = `dsh-tool:${hashStableValue({ ...identity, toolCallId: input.delivery.toolCallId })}`;
  const operationId = `${input.dshSessionId}:turn:${input.turn}:tool:${input.delivery.toolCallId}`;
  const createdAt = new Date(input.createdAt).toISOString();
  const target = resolveProjectionTarget(input, workspace);
  return {
    target,
    process: {
      deliveryId,
      sourceHost: 'desktop',
      createdAt,
      operationId,
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
        ...(artifact.referenceLocators ? { referenceLocators: artifact.referenceLocators } : {}),
        operationId,
        createdAt,
      };
      return {
        kind: artifact.kind,
        title: artifact.title,
        contentLocator: artifact.contentLocator,
        ...(artifact.overviewAttachment
          ? {
              intrinsicDimensions: {
                width: artifact.overviewAttachment.width,
                height: artifact.overviewAttachment.height,
              },
            }
          : {}),
        provenance,
      };
    }),
  };
}

function resolveProjectionTarget(
  input: {
    readonly workspaceId: string;
    readonly canvasTurnTarget: CanvasWorkspaceTurnTarget;
  },
  workspace: AssetWorkspaceResolution,
): CanvasWorkspaceProjectionRequest['target'] {
  if (
    input.workspaceId !== workspace.workspaceId ||
    input.canvasTurnTarget.workspaceId !== workspace.workspaceId
  ) {
    throw new Error('DSH Canvas projection target does not match the exact Workspace.');
  }
  const base = {
    workspaceId: workspace.workspaceId,
    workspaceUri: pathToFileURL(workspace.workspacePath).href,
  };
  const canvasId = input.canvasTurnTarget.canvasId;
  if (
    path.posix.isAbsolute(canvasId) ||
    path.posix.normalize(canvasId) !== canvasId ||
    canvasId.startsWith('../') ||
    !canvasId.toLocaleLowerCase().endsWith('.nkc')
  ) {
    throw new Error(`Exact Canvas identity '${canvasId}' is not a normalized Workspace path.`);
  }
  const documentPath = path.resolve(workspace.workspacePath, ...canvasId.split('/'));
  const relative = path.relative(workspace.workspacePath, documentPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Exact Canvas identity escapes the Workspace root.');
  }
  return { ...base, canvasId, documentUri: pathToFileURL(documentPath).href };
}
