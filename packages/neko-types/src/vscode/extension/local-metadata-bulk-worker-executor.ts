import { Worker } from 'node:worker_threads';
import { LocalMetadataError } from '../../local-metadata';

export type LocalMetadataBulkOperation = 'bulk-migration' | 'fts-rebuild' | 'semantic-rebuild';

export interface LocalMetadataBulkWorkerRequest {
  readonly operation: LocalMetadataBulkOperation;
  readonly databasePath: string;
  readonly workspaceId: string | null;
  readonly domain: string;
  readonly payload: unknown;
}

export interface LocalMetadataBulkWorkerResult {
  readonly operation: LocalMetadataBulkOperation;
  readonly processedCount: number;
}

export interface NodeLocalMetadataBulkWorkerExecutorOptions {
  readonly workerUrl: URL;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLocalMetadataBulkOperation(value: unknown): value is LocalMetadataBulkOperation {
  return value === 'bulk-migration' || value === 'fts-rebuild' || value === 'semantic-rebuild';
}

export function isLocalMetadataBulkWorkerResult(
  value: unknown,
): value is LocalMetadataBulkWorkerResult {
  return (
    isRecord(value) &&
    isLocalMetadataBulkOperation(value.operation) &&
    typeof value.processedCount === 'number' &&
    Number.isSafeInteger(value.processedCount) &&
    value.processedCount >= 0
  );
}

export class NodeLocalMetadataBulkWorkerExecutor {
  constructor(private readonly options: NodeLocalMetadataBulkWorkerExecutorOptions) {}

  execute(
    request: LocalMetadataBulkWorkerRequest,
    signal?: AbortSignal,
  ): Promise<LocalMetadataBulkWorkerResult> {
    if (signal?.aborted) {
      return Promise.reject(
        new LocalMetadataError({
          code: 'metadata-transaction-failed',
          operation: request.operation,
          message: `Local metadata bulk worker was cancelled before start: ${request.operation}`,
        }),
      );
    }

    return new Promise<LocalMetadataBulkWorkerResult>((resolve, reject) => {
      const worker = new Worker(this.options.workerUrl, { workerData: request });
      let settled = false;

      const cleanup = (): void => {
        signal?.removeEventListener('abort', onAbort);
        worker.removeAllListeners();
      };
      const rejectOnce = (error: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const onAbort = (): void => {
        void worker.terminate();
        rejectOnce(
          new LocalMetadataError({
            code: 'metadata-transaction-failed',
            operation: request.operation,
            message: `Local metadata bulk worker was cancelled: ${request.operation}`,
          }),
        );
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      worker.once('message', (message: unknown) => {
        if (
          !isRecord(message) ||
          message.kind !== 'result' ||
          !isLocalMetadataBulkWorkerResult(message.result)
        ) {
          rejectOnce(
            new LocalMetadataError({
              code: 'metadata-transaction-failed',
              operation: request.operation,
              message: `Local metadata bulk worker returned an invalid result: ${request.operation}`,
            }),
          );
          return;
        }
        settled = true;
        cleanup();
        resolve(message.result);
      });
      worker.once('error', (error) => {
        rejectOnce(
          new LocalMetadataError({
            code: 'metadata-transaction-failed',
            operation: request.operation,
            message: `Local metadata bulk worker failed: ${request.operation}`,
            cause: error,
          }),
        );
      });
      worker.once('exit', (code) => {
        if (settled) return;
        rejectOnce(
          new LocalMetadataError({
            code: 'metadata-transaction-failed',
            operation: request.operation,
            message: `Local metadata bulk worker exited before returning a result: ${code}`,
          }),
        );
      });
    });
  }
}
