import type {
  DshAcpDomainToolRequest,
  DshAcpDomainToolResponse,
  DshAcpJsonValue,
} from '@neko/agent-contracts/dsh-acp';
import {
  CHARACTER_DSH_TOOL_NAME,
  CharacterDshAuthoringService,
  decodeCharacterDshToolInput,
} from '@neko/chara/application';
import { enforceDshDomainToolEffect } from './dsh-domain-tool-access';

export class CharacterDshHostAdapter {
  private readonly toolName: string;

  constructor(
    private readonly service:
      | Pick<CharacterDshAuthoringService, 'query' | 'fillDraft'>
      | (() => Promise<Pick<CharacterDshAuthoringService, 'query' | 'fillDraft'>>),
    toolName: string = CHARACTER_DSH_TOOL_NAME,
  ) {
    if (toolName !== CHARACTER_DSH_TOOL_NAME) {
      throw new Error(`Character Host adapter must use exactly ${CHARACTER_DSH_TOOL_NAME}.`);
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
        'CHARACTER_DSH_TOOL_MISMATCH',
        `Expected ${this.toolName}, received ${request.tool}.`,
      );
    }
    let decoded;
    try {
      decoded = decodeCharacterDshToolInput(request.operation, request.input);
    } catch (error) {
      return failure('CHARACTER_DSH_TOOL_INVALID_INPUT', errorMessage(error));
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
      return { outcome: 'success', result: projectFacts(facts) };
    } catch (error) {
      return failure(toDiagnostic(error), errorMessage(error));
    }
  }
}

function projectFacts(
  facts: Awaited<ReturnType<CharacterDshAuthoringService['query']>>,
): DshAcpJsonValue {
  return {
    characterProjectId: facts.characterProjectId,
    displayName: facts.displayName,
    reviewStatus: facts.reviewStatus,
    isFreshTarget: facts.isFreshTarget,
    draft: {
      hasSummary: facts.draft.hasSummary,
      hasBackground: facts.draft.hasBackground,
      hasOrigin: facts.draft.hasOrigin,
      canonCount: facts.draft.canonCount,
      knowledgeBoundaryCount: facts.draft.knowledgeBoundaryCount,
      behaviorPolicyCount: facts.draft.behaviorPolicyCount,
      expressionPolicyCount: facts.draft.expressionPolicyCount,
      representationCount: facts.draft.representationCount,
    },
    evidenceCount: facts.evidenceCount,
    candidateCount: facts.candidateCount,
    versionCount: facts.versionCount,
    versions: facts.versions.map((publication) => ({
      characterVersionId: publication.characterVersionId,
      label: publication.label,
      lifecycle: publication.lifecycle,
      publishedAt: publication.publishedAt,
    })),
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
