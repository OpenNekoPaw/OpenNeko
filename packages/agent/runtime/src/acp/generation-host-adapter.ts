import type {
  DshAcpDomainToolRequest,
  DshAcpDomainToolResponse,
  DshAcpJsonValue,
} from '@neko/agent-contracts/dsh-acp';
import type { WorkspaceFileContentLocator } from '@neko/content';
import {
  GENERATION_DSH_TOOL_NAME,
  decodeGenerationDshToolInput,
  projectGenerationJobSnapshot,
} from '@neko/generation';
import {
  GENERATION_JOB_KIND,
  GenerationJobError,
  type GenerationJobRef,
  type GenerationJobSnapshot,
  type PurposeGenerationJobPort,
} from '@neko/generation/job';
import { isTerminalJobPhase } from '@neko/shared/job-lifecycle';

type GenerationDshJobPort = Pick<
  PurposeGenerationJobPort,
  'submitGeneration' | 'describeGeneration' | 'observeGeneration'
>;

export interface GenerationDshLifecycleProjectionOutcome {
  readonly status: 'accepted' | 'blocked';
  readonly diagnostic?: {
    readonly code: string;
    readonly message: string;
  };
}

export interface GenerationDshLifecycleProjectionPort {
  project(input: {
    readonly request: DshAcpDomainToolRequest;
    readonly snapshot: GenerationJobSnapshot;
  }): Promise<GenerationDshLifecycleProjectionOutcome>;
}

export class GenerationDshHostAdapter {
  private readonly toolName: string;

  constructor(
    private readonly jobs: GenerationDshJobPort | (() => Promise<GenerationDshJobPort>),
    toolName: string = GENERATION_DSH_TOOL_NAME,
    private readonly lifecycleProjection?: GenerationDshLifecycleProjectionPort,
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
        const submitted = await jobs.submitGeneration(decoded.input);
        await this.projectLifecycleSnapshot(request, submitted);
        const terminal = isGenerationToolSettled(submitted.phase)
          ? submitted
          : await observeGenerationSettlement(
              jobs,
              submitted.ref,
              (snapshot) => this.projectLifecycleSnapshot(request, snapshot),
              submitted,
              signal,
            );
        return generationSettlementResponse(terminal);
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

  private async projectLifecycleSnapshot(
    request: DshAcpDomainToolRequest,
    snapshot: GenerationJobSnapshot,
  ): Promise<void> {
    if (!this.lifecycleProjection) return;
    await this.lifecycleProjection.project({ request, snapshot });
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
    ...(facts.resultLocators === undefined
      ? {}
      : { resultLocators: facts.resultLocators.map(workspaceContentLocatorJson) }),
  };
}

async function observeGenerationSettlement(
  jobs: Pick<PurposeGenerationJobPort, 'observeGeneration'>,
  ref: GenerationJobRef,
  projectSnapshot: (snapshot: GenerationJobSnapshot) => Promise<void>,
  initialSnapshot: GenerationJobSnapshot,
  signal?: AbortSignal,
): Promise<GenerationJobSnapshot> {
  const iterator = jobs.observeGeneration(ref, signal)[Symbol.asyncIterator]();
  let lastProjected = initialSnapshot;
  try {
    while (true) {
      const next = await nextSnapshot(iterator, ref, signal);
      if (next.done) {
        throw new GenerationDshObservationError(
          'GENERATION_DSH_OBSERVATION_ENDED',
          `Generation Job '${ref.jobId}' observation ended before a settlement snapshot.`,
        );
      }
      if (next.value.ref.kind !== ref.kind || next.value.ref.jobId !== ref.jobId) {
        throw new GenerationDshObservationError(
          'GENERATION_DSH_OBSERVATION_IDENTITY_MISMATCH',
          `Generation Job '${ref.jobId}' observation returned a different Job identity.`,
        );
      }
      if (
        next.value.phase !== lastProjected.phase ||
        next.value.updatedAt !== lastProjected.updatedAt
      ) {
        await projectSnapshot(next.value);
        lastProjected = next.value;
      }
      if (isGenerationToolSettled(next.value.phase)) return next.value;
    }
  } finally {
    await iterator.return?.();
  }
}

function nextSnapshot(
  iterator: AsyncIterator<GenerationJobSnapshot>,
  ref: GenerationJobRef,
  signal?: AbortSignal,
): Promise<IteratorResult<GenerationJobSnapshot>> {
  if (signal === undefined) return iterator.next();
  if (signal.aborted) {
    return Promise.reject(
      new GenerationDshObservationError(
        'GENERATION_DSH_TOOL_ABORTED',
        `Generation Tool observation for Job '${ref.jobId}' was cancelled; the durable Job continues under Generation ownership.`,
      ),
    );
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = (): void => {
      finish(() => {
        reject(
          new GenerationDshObservationError(
            'GENERATION_DSH_TOOL_ABORTED',
            `Generation Tool observation for Job '${ref.jobId}' was cancelled; the durable Job continues under Generation ownership.`,
          ),
        );
      });
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void iterator.next().then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function generationSettlementResponse(snapshot: GenerationJobSnapshot): DshAcpDomainToolResponse {
  if (snapshot.phase !== 'succeeded') {
    const diagnostic = snapshot.failure ?? {
      code: `GENERATION_DSH_JOB_${snapshot.phase.toUpperCase().replaceAll('-', '_')}`,
      message: `Generation Job '${snapshot.ref.jobId}' reached settlement phase '${snapshot.phase}'.`,
    };
    return failure(
      diagnostic.code,
      `Generation Job '${snapshot.ref.jobId}' reached settlement phase '${snapshot.phase}': ${diagnostic.message}`,
    );
  }
  if (snapshot.resultLocators === undefined || snapshot.resultLocators.length === 0) {
    return failure(
      'GENERATION_DSH_JOB_RESULT_MISSING',
      `Generation Job '${snapshot.ref.jobId}' succeeded without a canonical result locator.`,
    );
  }
  return {
    outcome: 'success',
    result: generationFactsJson(projectGenerationJobSnapshot(snapshot)),
    jobId: snapshot.ref.jobId,
  };
}

function isGenerationToolSettled(phase: GenerationJobSnapshot['phase']): boolean {
  return phase === 'outcome-unknown' || isTerminalJobPhase(phase);
}

function workspaceContentLocatorJson(locator: WorkspaceFileContentLocator): DshAcpJsonValue {
  if (locator.selector !== undefined) {
    throw new GenerationDshObservationError(
      'GENERATION_DSH_JOB_RESULT_INVALID',
      `Generation result '${locator.file.path}' must identify a whole Workspace file.`,
    );
  }
  return {
    file: {
      authority: locator.file.authority,
      path: locator.file.path,
    },
  };
}

class GenerationDshObservationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GenerationDshObservationError';
    this.code = code;
  }
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
