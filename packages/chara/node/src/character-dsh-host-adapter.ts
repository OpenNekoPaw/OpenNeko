import type {
  DshAcpDomainToolRequest,
  DshAcpDomainToolResponse,
  DshAcpJsonValue,
} from '@neko/agent-contracts/dsh-acp';
import {
  CHARACTER_DSH_TOOL_NAME,
  decodeCharacterDshToolInput,
  type CharacterDshAuthoringService,
  type CharacterDshProjectFacts,
  type CharacterDshToolInput,
} from '@neko/chara-domain/application';

export type CharacterDshToolEffect = 'read' | 'write';

export type CharacterDshToolAccess = (
  request: DshAcpDomainToolRequest,
  effect: CharacterDshToolEffect,
) => DshAcpDomainToolResponse | undefined;

export class CharacterDshHostAdapter {
  constructor(
    private readonly service:
      | Pick<CharacterDshAuthoringService, 'query' | 'fillDraft'>
      | (() => Promise<Pick<CharacterDshAuthoringService, 'query' | 'fillDraft'>>),
    private readonly checkAccess: CharacterDshToolAccess,
  ) {}

  async execute(
    request: DshAcpDomainToolRequest,
    signal?: AbortSignal,
  ): Promise<DshAcpDomainToolResponse> {
    signal?.throwIfAborted();
    if (request.tool !== CHARACTER_DSH_TOOL_NAME) {
      return failure(
        'CHARACTER_DSH_TOOL_MISMATCH',
        `Expected ${CHARACTER_DSH_TOOL_NAME}, received ${request.tool}.`,
      );
    }
    let decoded: CharacterDshToolInput;
    try {
      decoded = decodeCharacterDshToolInput(request.operation, request.input);
    } catch (error) {
      return failure('CHARACTER_DSH_TOOL_INVALID_INPUT', errorMessage(error));
    }
    const permissionFailure = this.checkAccess(
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
      return { outcome: 'success', result: projectResult(facts) };
    } catch (error) {
      return failure(toDiagnostic(error), errorMessage(error));
    }
  }
}

function projectResult(facts: CharacterDshProjectFacts): DshAcpJsonValue {
  return {
    characterProjectId: facts.characterProjectId,
    displayName: facts.displayName,
    reviewStatus: facts.reviewStatus,
    isFreshTarget: facts.isFreshTarget,
    draft: { ...facts.draft },
    evidenceCount: facts.evidenceCount,
    candidateCount: facts.candidateCount,
    versionCount: facts.versionCount,
    versions: facts.versions.map((publication) => ({ ...publication })),
    versionsTruncated: facts.versionsTruncated,
    createdAt: facts.createdAt,
    updatedAt: facts.updatedAt,
  };
}

function toDiagnostic(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : 'CHARACTER_DSH_TOOL_FAILED';
  }
  return 'CHARACTER_DSH_TOOL_FAILED';
}

function failure(code: string, message: string): DshAcpDomainToolResponse {
  return { outcome: 'failure', diagnostic: { code, message } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
