import type {
  DshAcpDomainToolRequest,
  DshAcpDomainToolResponse,
} from '@neko/agent-contracts/dsh-acp';
import {
  CANVAS_DSH_TOOL_NAME,
  CanvasProjectAuthoringError,
  canvasDshCreateConnectionRequest,
  canvasDshCreateNodeSpec,
  canvasDshUpdateNodeRequest,
  decodeCanvasDshToolInput,
  projectCanvasConnectionMutationResult,
  projectCanvasNodeMutationResult,
  projectCanvasQuerySnapshot,
  type CanvasCreateConnectionRequest,
  type CanvasNodeCreateSpec,
  type CanvasProjectConnectionMutationResult,
  type CanvasProjectNodeMutationResult,
  type CanvasProjectSnapshot,
  type CanvasUpdateBlockRequest,
} from '@neko/canvas-domain';
import { enforceDshDomainToolEffect } from './dsh-domain-tool-access';

export interface CanvasDshAuthoringPort {
  query(input: {
    readonly documentPath: string;
    readonly signal?: AbortSignal;
  }): Promise<CanvasProjectSnapshot>;
  createNode(input: {
    readonly documentPath: string;
    readonly node: CanvasNodeCreateSpec;
    readonly signal?: AbortSignal;
  }): Promise<CanvasProjectNodeMutationResult>;
  updateNode(input: {
    readonly documentPath: string;
    readonly request: CanvasUpdateBlockRequest;
    readonly signal?: AbortSignal;
  }): Promise<CanvasProjectNodeMutationResult>;
  createConnection(input: {
    readonly documentPath: string;
    readonly connection: CanvasCreateConnectionRequest;
    readonly signal?: AbortSignal;
  }): Promise<CanvasProjectConnectionMutationResult>;
}

export class CanvasDshHostAdapter {
  private readonly toolName: string;

  constructor(
    private readonly service: CanvasDshAuthoringPort | (() => Promise<CanvasDshAuthoringPort>),
    toolName: string = CANVAS_DSH_TOOL_NAME,
  ) {
    if (toolName !== CANVAS_DSH_TOOL_NAME) {
      throw new Error(`Canvas Host adapter must use exactly ${CANVAS_DSH_TOOL_NAME}.`);
    }
    this.toolName = toolName;
  }

  async execute(
    request: DshAcpDomainToolRequest,
    signal?: AbortSignal,
  ): Promise<DshAcpDomainToolResponse> {
    signal?.throwIfAborted();
    if (request.tool !== this.toolName) {
      return failure(
        'CANVAS_DSH_TOOL_MISMATCH',
        `Expected ${this.toolName}, received ${request.tool}.`,
      );
    }
    let decoded;
    try {
      decoded = decodeCanvasDshToolInput(request.operation, request.input);
    } catch (error) {
      return failure('CANVAS_DSH_TOOL_INVALID_INPUT', errorMessage(error));
    }
    const permissionFailure = enforceDshDomainToolEffect(
      request,
      decoded.operation === 'query' ? 'read' : 'write',
    );
    if (permissionFailure !== undefined) return permissionFailure;
    try {
      const service = typeof this.service === 'function' ? await this.service() : this.service;
      if (decoded.operation === 'query') {
        const snapshot = await service.query({
          documentPath: decoded.input.documentPath,
          ...(signal === undefined ? {} : { signal }),
        });
        return { outcome: 'success', result: projectCanvasQuerySnapshot(snapshot, decoded.input) };
      }
      const command = decoded.input.command;
      if (command.kind === 'create_node') {
        const result = await service.createNode({
          documentPath: decoded.input.documentPath,
          node: canvasDshCreateNodeSpec(command),
          ...(signal === undefined ? {} : { signal }),
        });
        return {
          outcome: 'success',
          result: projectCanvasNodeMutationResult(command.kind, result),
        };
      }
      if (command.kind === 'update_node') {
        const result = await service.updateNode({
          documentPath: decoded.input.documentPath,
          request: canvasDshUpdateNodeRequest(command),
          ...(signal === undefined ? {} : { signal }),
        });
        return {
          outcome: 'success',
          result: projectCanvasNodeMutationResult(command.kind, result),
        };
      }
      const result = await service.createConnection({
        documentPath: decoded.input.documentPath,
        connection: canvasDshCreateConnectionRequest(command),
        ...(signal === undefined ? {} : { signal }),
      });
      return { outcome: 'success', result: projectCanvasConnectionMutationResult(result) };
    } catch (error) {
      return failure(toCanvasDiagnostic(error), errorMessage(error));
    }
  }
}

function toCanvasDiagnostic(error: unknown): string {
  if (error instanceof CanvasProjectAuthoringError) return error.code;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : 'CANVAS_DSH_TOOL_FAILED';
  }
  return 'CANVAS_DSH_TOOL_FAILED';
}

function failure(code: string, message: string): DshAcpDomainToolResponse {
  return { outcome: 'failure', diagnostic: { code, message } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
