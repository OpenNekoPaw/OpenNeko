import { access, copyFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import {
  isRecordingPromotionRequest,
  type RecordingProjectFactInput,
  type RecordingProjectFactRef,
  type RecordingPromotionRequest,
  type RecordingPromotionResult,
} from '@neko/shared';

export type RecordingPromotionErrorCode =
  | 'recording-promotion-invalid-request'
  | 'recording-promotion-invalid-destination'
  | 'recording-project-fact-write-failed';

export class RecordingPromotionError extends Error {
  readonly code: RecordingPromotionErrorCode;
  readonly destinationPath: string | null;

  constructor(options: {
    readonly code: RecordingPromotionErrorCode;
    readonly message: string;
    readonly destinationPath?: string;
    readonly cause?: unknown;
  }) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'RecordingPromotionError';
    this.code = options.code;
    this.destinationPath = options.destinationPath ?? null;
  }
}

export interface RecordingPromotionServiceOptions {
  readonly registerProjectFact: (
    input: RecordingProjectFactInput,
  ) => Promise<RecordingProjectFactRef>;
}

export class RecordingPromotionService {
  constructor(private readonly options: RecordingPromotionServiceOptions) {}

  async promote(request: RecordingPromotionRequest): Promise<RecordingPromotionResult> {
    validateRequest(request);
    const destinationPath = resolve(request.destinationPath);
    validateDestination(resolve(request.workspaceRoot), destinationPath);

    if (request.copyMode === 'copy-preview') {
      if (resolve(request.sourcePath) === destinationPath) {
        throw new RecordingPromotionError({
          code: 'recording-promotion-invalid-request',
          message: 'Preview promotion source and destination must be different.',
          destinationPath,
        });
      }
      await mkdir(dirname(destinationPath), { recursive: true });
      await copyFile(request.sourcePath, destinationPath);
    } else {
      if (resolve(request.sourcePath) !== destinationPath) {
        throw new RecordingPromotionError({
          code: 'recording-promotion-invalid-request',
          message: 'Already-durable recording source must equal its destination.',
          destinationPath,
        });
      }
      await access(destinationPath);
    }

    const provenance = {
      sourceRecordingId: request.sourceRecordingId,
      producer: request.producer,
      recordedAt: request.recordedAt,
      sourceAuthority: 'preview-recording' as const,
    };
    let projectFact: RecordingProjectFactRef;
    try {
      projectFact = await this.options.registerProjectFact({
        destinationPath,
        mediaType: request.mediaType,
        provenance,
      });
    } catch (error) {
      throw new RecordingPromotionError({
        code: 'recording-project-fact-write-failed',
        message: `Recording bytes are durable at ${destinationPath}, but project fact registration failed.`,
        destinationPath,
        cause: error,
      });
    }
    return { destinationPath, projectFact, provenance };
  }
}

function validateRequest(request: RecordingPromotionRequest): void {
  if (!isRecordingPromotionRequest(request)) {
    throw new RecordingPromotionError({
      code: 'recording-promotion-invalid-request',
      message: 'Recording promotion request is invalid.',
    });
  }
  if (
    !isAbsolute(request.sourcePath) ||
    !isAbsolute(request.destinationPath) ||
    !isAbsolute(request.workspaceRoot)
  ) {
    throw new RecordingPromotionError({
      code: 'recording-promotion-invalid-request',
      message: 'Recording promotion Host paths must be absolute runtime paths.',
      destinationPath: request.destinationPath,
    });
  }
}

function validateDestination(workspaceRoot: string, destinationPath: string): void {
  const workspaceRelativePath = relative(workspaceRoot, destinationPath);
  if (workspaceRelativePath === '.neko' || workspaceRelativePath.startsWith(`.neko${sep}`)) {
    throw new RecordingPromotionError({
      code: 'recording-promotion-invalid-destination',
      message: 'Retained recordings cannot use workspace .neko as their durable destination.',
      destinationPath,
    });
  }
}
