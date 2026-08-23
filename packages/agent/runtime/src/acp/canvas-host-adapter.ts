import type {
  DshAcpDomainToolRequest,
  DshAcpDomainToolResponse,
} from '@neko/agent-contracts/dsh-acp';
import {
  CANVAS_DSH_TOOL_NAME,
  CanvasProjectAuthoringError,
  CanvasProjectAuthoringService,
  decodeCanvasDshToolInput,
  projectCanvasCreateNodeResult,
  projectCanvasQuerySnapshot,
} from '@neko/canvas-domain';
import { enforceDshDomainToolEffect } from './dsh-domain-tool-access';

export class CanvasDshHostAdapter {
  private readonly toolName: string;

  constructor(
    private readonly service:
      | Pick<CanvasProjectAuthoringService, 'query' | 'createNode'>
      | (() => Promise<Pick<CanvasProjectAuthoringService, 'query' | 'createNode'>>),
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
        const facts = projectCanvasQuerySnapshot(snapshot);
        return {
          outcome: 'success',
          result: {
            documentPath: facts.documentPath,
            nodeCount: facts.nodeCount,
            connectionCount: facts.connectionCount,
          },
        };
      }
      const current = await service.query({
        documentPath: decoded.input.documentPath,
        ...(signal === undefined ? {} : { signal }),
      });
      const result = await service.createNode({
        documentPath: decoded.input.documentPath,
        expectedFingerprint: current.fingerprint,
        node: decoded.input.node,
        ...(signal === undefined ? {} : { signal }),
      });
      const facts = projectCanvasCreateNodeResult(result);
      return {
        outcome: 'success',
        result: {
          documentPath: facts.documentPath,
          nodeId: facts.nodeId,
          nodeType: facts.nodeType,
          nodePosition: {
            x: facts.nodePosition.x,
            y: facts.nodePosition.y,
          },
          ...(facts.parentId === undefined ? {} : { parentId: facts.parentId }),
        },
      };
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
