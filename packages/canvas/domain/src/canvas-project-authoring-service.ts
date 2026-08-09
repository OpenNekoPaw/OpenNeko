import {
  isContentFingerprint,
  normalizeWorkspaceContentPath,
  type AuthorizedWorkspaceWriter,
  type ContentFingerprint,
  type ContentReadService,
  type WorkspaceFileContentLocator,
} from '@neko/content';

import { loadNkc, saveNkc } from './nkc';
import type { CanvasConnection, CanvasData, CanvasNode } from './types/canvas';
import type {
  CanvasCreateConnectionRequest,
  CanvasNodeCreateSpec,
  CanvasUpdateBlockRequest,
} from './types/canvas-agent-operations';
import type { CanvasHeadlessAuthoringOperation } from './types/canvas-headless-authoring';
import {
  applyCanvasHeadlessAuthoringOperations,
  planCanvasBlockUpdate,
  planCanvasConnectionCreation,
  planCanvasNodeCreation,
} from './utils/canvasHeadlessAuthoring';

const MAX_CANVAS_PROJECT_BYTES = 64 * 1024 * 1024;

export interface CanvasProjectSnapshot {
  readonly documentPath: string;
  readonly fingerprint: ContentFingerprint;
  readonly canvas: CanvasData;
}

export interface CanvasProjectAuthoringServiceOptions {
  readonly contentRead: ContentReadService;
  readonly workspaceWriter: AuthorizedWorkspaceWriter;
}

export interface CanvasProjectNodeMutationResult extends CanvasProjectSnapshot {
  readonly node: CanvasNode;
}

export interface CanvasProjectConnectionMutationResult extends CanvasProjectSnapshot {
  readonly connection: CanvasConnection;
}

export class CanvasProjectAuthoringError extends Error {
  constructor(
    readonly code:
      | 'invalid-target'
      | 'read-failed'
      | 'invalid-document'
      | 'invalid-fingerprint'
      | 'stale-project'
      | 'invalid-operation'
      | 'write-failed',
    message: string,
  ) {
    super(message);
    this.name = 'CanvasProjectAuthoringError';
  }
}

export class CanvasProjectAuthoringService {
  constructor(private readonly options: CanvasProjectAuthoringServiceOptions) {}

  async query(input: {
    readonly documentPath: string;
    readonly signal?: AbortSignal;
  }): Promise<CanvasProjectSnapshot> {
    return this.readProject(input.documentPath, undefined, input.signal);
  }

  async apply(input: {
    readonly documentPath: string;
    readonly expectedFingerprint: ContentFingerprint;
    readonly operations: readonly CanvasHeadlessAuthoringOperation[];
    readonly signal?: AbortSignal;
  }): Promise<CanvasProjectSnapshot> {
    if (!isContentFingerprint(input.expectedFingerprint)) {
      throw new CanvasProjectAuthoringError(
        'invalid-fingerprint',
        'Canvas authoring requires the exact fingerprint returned by a Canvas query.',
      );
    }
    if (input.operations.length === 0) {
      throw new CanvasProjectAuthoringError(
        'invalid-operation',
        'Canvas authoring requires at least one operation.',
      );
    }
    const current = await this.readProject(
      input.documentPath,
      input.expectedFingerprint,
      input.signal,
    );
    let canvas: CanvasData;
    try {
      canvas = applyCanvasHeadlessAuthoringOperations(current.canvas, input.operations);
    } catch (error) {
      throw new CanvasProjectAuthoringError(
        'invalid-operation',
        error instanceof Error ? error.message : 'Canvas authoring operation is invalid.',
      );
    }
    let bytes: Uint8Array;
    try {
      bytes = new TextEncoder().encode(saveNkc(canvas));
    } catch (error) {
      throw new CanvasProjectAuthoringError(
        'invalid-document',
        error instanceof Error ? error.message : 'Canvas document validation failed.',
      );
    }
    const locator = canvasLocator(current.documentPath);
    const written = await this.options.workspaceWriter.write(locator, bytes, {
      conflict: 'replace',
      expectedFingerprint: input.expectedFingerprint,
      maxBytes: MAX_CANVAS_PROJECT_BYTES,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (written.status !== 'written') {
      throw new CanvasProjectAuthoringError(
        written.diagnostic.code === 'content-changed' ? 'stale-project' : 'write-failed',
        `Canvas project write failed: ${written.diagnostic.code}.`,
      );
    }
    if (!written.fingerprint) {
      throw new CanvasProjectAuthoringError(
        'write-failed',
        'Canvas project writer did not return durable freshness.',
      );
    }
    return {
      documentPath: current.documentPath,
      fingerprint: written.fingerprint,
      canvas,
    };
  }

  async createNode(input: {
    readonly documentPath: string;
    readonly expectedFingerprint: ContentFingerprint;
    readonly node: CanvasNodeCreateSpec;
    readonly signal?: AbortSignal;
  }): Promise<CanvasProjectNodeMutationResult> {
    const current = await this.readProject(
      input.documentPath,
      input.expectedFingerprint,
      input.signal,
    );
    let plan: ReturnType<typeof planCanvasNodeCreation>;
    try {
      plan = planCanvasNodeCreation({ canvasData: current.canvas }, input.node);
    } catch (error) {
      throw invalidOperation(error);
    }
    const snapshot = await this.apply({
      documentPath: input.documentPath,
      expectedFingerprint: input.expectedFingerprint,
      operations: plan.batch.operations,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    return { ...snapshot, node: plan.result.node };
  }

  async updateBlock(input: {
    readonly documentPath: string;
    readonly expectedFingerprint: ContentFingerprint;
    readonly request: CanvasUpdateBlockRequest;
    readonly signal?: AbortSignal;
  }): Promise<CanvasProjectNodeMutationResult> {
    const current = await this.readProject(
      input.documentPath,
      input.expectedFingerprint,
      input.signal,
    );
    let plan: ReturnType<typeof planCanvasBlockUpdate>;
    try {
      plan = planCanvasBlockUpdate({ canvasData: current.canvas }, input.request);
    } catch (error) {
      throw invalidOperation(error);
    }
    const snapshot = await this.apply({
      documentPath: input.documentPath,
      expectedFingerprint: input.expectedFingerprint,
      operations: plan.batch.operations,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    const node = snapshot.canvas.nodes.find((candidate) => candidate.id === input.request.nodeId);
    if (!node) {
      throw new CanvasProjectAuthoringError(
        'invalid-operation',
        'Canvas block update did not preserve its exact node target.',
      );
    }
    return { ...snapshot, node };
  }

  async createConnection(input: {
    readonly documentPath: string;
    readonly expectedFingerprint: ContentFingerprint;
    readonly connection: CanvasCreateConnectionRequest;
    readonly signal?: AbortSignal;
  }): Promise<CanvasProjectConnectionMutationResult> {
    const current = await this.readProject(
      input.documentPath,
      input.expectedFingerprint,
      input.signal,
    );
    let plan: ReturnType<typeof planCanvasConnectionCreation>;
    try {
      plan = planCanvasConnectionCreation({ canvasData: current.canvas }, input.connection);
    } catch (error) {
      throw invalidOperation(error);
    }
    const snapshot = await this.apply({
      documentPath: input.documentPath,
      expectedFingerprint: input.expectedFingerprint,
      operations: plan.batch.operations,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (!plan.result.connection) {
      throw new CanvasProjectAuthoringError(
        'invalid-operation',
        'Canvas connection planner did not return the created connection.',
      );
    }
    return { ...snapshot, connection: plan.result.connection };
  }

  private async readProject(
    documentPath: string,
    expectedFingerprint: ContentFingerprint | undefined,
    signal: AbortSignal | undefined,
  ): Promise<CanvasProjectSnapshot> {
    const locator = canvasLocator(documentPath);
    const result = await this.options.contentRead.read(locator, {
      maxBytes: MAX_CANVAS_PROJECT_BYTES,
      ...(expectedFingerprint ? { expectedFingerprint } : {}),
      ...(signal ? { signal } : {}),
    });
    if (result.status !== 'ready') {
      throw new CanvasProjectAuthoringError(
        result.diagnostic.code === 'content-changed' ? 'stale-project' : 'read-failed',
        `Canvas project read failed: ${result.diagnostic.code}.`,
      );
    }
    let source: string;
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(result.bytes);
    } catch {
      throw new CanvasProjectAuthoringError(
        'invalid-document',
        'Canvas project is not valid UTF-8.',
      );
    }
    const loaded = loadNkc(source);
    if (!loaded.validation.valid) {
      const details = loaded.validation.errors
        .map((diagnostic) => `${diagnostic.field}: ${diagnostic.message}`)
        .join('; ');
      throw new CanvasProjectAuthoringError(
        'invalid-document',
        `Canvas project validation failed: ${details}.`,
      );
    }
    return {
      documentPath: locator.path,
      fingerprint: result.fingerprint,
      canvas: loaded.data,
    };
  }
}

function invalidOperation(error: unknown): CanvasProjectAuthoringError {
  return new CanvasProjectAuthoringError(
    'invalid-operation',
    error instanceof Error ? error.message : 'Canvas authoring operation is invalid.',
  );
}

function canvasLocator(documentPath: string): WorkspaceFileContentLocator {
  let normalized: string | undefined;
  try {
    normalized = normalizeWorkspaceContentPath(documentPath);
  } catch {
    throw new CanvasProjectAuthoringError(
      'invalid-target',
      'Canvas project target must be a normalized Workspace-relative .nkc path.',
    );
  }
  if (
    normalized === undefined ||
    normalized !== documentPath ||
    !normalized.toLowerCase().endsWith('.nkc')
  ) {
    throw new CanvasProjectAuthoringError(
      'invalid-target',
      'Canvas project target must be a normalized Workspace-relative .nkc path.',
    );
  }
  return { kind: 'workspace-file', path: normalized };
}
