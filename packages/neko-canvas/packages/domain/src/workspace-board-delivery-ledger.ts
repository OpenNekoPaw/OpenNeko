import {
  hashStableValue,
  isCanvasWorkspaceProjectionRequest,
  validateCanvasWorkspaceProjectionRequest,
  type CanvasWorkspaceDeliveryClaim,
  type CanvasWorkspaceDeliveryReceipt,
  type CanvasWorkspaceDeliveryState,
  type CanvasWorkspaceProjectionDiagnostic,
  type CanvasWorkspaceProjectionRequest,
  type LocalMetadataStore,
} from '@neko/shared';

const DELIVERY_TASK_PREFIX = 'system:canvas-board-delivery:';
const WRITER_TASK_PREFIX = 'system:canvas-board-writer:';
const LEDGER_PAYLOAD_VERSION = 1 as const;

export interface WorkspaceBoardDeliveryLedgerOptions {
  readonly metadataStore: LocalMetadataStore;
  readonly workspaceId: string;
  readonly now?: () => number;
}

export interface WorkspaceBoardDeliveryTask {
  readonly request: CanvasWorkspaceProjectionRequest;
  readonly state: Exclude<CanvasWorkspaceDeliveryState, 'projected' | 'noop'>;
  readonly attempt: number;
  readonly claim?: CanvasWorkspaceDeliveryClaim;
  readonly diagnostics: readonly CanvasWorkspaceProjectionDiagnostic[];
}

interface DeliveryTaskPayload extends WorkspaceBoardDeliveryTask {
  readonly kind: 'canvas-workspace-board-delivery';
  readonly version: typeof LEDGER_PAYLOAD_VERSION;
  readonly requestDigest: string;
}

interface DeliveryReceiptPayload {
  readonly kind: 'canvas-workspace-board-receipt';
  readonly version: typeof LEDGER_PAYLOAD_VERSION;
  readonly receipt: CanvasWorkspaceDeliveryReceipt;
}

interface WriterPayload {
  readonly kind: 'canvas-workspace-board-writer';
  readonly version: typeof LEDGER_PAYLOAD_VERSION;
  readonly claim: CanvasWorkspaceDeliveryClaim;
}

export class WorkspaceBoardDeliveryLedger {
  constructor(private readonly options: WorkspaceBoardDeliveryLedgerOptions) {}

  async enqueue(request: CanvasWorkspaceProjectionRequest): Promise<WorkspaceBoardDeliveryTask> {
    this.assertWorkspace(request);
    const diagnostics = validateCanvasWorkspaceProjectionRequest(request);
    if (diagnostics.length > 0) {
      throw new Error(diagnostics.map((entry) => `${entry.code}: ${entry.message}`).join('; '));
    }
    const taskKey = deliveryTaskKey(request.process.deliveryId);
    return this.options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'enqueue-canvas-board-delivery' },
      async ({ repositories }) => {
        const existing = await repositories.tasks.get(this.options.workspaceId, taskKey);
        if (existing) {
          const receipt = parseReceiptPayload(existing.payload);
          if (receipt) {
            throw new Error(
              `projection-conflict: Delivery ${request.process.deliveryId} already completed as ${receipt.receipt.state}.`,
            );
          }
          const payload = parseDeliveryPayload(existing.payload);
          if (payload.requestDigest !== hashStableValue(request)) {
            throw new Error(
              `projection-conflict: Delivery ${request.process.deliveryId} was reused with different content.`,
            );
          }
          return toDeliveryTask(payload);
        }
        const now = this.now();
        const payload: DeliveryTaskPayload = {
          kind: 'canvas-workspace-board-delivery',
          version: LEDGER_PAYLOAD_VERSION,
          request,
          requestDigest: hashStableValue(request),
          state: 'queued',
          attempt: 0,
          diagnostics: [],
        };
        await repositories.tasks.upsert({
          workspaceId: this.options.workspaceId,
          taskKey,
          taskId: request.process.deliveryId,
          status: payload.state,
          payload,
          createdAt: now,
          updatedAt: now,
        });
        await repositories.taskCheckpoints.upsert({
          workspaceId: this.options.workspaceId,
          taskKey,
          taskId: request.process.deliveryId,
          payload,
          updatedAt: now,
        });
        await incrementTaskRevision(repositories, this.options.workspaceId, now);
        return toDeliveryTask(payload);
      },
    );
  }

  async listPending(): Promise<readonly WorkspaceBoardDeliveryTask[]> {
    const records = await this.options.metadataStore.repositories.tasks.list({
      workspaceId: this.options.workspaceId,
      statuses: ['queued', 'claimed', 'blocked', 'conflict'],
    });
    return records.flatMap((record) => {
      if (!record.taskKey.startsWith(DELIVERY_TASK_PREFIX)) return [];
      const payload = parseDeliveryPayload(record.payload);
      return [toDeliveryTask(payload)];
    });
  }

  async getReceipt(deliveryId: string): Promise<CanvasWorkspaceDeliveryReceipt | undefined> {
    const record = await this.options.metadataStore.repositories.tasks.get(
      this.options.workspaceId,
      deliveryTaskKey(deliveryId),
    );
    if (!record) return undefined;
    return parseReceiptPayload(record.payload)?.receipt;
  }

  async acquireWriter(input: {
    readonly holderId: string;
    readonly leaseDurationMs: number;
  }): Promise<CanvasWorkspaceDeliveryClaim | undefined> {
    const now = this.now();
    return this.options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'claim-canvas-board-writer' },
      async ({ repositories }) => {
        const taskKey = writerTaskKey(this.options.workspaceId);
        const existing = await repositories.tasks.get(this.options.workspaceId, taskKey);
        const previous = existing ? parseWriterPayload(existing.payload).claim : undefined;
        if (previous && previous.expiresAt > now && previous.holderId !== input.holderId) {
          return undefined;
        }
        const claim: CanvasWorkspaceDeliveryClaim = {
          holderId: input.holderId,
          epoch:
            previous?.holderId === input.holderId && previous.expiresAt > now
              ? previous.epoch
              : (previous?.epoch ?? 0) + 1,
          expiresAt: now + input.leaseDurationMs,
        };
        const payload: WriterPayload = {
          kind: 'canvas-workspace-board-writer',
          version: LEDGER_PAYLOAD_VERSION,
          claim,
        };
        await repositories.tasks.upsert({
          workspaceId: this.options.workspaceId,
          taskKey,
          taskId: `canvas-board-writer:${this.options.workspaceId}`,
          status: 'claimed',
          payload,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
        await incrementTaskRevision(repositories, this.options.workspaceId, now);
        return claim;
      },
    );
  }

  async releaseWriter(claim: CanvasWorkspaceDeliveryClaim): Promise<void> {
    await this.options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'release-canvas-board-writer' },
      async ({ repositories }) => {
        await this.assertCurrentWriter(repositories, claim, false);
        await repositories.tasks.delete(
          this.options.workspaceId,
          writerTaskKey(this.options.workspaceId),
        );
        await incrementTaskRevision(repositories, this.options.workspaceId, this.now());
      },
    );
  }

  async assertWriter(claim: CanvasWorkspaceDeliveryClaim): Promise<void> {
    await this.options.metadataStore.transaction(
      { mode: 'read', ownership: 'state', operation: 'assert-canvas-board-writer' },
      async ({ repositories }) => this.assertCurrentWriter(repositories, claim),
    );
  }

  async claimDelivery(
    deliveryId: string,
    writer: CanvasWorkspaceDeliveryClaim,
  ): Promise<WorkspaceBoardDeliveryTask | undefined> {
    const now = this.now();
    return this.options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'claim-canvas-board-delivery' },
      async ({ repositories }) => {
        await this.assertCurrentWriter(repositories, writer);
        const taskKey = deliveryTaskKey(deliveryId);
        const record = await repositories.tasks.get(this.options.workspaceId, taskKey);
        if (!record || parseReceiptPayload(record.payload)) return undefined;
        const current = parseDeliveryPayload(record.payload);
        if (current.state === 'discarded') return undefined;
        if (
          current.claim &&
          current.claim.expiresAt > now &&
          (current.claim.holderId !== writer.holderId || current.claim.epoch !== writer.epoch)
        ) {
          return undefined;
        }
        const payload: DeliveryTaskPayload = {
          ...current,
          state: 'claimed',
          attempt: current.attempt + 1,
          claim: writer,
          diagnostics: [],
        };
        await repositories.tasks.upsert({
          ...record,
          status: payload.state,
          payload,
          updatedAt: now,
        });
        await repositories.taskCheckpoints.upsert({
          workspaceId: this.options.workspaceId,
          taskKey,
          taskId: deliveryId,
          payload,
          updatedAt: now,
        });
        await incrementTaskRevision(repositories, this.options.workspaceId, now);
        return toDeliveryTask(payload);
      },
    );
  }

  async complete(
    receipt: CanvasWorkspaceDeliveryReceipt,
    writer: CanvasWorkspaceDeliveryClaim,
  ): Promise<void> {
    const now = this.now();
    await this.options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'complete-canvas-board-delivery' },
      async ({ repositories }) => {
        await this.assertCurrentWriter(repositories, writer);
        const taskKey = deliveryTaskKey(receipt.deliveryId);
        const record = await repositories.tasks.get(this.options.workspaceId, taskKey);
        if (!record) throw new Error(`Canvas Board delivery ${receipt.deliveryId} is missing.`);
        const existingReceipt = parseReceiptPayload(record.payload);
        if (existingReceipt) {
          if (hashStableValue(existingReceipt.receipt) !== hashStableValue(receipt)) {
            throw new Error(
              `projection-conflict: Delivery ${receipt.deliveryId} already has another receipt.`,
            );
          }
          return;
        }
        const current = parseDeliveryPayload(record.payload);
        assertDeliveryClaim(current, writer);
        const payload: DeliveryReceiptPayload = {
          kind: 'canvas-workspace-board-receipt',
          version: LEDGER_PAYLOAD_VERSION,
          receipt,
        };
        await repositories.tasks.upsert({
          ...record,
          status: receipt.state,
          payload,
          updatedAt: now,
        });
        await repositories.taskCheckpoints.delete(this.options.workspaceId, taskKey);
        await incrementTaskRevision(repositories, this.options.workspaceId, now);
      },
    );
  }

  async fail(input: {
    readonly deliveryId: string;
    readonly state: 'blocked' | 'conflict';
    readonly diagnostics: readonly CanvasWorkspaceProjectionDiagnostic[];
    readonly writer: CanvasWorkspaceDeliveryClaim;
  }): Promise<void> {
    const now = this.now();
    await this.options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'fail-canvas-board-delivery' },
      async ({ repositories }) => {
        await this.assertCurrentWriter(repositories, input.writer);
        const taskKey = deliveryTaskKey(input.deliveryId);
        const record = await repositories.tasks.get(this.options.workspaceId, taskKey);
        if (!record || parseReceiptPayload(record.payload)) return;
        const current = parseDeliveryPayload(record.payload);
        assertDeliveryClaim(current, input.writer);
        const payload: DeliveryTaskPayload = {
          ...current,
          state: input.state,
          diagnostics: input.diagnostics,
          claim: undefined,
        };
        await repositories.tasks.upsert({
          ...record,
          status: payload.state,
          payload,
          updatedAt: now,
        });
        await repositories.taskCheckpoints.upsert({
          workspaceId: this.options.workspaceId,
          taskKey,
          taskId: input.deliveryId,
          payload,
          updatedAt: now,
        });
        await incrementTaskRevision(repositories, this.options.workspaceId, now);
      },
    );
  }

  async retry(deliveryId: string): Promise<void> {
    const now = this.now();
    await this.options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'retry-canvas-board-delivery' },
      async ({ repositories }) => {
        const taskKey = deliveryTaskKey(deliveryId);
        const record = await repositories.tasks.get(this.options.workspaceId, taskKey);
        if (!record || parseReceiptPayload(record.payload)) return;
        const current = parseDeliveryPayload(record.payload);
        const payload: DeliveryTaskPayload = {
          ...current,
          state: 'queued',
          claim: undefined,
          diagnostics: [],
        };
        await repositories.tasks.upsert({ ...record, status: 'queued', payload, updatedAt: now });
        await repositories.taskCheckpoints.upsert({
          workspaceId: this.options.workspaceId,
          taskKey,
          taskId: deliveryId,
          payload,
          updatedAt: now,
        });
        await incrementTaskRevision(repositories, this.options.workspaceId, now);
      },
    );
  }

  async discard(deliveryId: string): Promise<void> {
    const now = this.now();
    await this.options.metadataStore.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'discard-canvas-board-delivery' },
      async ({ repositories }) => {
        const taskKey = deliveryTaskKey(deliveryId);
        const record = await repositories.tasks.get(this.options.workspaceId, taskKey);
        if (!record || parseReceiptPayload(record.payload)) return;
        const current = parseDeliveryPayload(record.payload);
        await repositories.tasks.upsert({
          ...record,
          status: 'discarded',
          payload: { ...current, state: 'discarded', claim: undefined },
          updatedAt: now,
        });
        await repositories.taskCheckpoints.delete(this.options.workspaceId, taskKey);
        await incrementTaskRevision(repositories, this.options.workspaceId, now);
      },
    );
  }

  private assertWorkspace(request: CanvasWorkspaceProjectionRequest): void {
    if (request.target.workspaceId !== this.options.workspaceId) {
      throw new Error(
        `Canvas Board delivery workspace ${request.target.workspaceId} does not match ${this.options.workspaceId}.`,
      );
    }
  }

  private async assertCurrentWriter(
    repositories: LocalMetadataStore['repositories'],
    claim: CanvasWorkspaceDeliveryClaim,
    requireUnexpired = true,
  ): Promise<void> {
    const writer = await repositories.tasks.get(
      this.options.workspaceId,
      writerTaskKey(this.options.workspaceId),
    );
    if (!writer) throw new Error('stale-writer: Canvas Board writer lease is missing.');
    const current = parseWriterPayload(writer.payload).claim;
    if (
      current.holderId !== claim.holderId ||
      current.epoch !== claim.epoch ||
      (requireUnexpired && current.expiresAt <= this.now())
    ) {
      throw new Error('stale-writer: Canvas Board writer lease is stale.');
    }
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }
}

function deliveryTaskKey(deliveryId: string): string {
  return `${DELIVERY_TASK_PREFIX}${deliveryId}`;
}

function writerTaskKey(workspaceId: string): string {
  return `${WRITER_TASK_PREFIX}${workspaceId}`;
}

function toDeliveryTask(payload: DeliveryTaskPayload): WorkspaceBoardDeliveryTask {
  return {
    request: payload.request,
    state: payload.state,
    attempt: payload.attempt,
    ...(payload.claim ? { claim: payload.claim } : {}),
    diagnostics: payload.diagnostics,
  };
}

function parseDeliveryPayload(value: unknown): DeliveryTaskPayload {
  if (!isRecord(value) || value['kind'] !== 'canvas-workspace-board-delivery') {
    throw new Error('Canvas Board delivery payload has an invalid kind.');
  }
  const request = value['request'];
  const state = value['state'];
  const attempt = value['attempt'];
  const diagnostics = value['diagnostics'];
  if (
    value['version'] !== LEDGER_PAYLOAD_VERSION ||
    !isCanvasWorkspaceProjectionRequest(request) ||
    !isActiveDeliveryState(state) ||
    typeof attempt !== 'number' ||
    !Number.isInteger(attempt) ||
    attempt < 0 ||
    typeof value['requestDigest'] !== 'string' ||
    !Array.isArray(diagnostics) ||
    !diagnostics.every(isProjectionDiagnostic)
  ) {
    throw new Error('Canvas Board delivery payload violates its contract.');
  }
  const requestDiagnostics = validateCanvasWorkspaceProjectionRequest(request);
  if (requestDiagnostics.length > 0) {
    throw new Error(
      requestDiagnostics.map((entry) => `${entry.code}: ${entry.message}`).join('; '),
    );
  }
  const claim = value['claim'];
  if (claim !== undefined && !isDeliveryClaim(claim)) {
    throw new Error('Canvas Board delivery claim violates its contract.');
  }
  return {
    kind: 'canvas-workspace-board-delivery',
    version: LEDGER_PAYLOAD_VERSION,
    request,
    requestDigest: value['requestDigest'],
    state,
    attempt,
    ...(claim ? { claim } : {}),
    diagnostics,
  };
}

function parseReceiptPayload(value: unknown): DeliveryReceiptPayload | undefined {
  if (!isRecord(value) || value['kind'] !== 'canvas-workspace-board-receipt') return undefined;
  const receipt = value['receipt'];
  if (value['version'] !== LEDGER_PAYLOAD_VERSION || !isDeliveryReceipt(receipt)) {
    throw new Error('Canvas Board delivery receipt violates its contract.');
  }
  return {
    kind: 'canvas-workspace-board-receipt',
    version: LEDGER_PAYLOAD_VERSION,
    receipt,
  };
}

function parseWriterPayload(value: unknown): WriterPayload {
  if (
    !isRecord(value) ||
    value['kind'] !== 'canvas-workspace-board-writer' ||
    value['version'] !== LEDGER_PAYLOAD_VERSION ||
    !isDeliveryClaim(value['claim'])
  ) {
    throw new Error('Canvas Board writer payload violates its contract.');
  }
  return {
    kind: 'canvas-workspace-board-writer',
    version: LEDGER_PAYLOAD_VERSION,
    claim: value['claim'],
  };
}

function assertDeliveryClaim(
  task: WorkspaceBoardDeliveryTask,
  writer: CanvasWorkspaceDeliveryClaim,
): void {
  if (task.claim?.holderId !== writer.holderId || task.claim.epoch !== writer.epoch) {
    throw new Error('stale-writer: Canvas Board delivery claim is stale.');
  }
}

function isActiveDeliveryState(value: unknown): value is WorkspaceBoardDeliveryTask['state'] {
  return (
    value === 'queued' ||
    value === 'claimed' ||
    value === 'blocked' ||
    value === 'conflict' ||
    value === 'discarded'
  );
}

function isDeliveryClaim(value: unknown): value is CanvasWorkspaceDeliveryClaim {
  return (
    isRecord(value) &&
    typeof value['holderId'] === 'string' &&
    Number.isInteger(value['epoch']) &&
    typeof value['epoch'] === 'number' &&
    value['epoch'] > 0 &&
    typeof value['expiresAt'] === 'number' &&
    Number.isFinite(value['expiresAt'])
  );
}

function isDeliveryReceipt(value: unknown): value is CanvasWorkspaceDeliveryReceipt {
  return (
    isRecord(value) &&
    typeof value['deliveryId'] === 'string' &&
    (value['state'] === 'projected' ||
      value['state'] === 'noop' ||
      value['state'] === 'blocked' ||
      value['state'] === 'conflict') &&
    Array.isArray(value['artifactIdentities']) &&
    Array.isArray(value['diagnostics']) &&
    value['diagnostics'].every(isProjectionDiagnostic) &&
    (value['nodeIds'] === undefined ||
      (Array.isArray(value['nodeIds']) &&
        value['nodeIds'].every((nodeId) => typeof nodeId === 'string'))) &&
    (value['connectionIds'] === undefined ||
      (Array.isArray(value['connectionIds']) &&
        value['connectionIds'].every((connectionId) => typeof connectionId === 'string'))) &&
    Number.isInteger(value['writerEpoch']) &&
    typeof value['writerEpoch'] === 'number' &&
    value['writerEpoch'] > 0 &&
    typeof value['completedAt'] === 'number'
  );
}

function isProjectionDiagnostic(value: unknown): value is CanvasWorkspaceProjectionDiagnostic {
  return (
    isRecord(value) &&
    typeof value['code'] === 'string' &&
    (value['severity'] === 'warning' || value['severity'] === 'error') &&
    typeof value['message'] === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function incrementTaskRevision(
  repositories: LocalMetadataStore['repositories'],
  workspaceId: string,
  updatedAt: number,
): Promise<void> {
  await repositories.projectionVersions.increment({
    partition: { scope: 'workspace', workspaceId, domain: 'tasks' },
    freshness: 'fresh',
    diagnostic: null,
    updatedAt: new Date(updatedAt).toISOString(),
  });
}
