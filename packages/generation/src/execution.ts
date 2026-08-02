import type {
  AudioGenerationRequest,
  ImageGenerationRequest,
  MediaAdapterResult,
  MediaGenerationType,
  MediaOutput,
  VideoGenerationRequest,
} from './contracts';

export interface GenerationProviderTaskRef {
  readonly providerId: string;
  readonly externalTaskId: string;
}

export interface MediaGenerationExecutionOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: number) => void;
  readonly onExternalTask?: (task: GenerationProviderTaskRef) => void | Promise<void>;
}

export interface MediaGenerationResult {
  readonly type: MediaGenerationType;
  readonly providerId: string;
  readonly modelId: string;
  readonly outputs: readonly MediaOutput[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly request: ImageGenerationRequest | VideoGenerationRequest | AudioGenerationRequest;
}

export interface GenerationExecutionPort {
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
  describeExternalTask(task: GenerationProviderTaskRef): Promise<MediaAdapterResult>;
  cancelExternalTask(task: GenerationProviderTaskRef): Promise<void>;
}
