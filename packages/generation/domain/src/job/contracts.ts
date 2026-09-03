import type { JobRef, JobSnapshotBase, JobStore } from '@neko/shared/job-lifecycle';
import type { WorkspaceFileContentLocator } from '@neko/content-domain';
import type {
  AudioGenerationRequest,
  ImageGenerationRequest,
  MediaGenerationType,
  VideoGenerationRequest,
} from '../contracts';
import type {
  GenerationExecutionResult,
  GenerationProviderTaskRef,
  PromptGenerationRequest,
} from '../execution';

export const GENERATION_JOB_KIND = 'generation' as const;

export type GenerationJobRef = JobRef<typeof GENERATION_JOB_KIND>;
export type GenerationJobLifecycleMode = 'linked' | 'detached';

export type GenerationJobStage =
  'queued' | 'submitting' | 'waiting-provider' | 'committing-result' | 'completed';

export type { GenerationProviderTaskRef } from '../execution';

interface GenerationJobRequestBase {
  readonly providerId: string;
  readonly modelId: string;
}

export type GenerationJobRequest =
  | (GenerationJobRequestBase & {
      readonly generationType: 'prompt';
      readonly request: PromptGenerationRequest;
    })
  | (GenerationJobRequestBase & {
      readonly generationType: Extract<
        MediaGenerationType,
        'text-to-image' | 'image-to-image' | 'image-edit'
      >;
      readonly request: ImageGenerationRequest;
    })
  | (GenerationJobRequestBase & {
      readonly generationType: Extract<
        MediaGenerationType,
        'text-to-video' | 'image-to-video' | 'video-to-video' | 'video-edit'
      >;
      readonly request: VideoGenerationRequest;
    })
  | (GenerationJobRequestBase & {
      readonly generationType: Extract<MediaGenerationType, 'text-to-audio'>;
      readonly request: AudioGenerationRequest;
    });

export interface GenerationJobProgress {
  readonly stage: GenerationJobStage;
  readonly percent: number;
}

export interface GenerationJobSnapshot extends JobSnapshotBase<typeof GENERATION_JOB_KIND> {
  readonly submissionId?: string;
  readonly regenerateOf?: GenerationJobRef;
  readonly lifecycleMode: GenerationJobLifecycleMode;
  readonly request: GenerationJobRequest;
  readonly progress: GenerationJobProgress;
  readonly providerTask?: GenerationProviderTaskRef;
  readonly resultLocators?: readonly WorkspaceFileContentLocator[];
}

export interface GenerationJobReadDiagnostic {
  readonly code: 'generation-job-persistence-invalid';
  readonly ref: GenerationJobRef;
  readonly message: string;
}

export interface GenerationJobRecoveryRecords {
  readonly snapshots: readonly GenerationJobSnapshot[];
  readonly diagnostics: readonly GenerationJobReadDiagnostic[];
}

export interface GenerationJobStore extends JobStore<GenerationJobSnapshot> {
  listRecoverable(): Promise<GenerationJobRecoveryRecords>;
  findBySubmissionId(submissionId: string): Promise<GenerationJobSnapshot | undefined>;
}

export type SubmitGenerationJobInput = GenerationJobRequest & {
  readonly lifecycleMode: GenerationJobLifecycleMode;
  readonly submissionId?: string;
  readonly retryOf?: GenerationJobRef;
  readonly regenerateOf?: GenerationJobRef;
};

type ModelBoundGenerationJobRequest = GenerationJobRequest;

type PurposeGenerationRequest<
  T extends ModelBoundGenerationJobRequest = ModelBoundGenerationJobRequest,
> = T extends GenerationJobRequest
  ? Omit<T, 'providerId' | 'modelId'> & {
      readonly purpose: string;
      readonly lifecycleMode: GenerationJobLifecycleMode;
    }
  : never;

export type SubmitPurposeGenerationJobInput = PurposeGenerationRequest;

export interface GenerationJobCommandInput {
  readonly ref: GenerationJobRef;
}

export interface GenerationJobResultCommitter {
  commit(input: {
    readonly ref: GenerationJobRef;
    readonly generation: GenerationExecutionResult;
  }): Promise<readonly WorkspaceFileContentLocator[]>;
}

export interface GenerationJobPort {
  submitGeneration(input: SubmitGenerationJobInput): Promise<GenerationJobSnapshot>;
  describeGeneration(ref: GenerationJobRef): Promise<GenerationJobSnapshot>;
  observeGeneration(
    ref: GenerationJobRef,
    signal?: AbortSignal,
  ): AsyncIterable<GenerationJobSnapshot>;
  cancelGeneration(input: GenerationJobCommandInput): Promise<GenerationJobSnapshot>;
  retryGeneration(input: GenerationJobCommandInput): Promise<GenerationJobSnapshot>;
  regenerateGeneration(input: GenerationJobCommandInput): Promise<GenerationJobSnapshot>;
  reconcileGeneration(input: GenerationJobCommandInput): Promise<GenerationJobSnapshot>;
}

export interface PurposeGenerationJobPort extends Omit<GenerationJobPort, 'submitGeneration'> {
  submitGeneration(input: SubmitPurposeGenerationJobInput): Promise<GenerationJobSnapshot>;
}

export interface PurposeGenerationBindingResolver {
  resolveGenerationBinding(
    purpose: string,
  ):
    | { readonly providerId: string; readonly modelId: string }
    | undefined
    | Promise<{ readonly providerId: string; readonly modelId: string } | undefined>;
}

export type GenerationJobErrorCode =
  | 'generation-job-invalid-progress'
  | 'generation-job-binding-mismatch'
  | 'generation-job-result-unavailable'
  | 'generation-job-cancel-unsupported'
  | 'generation-job-reconcile-unavailable'
  | 'generation-job-retry-unavailable'
  | 'generation-job-regenerate-unavailable'
  | 'generation-job-submission-conflict'
  | 'generation-job-persistence-invalid';

export class GenerationJobError extends Error {
  constructor(
    readonly code: GenerationJobErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GenerationJobError';
  }
}
