import type {
  AudioGenerationRequest,
  ImageGenerationRequest,
  GenerationProviderTaskObservation,
  MediaGenerationType,
  MediaOutput,
  VideoGenerationRequest,
} from './contracts';

export interface GenerationProviderTaskRef {
  readonly providerId: string;
  readonly externalTaskId: string;
}

export interface GenerationProviderTaskBinding extends GenerationProviderTaskRef {
  readonly modelId: string;
}

export interface MediaGenerationExecutionOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: number) => void;
  readonly onExternalTask?: (
    task: GenerationProviderTaskRef,
  ) => GenerationProviderTaskObservation | void | Promise<GenerationProviderTaskObservation | void>;
}

export interface MediaGenerationResult {
  readonly type: MediaGenerationType;
  readonly providerId: string;
  readonly modelId: string;
  readonly outputs: readonly MediaOutput[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest;
}

export interface PromptGenerationRequest {
  readonly prompt: string;
  readonly context?: readonly {
    readonly sourceNodeId: string;
    readonly text: string;
    readonly digest: string;
  }[];
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
}

export interface PromptGenerationResult {
  readonly type: 'prompt';
  readonly providerId: string;
  readonly modelId: string;
  readonly text: string;
  readonly request: PromptGenerationRequest;
}

export type GenerationExecutionResult = MediaGenerationResult | PromptGenerationResult;

/**
 * The provider accepted a submission but the transport closed before a result
 * or recoverable provider task identity was returned.
 */
export class GenerationExecutionOutcomeUnknownError extends Error {
  override readonly name = 'GenerationExecutionOutcomeUnknownError';
}

export interface MediaGenerationExecutionPort {
  generateImage(
    request: ImageGenerationRequest,
    options?: MediaGenerationExecutionOptions,
  ): Promise<MediaGenerationResult>;
  generateVideo(
    request: VideoGenerationRequest,
    options?: MediaGenerationExecutionOptions,
  ): Promise<MediaGenerationResult>;
  generateAudio(
    request: AudioGenerationRequest,
    options?: MediaGenerationExecutionOptions,
  ): Promise<MediaGenerationResult>;
  describeExternalTask(
    task: GenerationProviderTaskBinding,
  ): Promise<GenerationProviderTaskObservation>;
  cancelExternalTask(task: GenerationProviderTaskBinding): Promise<void>;
}

export interface PromptGenerationExecutionPort {
  generatePrompt(
    request: PromptGenerationRequest & {
      readonly providerId: string;
      readonly modelId: string;
    },
    options?: Pick<MediaGenerationExecutionOptions, 'signal'>,
  ): Promise<PromptGenerationResult>;
}

export interface GenerationExecutionPort
  extends MediaGenerationExecutionPort, PromptGenerationExecutionPort {}
