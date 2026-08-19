import type { GenerationJobSnapshot, SubmitPurposeGenerationJobInput } from './job/contracts';
import { GENERATION_JOB_KIND } from './job/contracts';
import { decodeSubmitPurposeGenerationJobInput } from './job/codec';

export const GENERATION_DSH_TOOL_NAME = 'openneko.generation' as const;
export const GENERATION_DSH_TOOL_OPERATIONS = ['submit', 'describe'] as const;

export type GenerationDshToolOperation = (typeof GENERATION_DSH_TOOL_OPERATIONS)[number];

export type GenerationDshToolSubmitInput = SubmitPurposeGenerationJobInput;

export interface GenerationDshToolDescribeInput {
  readonly jobId: string;
}

export type GenerationDshToolInput =
  | {
      readonly operation: 'submit';
      readonly input: GenerationDshToolSubmitInput;
    }
  | {
      readonly operation: 'describe';
      readonly input: GenerationDshToolDescribeInput;
    };

export interface GenerationDshToolBoundedFacts {
  readonly jobId: string;
  readonly kind: typeof GENERATION_JOB_KIND;
  readonly phase: GenerationJobSnapshot['phase'];
  readonly stage: GenerationJobSnapshot['progress']['stage'];
  readonly lifecycleMode: GenerationJobSnapshot['lifecycleMode'];
  readonly generationType: GenerationJobSnapshot['request']['generationType'];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly failure?: GenerationJobSnapshot['failure'];
}

export function decodeGenerationDshToolInput(
  operation: unknown,
  input: unknown,
): GenerationDshToolInput {
  if (operation === 'submit') {
    return { operation, input: decodeSubmitInput(input) };
  }
  if (operation === 'describe') {
    return { operation, input: decodeDescribeInput(input) };
  }
  throw new Error(
    `Generation DSH tool operation must be one of ${GENERATION_DSH_TOOL_OPERATIONS.join(', ')}.`,
  );
}

export function projectGenerationJobSnapshot(
  snapshot: GenerationJobSnapshot,
): GenerationDshToolBoundedFacts {
  return {
    jobId: snapshot.ref.jobId,
    kind: snapshot.ref.kind,
    phase: snapshot.phase,
    stage: snapshot.progress.stage,
    lifecycleMode: snapshot.lifecycleMode,
    generationType: snapshot.request.generationType,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    ...(snapshot.failure === undefined ? {} : { failure: snapshot.failure }),
  };
}

function decodeSubmitInput(input: unknown): GenerationDshToolSubmitInput {
  return decodeSubmitPurposeGenerationJobInput(input);
}

function decodeDescribeInput(input: unknown): GenerationDshToolDescribeInput {
  const record = requireRecord(input, 'input');
  return { jobId: requireNonEmptyString(record.jobId, 'input.jobId') };
}

function requireRecord(input: unknown, field: string): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${field} must be an object.`);
  }
  return input as Record<string, unknown>;
}

function requireNonEmptyString(input: unknown, field: string): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return input;
}
