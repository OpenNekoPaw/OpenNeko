import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  createSafeCanvasWorkspaceProjectionDiagnostic,
  hashStableValue,
  planCanvasWorkspaceBoardProjection,
  resolveCanvasWorkspaceBoardDocumentUri,
  type CanvasData,
  type CanvasWorkspaceDeliveryClaim,
  type CanvasWorkspaceDeliveryReceipt,
  type CanvasWorkspaceProjectionDiagnostic,
  type CanvasWorkspaceProjectionRequest,
  type CanvasWorkspaceProjectionResult,
} from '@neko/shared';
import {
  WorkspaceBoardDeliveryLedger,
  type WorkspaceBoardDeliveryTask,
} from './workspace-board-delivery-ledger';

export interface CanvasWorkspaceBoardLoadedDocument {
  readonly documentUri: string;
  readonly canvasData: CanvasData;
  readonly revision: string;
  readonly exists: boolean;
}

export interface CanvasWorkspaceBoardMutationPort {
  loadLatest(input: {
    readonly documentUri: string;
    readonly createIfMissing: boolean;
  }): Promise<CanvasWorkspaceBoardLoadedDocument>;
  saveAtomic(input: {
    readonly documentUri: string;
    readonly expectedRevision: string;
    readonly canvasData: CanvasData;
    readonly assertWriter?: () => Promise<void>;
  }): Promise<{ readonly revision: string }>;
}

export interface WorkspaceBoardDeliveryCoordinatorOptions {
  readonly ledger: WorkspaceBoardDeliveryLedger;
  readonly mutation: CanvasWorkspaceBoardMutationPort;
  readonly holderId: string;
  readonly leaseDurationMs?: number;
  readonly now?: () => number;
}

export class WorkspaceBoardDeliveryCoordinator {
  private readonly leaseDurationMs: number;
  private retainedWriter: CanvasWorkspaceDeliveryClaim | undefined;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: WorkspaceBoardDeliveryCoordinatorOptions) {
    this.leaseDurationMs = options.leaseDurationMs ?? 15_000;
  }

  async enqueue(
    request: CanvasWorkspaceProjectionRequest,
  ): Promise<readonly CanvasWorkspaceProjectionResult[]> {
    const receipt = await this.options.ledger.getReceipt(request.process.deliveryId);
    if (receipt) return [receiptToResult(receipt)];
    await this.options.ledger.enqueue(request);
    const results = await this.flush();
    return results.length > 0 ? results : [queuedResult(request)];
  }

  async flush(): Promise<readonly CanvasWorkspaceProjectionResult[]> {
    return this.runExclusive(() => this.flushUnderWriter());
  }

  async acquireWriterOwnership(): Promise<boolean> {
    return this.runExclusive(async () => {
      const writer = await this.acquireWriter();
      this.retainedWriter = writer;
      return writer !== undefined;
    });
  }

  async releaseWriterOwnership(): Promise<void> {
    return this.runExclusive(async () => {
      const writer = this.retainedWriter;
      this.retainedWriter = undefined;
      if (writer) await this.options.ledger.releaseWriter(writer);
    });
  }

  async retry(deliveryId: string): Promise<readonly CanvasWorkspaceProjectionResult[]> {
    await this.options.ledger.retry(deliveryId);
    return this.flush();
  }

  async discard(deliveryId: string): Promise<void> {
    await this.options.ledger.discard(deliveryId);
  }

  private async flushUnderWriter(): Promise<readonly CanvasWorkspaceProjectionResult[]> {
    const retainWriter = this.retainedWriter !== undefined;
    const writer = await this.acquireWriter();
    if (!writer) {
      this.retainedWriter = undefined;
      return [];
    }
    if (retainWriter) this.retainedWriter = writer;
    try {
      const pending = await this.options.ledger.listPending();
      const results: CanvasWorkspaceProjectionResult[] = [];
      for (const task of pending) {
        const claimed = await this.options.ledger.claimDelivery(
          task.request.process.deliveryId,
          writer,
        );
        if (!claimed) continue;
        results.push(await this.projectClaimed(claimed, writer));
      }
      return results;
    } finally {
      if (!retainWriter) await this.options.ledger.releaseWriter(writer);
    }
  }

  private acquireWriter(): Promise<CanvasWorkspaceDeliveryClaim | undefined> {
    return this.options.ledger.acquireWriter({
      holderId: this.options.holderId,
      leaseDurationMs: this.leaseDurationMs,
    });
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.operationQueue.then(operation, operation);
    this.operationQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async projectClaimed(
    task: WorkspaceBoardDeliveryTask,
    writer: CanvasWorkspaceDeliveryClaim,
  ): Promise<CanvasWorkspaceProjectionResult> {
    const request = task.request;
    const explicit = request.target.documentUri;
    const documentUri =
      explicit ?? resolveCanvasWorkspaceBoardDocumentUri(request.target.workspaceUri);
    try {
      const projection = await this.projectLatest(
        request,
        documentUri,
        explicit === undefined,
        writer,
      );
      const result: CanvasWorkspaceProjectionResult = {
        version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
        deliveryId: request.process.deliveryId,
        status: projection.status,
        target: { kind: explicit ? 'explicit' : 'workspace', documentUri },
        revision: projection.revision,
        nodeIds: projection.nodeIds,
        connectionIds: projection.connectionIds,
        artifactRoleCounts: countArtifactRoles(request),
        writerEpoch: writer.epoch,
        diagnostics: [],
      };
      await this.options.ledger.complete(createReceipt(request, result, this.now()), writer);
      return result;
    } catch (error) {
      const diagnostic = toDiagnostic(error);
      const state = isConflictDiagnostic(diagnostic) ? 'conflict' : 'blocked';
      await this.options.ledger.fail({
        deliveryId: request.process.deliveryId,
        state,
        diagnostics: [diagnostic],
        writer,
      });
      return {
        version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
        deliveryId: request.process.deliveryId,
        status: state,
        artifactRoleCounts: countArtifactRoles(request),
        writerEpoch: writer.epoch,
        diagnostics: [diagnostic],
      };
    }
  }

  private async projectLatest(
    request: CanvasWorkspaceProjectionRequest,
    documentUri: string,
    createIfMissing: boolean,
    writer: CanvasWorkspaceDeliveryClaim,
  ): Promise<{
    readonly status: 'projected' | 'noop';
    readonly revision: string;
    readonly nodeIds: readonly string[];
    readonly connectionIds: readonly string[];
  }> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const loaded = await this.options.mutation.loadLatest({ documentUri, createIfMissing });
      const plan = planCanvasWorkspaceBoardProjection(loaded.canvasData, request);
      if (plan.status === 'noop') {
        return {
          status: 'noop',
          revision: loaded.revision,
          nodeIds: plan.nodeIds,
          connectionIds: plan.connectionIds,
        };
      }
      try {
        const saved = await this.options.mutation.saveAtomic({
          documentUri,
          expectedRevision: loaded.revision,
          canvasData: plan.canvasData,
          assertWriter: () => this.options.ledger.assertWriter(writer),
        });
        return {
          status: 'projected',
          revision: saved.revision,
          nodeIds: plan.nodeIds,
          connectionIds: plan.connectionIds,
        };
      } catch (error) {
        if (attempt === 0 && isStaleRevisionError(error)) {
          await this.options.ledger.assertWriter(writer);
          continue;
        }
        throw error;
      }
    }
    throw new Error('stale-revision: Canvas Board changed during both projection attempts.');
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }
}

function createReceipt(
  request: CanvasWorkspaceProjectionRequest,
  result: CanvasWorkspaceProjectionResult,
  completedAt: number,
): CanvasWorkspaceDeliveryReceipt {
  if (result.status !== 'projected' && result.status !== 'noop') {
    throw new Error(`Canvas Board receipt cannot be created from ${result.status}.`);
  }
  if (result.writerEpoch === undefined) {
    throw new Error('Canvas Board receipt requires the fenced writer epoch.');
  }
  return {
    deliveryId: request.process.deliveryId,
    state: result.status,
    artifactIdentities: request.artifacts.map((artifact) => ({
      artifactId: artifact.provenance.artifactId,
      revision: artifact.provenance.revision,
      role: artifact.provenance.role,
    })),
    target: result.target,
    revision: result.revision,
    nodeIds: result.nodeIds,
    connectionIds: result.connectionIds,
    writerEpoch: result.writerEpoch,
    diagnostics: result.diagnostics,
    completedAt,
  };
}

function receiptToResult(receipt: CanvasWorkspaceDeliveryReceipt): CanvasWorkspaceProjectionResult {
  return {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    deliveryId: receipt.deliveryId,
    status: receipt.state,
    ...(receipt.target ? { target: receipt.target } : {}),
    ...(receipt.revision ? { revision: receipt.revision } : {}),
    ...(receipt.nodeIds ? { nodeIds: receipt.nodeIds } : {}),
    ...(receipt.connectionIds ? { connectionIds: receipt.connectionIds } : {}),
    artifactRoleCounts: countReceiptArtifactRoles(receipt),
    writerEpoch: receipt.writerEpoch,
    diagnostics: receipt.diagnostics,
  };
}

function queuedResult(request: CanvasWorkspaceProjectionRequest): CanvasWorkspaceProjectionResult {
  return {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    deliveryId: request.process.deliveryId,
    status: 'queued',
    artifactRoleCounts: countArtifactRoles(request),
    diagnostics: [],
  };
}

function countArtifactRoles(
  request: CanvasWorkspaceProjectionRequest,
): Readonly<Record<'source' | 'analysis' | 'output', number>> {
  const counts = { source: 0, analysis: 0, output: 0 };
  for (const artifact of request.artifacts) counts[artifact.provenance.role] += 1;
  return counts;
}

function countReceiptArtifactRoles(
  receipt: CanvasWorkspaceDeliveryReceipt,
): Readonly<Record<'source' | 'analysis' | 'output', number>> {
  const counts = { source: 0, analysis: 0, output: 0 };
  for (const artifact of receipt.artifactIdentities) counts[artifact.role] += 1;
  return counts;
}

function toDiagnostic(error: unknown): CanvasWorkspaceProjectionDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  const code = /stale-writer/iu.test(message)
    ? 'stale-writer'
    : /stale-board-target|stale-revision/iu.test(message)
      ? 'stale-revision'
      : /projection-conflict/iu.test(message)
        ? 'projection-conflict'
        : 'projection-write-failed';
  return createSafeCanvasWorkspaceProjectionDiagnostic(code);
}

function isConflictDiagnostic(diagnostic: CanvasWorkspaceProjectionDiagnostic): boolean {
  return (
    diagnostic.code === 'stale-writer' ||
    diagnostic.code === 'stale-revision' ||
    diagnostic.code === 'projection-conflict'
  );
}

function isStaleRevisionError(error: unknown): boolean {
  return /stale-board-target|stale-revision/iu.test(
    error instanceof Error ? error.message : String(error),
  );
}

export function createCanvasWorkspaceBoardRevision(canvasData: CanvasData): string {
  return `nkc:${hashStableValue(canvasData)}`;
}
