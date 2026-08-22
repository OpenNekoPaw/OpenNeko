import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import type {
  DshWorkspaceBoardArtifactDeliveryInput,
  DshWorkspaceBoardArtifactDeliveryOutcome,
  DshWorkspaceBoardArtifactDeliveryPort,
  DshDurableMarkdownArtifactPublicationPort,
} from '@neko/agent-runtime/application';
import {
  isWorkspaceFileContentLocator,
  type AuthorizedWorkspaceWriter,
  type ContentReadService,
} from '@neko/content';
import { createNodeHostContentReadService, type NodeDocumentEntryReader } from '@neko/content/node';
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
  readonly createContentRead: (workspacePath: string) => ContentReadService;
  readonly createContentWriter: (workspacePath: string) => AuthorizedWorkspaceWriter;
  readonly createIdentity?: () => string;
}

interface WorkspaceBoardBinding {
  readonly workspacePath: string;
  readonly ledger: WorkspaceBoardDeliveryLedger;
  readonly coordinator: WorkspaceBoardDeliveryCoordinator;
}

export function createDshWorkspaceBoardContentRead(input: {
  readonly workspacePath: string;
  readonly documentEntryReader: NodeDocumentEntryReader;
}): ContentReadService {
  return createNodeHostContentReadService({
    workspaceRoot: input.workspacePath,
    documentEntryReader: input.documentEntryReader,
  });
}

export class DesktopDshWorkspaceBoardDelivery
  implements DshWorkspaceBoardArtifactDeliveryPort, DshDurableMarkdownArtifactPublicationPort
{
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
      const deliveryId = createDshWorkspaceBoardProjectionRequest(input, workspace).process
        .deliveryId;
      const results = await this.enqueueProjection(workspace, deliveryId, async () =>
        createDshWorkspaceBoardProjectionRequest(
          await this.resolveResourceFingerprints(input, workspace),
          workspace,
        ),
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

  async publish(
    input: Parameters<DshDurableMarkdownArtifactPublicationPort['publish']>[0],
  ): ReturnType<DshDurableMarkdownArtifactPublicationPort['publish']> {
    const workspace = await this.restoreExactWorkspace(input.workspaceId);
    return publishDshDurableMarkdownArtifact(input, {
      writer: this.options.createContentWriter(workspace.workspacePath),
      read: this.options.createContentRead(workspace.workspacePath),
    });
  }

  async resolve(
    input: Parameters<DshDurableMarkdownArtifactPublicationPort['resolve']>[0],
  ): ReturnType<DshDurableMarkdownArtifactPublicationPort['resolve']> {
    const workspace = await this.restoreExactWorkspace(input.workspaceId);
    return resolveDshDurableMarkdownArtifact(input, {
      read: this.options.createContentRead(workspace.workspacePath),
    });
  }

  private async resolveResourceFingerprints(
    input: DshWorkspaceBoardArtifactDeliveryInput,
    workspace: AssetWorkspaceResolution,
  ): Promise<DshWorkspaceBoardArtifactDeliveryInput> {
    const contentRead = this.options.createContentRead(workspace.workspacePath);
    return resolveDshWorkspaceBoardResourceFingerprints(input, contentRead);
  }

  private async enqueueProjection(
    workspace: AssetWorkspaceResolution,
    deliveryId: string,
    createRequest: () => Promise<CanvasWorkspaceProjectionRequest>,
  ): Promise<readonly CanvasWorkspaceProjectionResult[]> {
    const binding = this.bindingFor(workspace);
    if (await binding.ledger.getReceipt(deliveryId)) return [];
    return this.options.coordinateCanvasMutation(workspace.workspaceId, async () => {
      const resumed = await binding.coordinator.flush();
      if (await binding.ledger.getReceipt(deliveryId)) return resumed;
      const existing = (await binding.ledger.listPending()).some(
        (task) => task.request.process.deliveryId === deliveryId,
      );
      if (existing) return resumed;
      return [...resumed, ...(await binding.coordinator.enqueue(await createRequest()))];
    });
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

export async function publishDshDurableMarkdownArtifact(
  input: Parameters<DshDurableMarkdownArtifactPublicationPort['publish']>[0],
  ports: {
    readonly writer: AuthorizedWorkspaceWriter;
    readonly read: Pick<ContentReadService, 'read'>;
  },
): ReturnType<DshDurableMarkdownArtifactPublicationPort['publish']> {
  if (
    !isWorkspaceFileContentLocator(input.contentLocator) ||
    input.contentLocator.selector !== undefined
  ) {
    throw new Error('Durable Markdown publication requires a Workspace file ContentLocator.');
  }
  const bytes = new TextEncoder().encode(input.markdown);
  const result = await ports.writer.write(input.contentLocator, bytes, {
    conflict: 'fail-if-exists',
    maxBytes: bytes.byteLength,
  });
  if (result.status === 'written') {
    return {
      contentLocator: result.locator,
      contentFingerprint: input.contentFingerprint,
    };
  }
  if (result.diagnostic.code !== 'content-conflict') {
    throw new Error(`Durable Markdown publication failed: ${result.diagnostic.code}.`);
  }
  const existing = await ports.read.read(input.contentLocator, { maxBytes: bytes.byteLength });
  if (
    existing.status !== 'ready' ||
    existing.bytes.byteLength !== bytes.byteLength ||
    !Buffer.from(existing.bytes).equals(Buffer.from(bytes))
  ) {
    throw new Error('Durable Markdown publication conflicts with existing Workspace content.');
  }
  return {
    contentLocator: input.contentLocator,
    contentFingerprint: input.contentFingerprint,
  };
}

export async function resolveDshDurableMarkdownArtifact(
  input: Parameters<DshDurableMarkdownArtifactPublicationPort['resolve']>[0],
  ports: { readonly read: Pick<ContentReadService, 'read'> },
): ReturnType<DshDurableMarkdownArtifactPublicationPort['resolve']> {
  if (
    !isWorkspaceFileContentLocator(input.contentLocator) ||
    input.contentLocator.selector !== undefined
  ) {
    throw new Error('Durable Markdown resolution requires a Workspace file ContentLocator.');
  }
  const expected = new TextEncoder().encode(input.markdown);
  const existing = await ports.read.read(input.contentLocator, { maxBytes: expected.byteLength });
  if (existing.status === 'unavailable') {
    if (existing.diagnostic.code === 'content-missing') return undefined;
    throw new Error(`Durable Markdown resolution failed: ${existing.diagnostic.code}.`);
  }
  if (
    existing.bytes.byteLength !== expected.byteLength ||
    !Buffer.from(existing.bytes).equals(Buffer.from(expected))
  ) {
    throw new Error('Durable Markdown resolution conflicts with existing Workspace content.');
  }
  return {
    contentLocator: input.contentLocator,
    contentFingerprint: input.contentFingerprint,
  };
}

export async function resolveDshWorkspaceBoardResourceFingerprints(
  input: DshWorkspaceBoardArtifactDeliveryInput,
  contentRead: Pick<ContentReadService, 'stat'>,
): Promise<DshWorkspaceBoardArtifactDeliveryInput> {
  const artifacts = await Promise.all(
    input.artifacts.map(async (artifact) => {
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
  const identity = {
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    dshSessionId: input.dshSessionId,
    turn: input.turn,
    target: input.canvasTurnTarget,
  } as const;
  const deliveryId =
    input.delivery.kind === 'completed-tool'
      ? `dsh-tool:${hashStableValue({ ...identity, toolCallId: input.delivery.toolCallId })}`
      : `dsh-turn:${hashStableValue(identity)}`;
  const operationId =
    input.delivery.kind === 'completed-tool'
      ? `${input.dshSessionId}:turn:${input.turn}:tool:${input.delivery.toolCallId}`
      : `${input.dshSessionId}:turn:${input.turn}`;
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
        operationId,
        createdAt,
      };
      return {
        kind: artifact.kind,
        title: artifact.title,
        ...(artifact.mimeType === undefined ? {} : { mimeType: artifact.mimeType }),
        contentLocator: artifact.contentLocator,
        provenance,
      };
    }),
  };
}

function resolveProjectionTarget(
  input: DshWorkspaceBoardArtifactDeliveryInput,
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
  if (input.canvasTurnTarget.kind === 'workspace-board') return base;
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
  return { ...base, documentUri: pathToFileURL(documentPath).href };
}
