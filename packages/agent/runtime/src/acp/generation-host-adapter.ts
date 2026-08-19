import type {
  DshAcpDomainToolRequest,
  DshAcpDomainToolResponse,
  DshAcpJsonValue,
} from '@neko/agent-contracts/dsh-acp';
import {
  GENERATION_DSH_TOOL_NAME,
  decodeGenerationDshToolInput,
  projectGenerationJobSnapshot,
} from '@neko/generation';
import {
  GENERATION_JOB_KIND,
  GenerationJobError,
  type GenerationJobRef,
  type PurposeGenerationJobPort,
} from '@neko/generation/job';

export class GenerationDshHostAdapter {
  private readonly toolName: string;

  constructor(
    private readonly jobs:
      | Pick<PurposeGenerationJobPort, 'submitGeneration' | 'describeGeneration'>
      | (() => Promise<Pick<PurposeGenerationJobPort, 'submitGeneration' | 'describeGeneration'>>),
    toolName: string = GENERATION_DSH_TOOL_NAME,
  ) {
    if (toolName !== GENERATION_DSH_TOOL_NAME) {
      throw new Error(`Generation Host adapter must use exactly ${GENERATION_DSH_TOOL_NAME}.`);
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
        'GENERATION_DSH_TOOL_MISMATCH',
        `Expected ${this.toolName}, received ${request.tool}.`,
      );
    }
    let decoded;
    try {
      decoded = decodeGenerationDshToolInput(request.operation, request.input);
    } catch (error) {
      return failure('GENERATION_DSH_TOOL_INVALID_INPUT', errorMessage(error));
    }
    try {
      const jobs = typeof this.jobs === 'function' ? await this.jobs() : this.jobs;
      if (decoded.operation === 'submit') {
        const snapshot = await jobs.submitGeneration(decoded.input);
        return {
          outcome: 'success',
          result: generationFactsJson(projectGenerationJobSnapshot(snapshot)),
          jobId: snapshot.ref.jobId,
        };
      }
      const ref: GenerationJobRef = {
        kind: GENERATION_JOB_KIND,
        jobId: decoded.input.jobId,
      };
      const snapshot = await jobs.describeGeneration(ref);
      return {
        outcome: 'success',
        result: generationFactsJson(projectGenerationJobSnapshot(snapshot)),
        jobId: snapshot.ref.jobId,
      };
    } catch (error) {
      return failure(toGenerationDiagnostic(error), errorMessage(error));
    }
  }
}

function generationFactsJson(
  facts: ReturnType<typeof projectGenerationJobSnapshot>,
): DshAcpJsonValue {
  return {
    jobId: facts.jobId,
    kind: facts.kind,
    phase: facts.phase,
    stage: facts.stage,
    lifecycleMode: facts.lifecycleMode,
    generationType: facts.generationType,
    createdAt: facts.createdAt,
    updatedAt: facts.updatedAt,
    ...(facts.failure === undefined
      ? {}
      : {
          failure: {
            code: facts.failure.code,
            message: facts.failure.message,
            ...(facts.failure.retryable === undefined
              ? {}
              : { retryable: facts.failure.retryable }),
          },
        }),
  };
}

function toGenerationDiagnostic(error: unknown): string {
  if (error instanceof GenerationJobError) return error.code;
  return readDiagnosticCode(error) ?? 'GENERATION_DSH_TOOL_FAILED';
}

function readDiagnosticCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function failure(code: string, message: string): DshAcpDomainToolResponse {
  return { outcome: 'failure', diagnostic: { code, message } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
