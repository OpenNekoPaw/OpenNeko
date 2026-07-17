import type { ProjectFileDiagnostic } from './diagnostics';
import { createProjectFileDiagnostic } from './diagnostics';
import {
  handleProjectSourceAddRequest,
  type BrowserFileProjection,
  type ProjectSourceAddRequest,
  type ProjectSourceAddResult,
  type ProjectSourceIngestPort,
} from './ingest';

export type ProjectSourceAddRequestMessage = {
  readonly type: 'project:addSource';
  readonly request: ProjectSourceAddRequest;
};

export type ProjectSourceAddedMessage = {
  readonly type: 'project:sourceAdded';
  readonly result: ProjectSourceAddResult;
};

export type ProjectSourceRejectedMessage = {
  readonly type: 'project:sourceRejected';
  readonly result: ProjectSourceAddResult;
};

export type ProjectSourceAddResponseMessage =
  ProjectSourceAddedMessage | ProjectSourceRejectedMessage;

export interface ProjectSourceAddFileLike extends BrowserFileProjection {
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ProjectSourceAddClientInput extends Omit<
  ProjectSourceAddRequest,
  'requestId' | 'bytes' | 'browserFile'
> {
  readonly requestId?: string;
  readonly bytes?: Uint8Array | ArrayBuffer | readonly number[];
  readonly browserFile?: BrowserFileProjection;
  readonly file?: ProjectSourceAddFileLike;
  readonly timeoutMs?: number;
}

export interface ProjectSourceAddAbortSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

export interface ProjectSourceAddClientOptions {
  readonly postMessage: (message: ProjectSourceAddRequestMessage) => void;
  readonly addMessageListener: (listener: (message: unknown) => void) => () => void;
  readonly createRequestId?: () => string;
  readonly timeoutMs?: number;
  readonly signal?: ProjectSourceAddAbortSignal;
  readonly setTimer?: (callback: () => void, timeoutMs: number) => unknown;
  readonly clearTimer?: (timerId: unknown) => void;
}

export interface ProjectSourceAddClient {
  addSource(input: ProjectSourceAddClientInput): Promise<ProjectSourceAddResult>;
}

export interface ProjectSourceAddHostLogger {
  debug?(message: string, context?: Record<string, unknown>): void;
  warn?(message: string, context?: Record<string, unknown>): void;
  error?(message: string, context?: Record<string, unknown>): void;
}

export interface ProjectSourceAddHostOptions {
  readonly postMessage: (message: ProjectSourceAddResponseMessage) => Promise<unknown> | unknown;
  readonly addSource?: (request: ProjectSourceAddRequest) => Promise<ProjectSourceAddResult>;
  readonly ingestPort?: ProjectSourceIngestPort;
  readonly logger?: ProjectSourceAddHostLogger;
}

const DEFAULT_PROJECT_SOURCE_ADD_TIMEOUT_MS = 15_000;

export function createProjectSourceAddClient(
  options: ProjectSourceAddClientOptions,
): ProjectSourceAddClient {
  return {
    async addSource(input) {
      const request = await createProjectSourceAddRequest(
        input,
        options.createRequestId?.() ?? createDefaultProjectSourceAddRequestId(),
      );
      if (options.signal?.aborted) {
        return createFailedProjectSourceAddResult(request.requestId, {
          code: 'add-source-cancelled',
          message: `Cancelled adding ${getProjectSourceAddDisplayName(request)}.`,
          recoverability: 'retry',
        });
      }

      return await waitForProjectSourceAddResult(request, options, input.timeoutMs);
    },
  };
}

export async function createProjectSourceAddRequest(
  input: ProjectSourceAddClientInput,
  defaultRequestId = createDefaultProjectSourceAddRequestId(),
): Promise<ProjectSourceAddRequest> {
  const bytes = normalizeProjectSourceAddBytes(
    input.bytes ??
      (!input.sourcePath && !input.generatedAssetId && input.file
        ? await input.file.arrayBuffer()
        : undefined),
  );
  const browserFile = input.browserFile ?? projectBrowserFileFromFile(input.file);

  return {
    requestId: input.requestId ?? defaultRequestId,
    kind: input.kind,
    formatId: input.formatId,
    ...(input.documentUri ? { documentUri: input.documentUri } : {}),
    ...(input.target ? { target: input.target } : {}),
    ...(input.sourcePath ? { sourcePath: input.sourcePath } : {}),
    ...(input.sourceUri ? { sourceUri: input.sourceUri } : {}),
    ...(browserFile ? { browserFile } : {}),
    ...(bytes ? { bytes } : {}),
    ...(input.generatedAssetId ? { generatedAssetId: input.generatedAssetId } : {}),
    destination: input.destination,
    ...(input.ingestMode ? { ingestMode: input.ingestMode } : {}),
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    ...(input.caller ? { caller: input.caller } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export function isProjectSourceAddResponseMessage(
  message: unknown,
): message is ProjectSourceAddResponseMessage {
  if (!isRecord(message)) return false;
  const type = message['type'];
  if (type !== 'project:sourceAdded' && type !== 'project:sourceRejected') return false;
  const result = message['result'];
  return isProjectSourceAddResult(result);
}

export async function handleProjectSourceAddHostRequest(
  request: ProjectSourceAddRequest,
  options: ProjectSourceAddHostOptions,
): Promise<ProjectSourceAddResult> {
  const result = await resolveProjectSourceAddHostRequest(request, options);
  await postProjectSourceAddResult(result, options);
  return result;
}

export async function postProjectSourceAddResult(
  result: ProjectSourceAddResult,
  options: Pick<ProjectSourceAddHostOptions, 'postMessage' | 'logger'>,
): Promise<void> {
  const message: ProjectSourceAddResponseMessage = result.ok
    ? { type: 'project:sourceAdded', result }
    : { type: 'project:sourceRejected', result };
  await options.postMessage(message);
  const logContext = {
    requestId: result.requestId,
    ok: result.ok,
    diagnostics: result.diagnostics.map((diagnostic) => diagnostic.code),
    durablePath: result.durablePath,
  };
  if (result.ok) {
    options.logger?.debug?.('projectSource.add.result', logContext);
  } else {
    options.logger?.warn?.('projectSource.add.rejected', logContext);
  }
}

export function normalizeProjectSourceAddBytes(
  bytes: Uint8Array | ArrayBuffer | readonly number[] | undefined,
): Uint8Array | undefined {
  if (!bytes) return undefined;
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return Uint8Array.from(bytes);
}

function waitForProjectSourceAddResult(
  request: ProjectSourceAddRequest,
  options: ProjectSourceAddClientOptions,
  inputTimeoutMs: number | undefined,
): Promise<ProjectSourceAddResult> {
  return new Promise((resolve) => {
    let settled = false;
    let cleanupAbortListener: (() => void) | undefined;

    const cleanup = () => {
      cleanupMessageListener?.();
      cleanupAbortListener?.();
      if (timerId !== undefined) {
        clearTimer(options, timerId);
      }
    };

    const finish = (result: ProjectSourceAddResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const cleanupMessageListener = options.addMessageListener((message) => {
      if (!isProjectSourceAddResponseMessage(message)) return;
      if (message.result.requestId !== request.requestId) return;
      finish(message.result);
    });

    if (options.signal) {
      const abort = () =>
        finish(
          createFailedProjectSourceAddResult(request.requestId, {
            code: 'add-source-cancelled',
            message: `Cancelled adding ${getProjectSourceAddDisplayName(request)}.`,
            recoverability: 'retry',
          }),
        );
      options.signal.addEventListener('abort', abort);
      cleanupAbortListener = () => options.signal?.removeEventListener('abort', abort);
    }

    const timerId = setTimer(
      options,
      () => {
        finish(
          createFailedProjectSourceAddResult(request.requestId, {
            code: 'add-source-timeout',
            message: `Timed out adding ${getProjectSourceAddDisplayName(request)}.`,
            recoverability: 'retry',
          }),
        );
      },
      inputTimeoutMs ?? options.timeoutMs ?? DEFAULT_PROJECT_SOURCE_ADD_TIMEOUT_MS,
    );

    options.postMessage({ type: 'project:addSource', request });
  });
}

async function resolveProjectSourceAddHostRequest(
  request: ProjectSourceAddRequest,
  options: ProjectSourceAddHostOptions,
): Promise<ProjectSourceAddResult> {
  try {
    if (options.addSource) {
      return await options.addSource(request);
    }
    if (!options.ingestPort) {
      return createFailedProjectSourceAddResult(request.requestId, {
        code: 'add-source-failed',
        message: 'Add-source host handler is missing an ingest port.',
        recoverability: 'manual',
      });
    }
    return await handleProjectSourceAddRequest(request, options.ingestPort);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.logger?.error?.('projectSource.add.failed', {
      requestId: request.requestId,
      message,
    });
    return createFailedProjectSourceAddResult(request.requestId, {
      code: 'add-source-failed',
      message,
      recoverability: 'manual',
    });
  }
}

function createFailedProjectSourceAddResult(
  requestId: string,
  diagnostic: {
    readonly code: ProjectFileDiagnostic['code'];
    readonly message: string;
    readonly recoverability?: ProjectFileDiagnostic['recoverability'];
  },
): ProjectSourceAddResult {
  return {
    requestId,
    ok: false,
    diagnostics: [
      createProjectFileDiagnostic({
        code: diagnostic.code,
        message: diagnostic.message,
        ...(diagnostic.recoverability ? { recoverability: diagnostic.recoverability } : {}),
      }),
    ],
  };
}

function projectBrowserFileFromFile(
  file: ProjectSourceAddFileLike | undefined,
): BrowserFileProjection | undefined {
  if (!file) return undefined;
  return {
    name: file.name,
    ...(file.size !== undefined ? { size: file.size } : {}),
    ...(file.type ? { type: file.type } : {}),
    ...(file.lastModified !== undefined ? { lastModified: file.lastModified } : {}),
  };
}

function getProjectSourceAddDisplayName(request: ProjectSourceAddRequest): string {
  return (
    request.browserFile?.name ??
    request.sourcePath ??
    request.sourceUri ??
    request.generatedAssetId ??
    'source'
  );
}

function isProjectSourceAddResult(value: unknown): value is ProjectSourceAddResult {
  if (!isRecord(value)) return false;
  return (
    typeof value['requestId'] === 'string' &&
    typeof value['ok'] === 'boolean' &&
    Array.isArray(value['diagnostics'])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function setTimer(
  options: ProjectSourceAddClientOptions,
  callback: () => void,
  timeoutMs: number,
): unknown {
  return options.setTimer ? options.setTimer(callback, timeoutMs) : setTimeout(callback, timeoutMs);
}

function clearTimer(options: ProjectSourceAddClientOptions, timerId: unknown): void {
  if (options.clearTimer) {
    options.clearTimer(timerId);
    return;
  }
  clearTimeout(timerId as ReturnType<typeof setTimeout>);
}

function createDefaultProjectSourceAddRequestId(): string {
  return `project-source-add-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
