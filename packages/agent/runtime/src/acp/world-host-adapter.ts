import type {
  DshAcpDomainToolRequest,
  DshAcpDomainToolResponse,
  DshAcpJsonValue,
} from '@neko/agent-contracts/dsh-acp';
import {
  WORLD_DSH_TOOL_NAME,
  WorldDshAuthoringService,
  decodeWorldDshToolInput,
} from '@neko/world-domain/application';
import { enforceDshDomainToolEffect } from './dsh-domain-tool-access';

export class WorldDshHostAdapter {
  constructor(
    private readonly service:
      | Pick<WorldDshAuthoringService, 'query' | 'fillDraft'>
      | (() => Promise<Pick<WorldDshAuthoringService, 'query' | 'fillDraft'>>),
    private readonly toolName: string = WORLD_DSH_TOOL_NAME,
  ) {
    if (toolName !== WORLD_DSH_TOOL_NAME)
      throw new Error(`World Host adapter must use exactly ${WORLD_DSH_TOOL_NAME}.`);
  }

  async execute(
    request: DshAcpDomainToolRequest,
    signal?: AbortSignal,
  ): Promise<DshAcpDomainToolResponse> {
    signal?.throwIfAborted();
    if (request.tool !== this.toolName)
      return failure(
        'WORLD_DSH_TOOL_MISMATCH',
        `Expected ${this.toolName}, received ${request.tool}.`,
      );
    let decoded;
    try {
      decoded = decodeWorldDshToolInput(request.operation, request.input);
    } catch (error) {
      return failure('WORLD_DSH_TOOL_INVALID_INPUT', message(error));
    }
    const permissionFailure = enforceDshDomainToolEffect(
      request,
      decoded.operation === 'query' ? 'read' : 'write',
    );
    if (permissionFailure !== undefined) return permissionFailure;
    try {
      const service = typeof this.service === 'function' ? await this.service() : this.service;
      const facts =
        decoded.operation === 'query'
          ? await service.query(decoded.input, signal)
          : await service.fillDraft(decoded.input, signal);
      return { outcome: 'success', result: project(facts) };
    } catch (error) {
      return failure(toDiagnostic(error), message(error));
    }
  }
}

function project(facts: Awaited<ReturnType<WorldDshAuthoringService['query']>>): DshAcpJsonValue {
  return {
    worldProjectId: facts.worldProjectId,
    title: facts.title,
    reviewStatus: facts.reviewStatus,
    isFreshTarget: facts.isFreshTarget,
    draft: facts.draft,
    sourceCount: facts.sourceCount,
    versionCount: facts.versionCount,
    versions: facts.versions.map((publication) => ({
      worldVersionId: publication.worldVersionId,
      label: publication.label,
      lifecycle: publication.lifecycle,
      publishedAt: publication.publishedAt,
    })),
    versionsTruncated: facts.versionsTruncated,
    createdAt: facts.createdAt,
    updatedAt: facts.updatedAt,
  };
}

function failure(code: string, message: string): DshAcpDomainToolResponse {
  return { outcome: 'failure', diagnostic: { code, message } };
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function toDiagnostic(error: unknown): string {
  return typeof (error as { code?: unknown })?.code === 'string'
    ? String((error as { code: string }).code)
    : 'WORLD_DSH_EXECUTION_FAILED';
}
