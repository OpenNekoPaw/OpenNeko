import { randomUUID } from 'node:crypto';
import { lstat, mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import {
  CanvasHostVisibleEffectError,
  type CanvasMaterialActionCapabilityAvailability,
} from '@neko/canvas-domain';
import type { ContentLocator, WorkspaceFileContentLocator } from '@neko/content-domain';
import { authorizeWorkspaceContainedPath } from '@neko/content-domain/node';
import type { MediaProbe } from '@neko/media';
import { NodeMediaRuntime } from '@neko/media/node';
import { resolveProjectWorkspaceContentLocator } from '@neko/assets-node';

const DERIVED_AUDIO_DIRECTORY = 'neko/derived/audio';

export interface CanvasAudioExtractionMediaPort {
  probe(sourcePath: string, signal?: AbortSignal): Promise<MediaProbe>;
  transcode(
    sourcePath: string,
    outputPath: string,
    options: { readonly kind: 'audio' },
    signal?: AbortSignal,
  ): Promise<void>;
  dispose(): Promise<void>;
}

export interface CanvasAudioExtractionMessages {
  readonly sourceUnavailable: string;
  readonly videoStreamUnavailable: string;
  readonly audioStreamUnavailable: string;
  readonly probeFailed: string;
  readonly extractionFailed: string;
  readonly outputUnavailable: string;
}

export interface CanvasAudioExtractionResult {
  readonly locator: WorkspaceFileContentLocator;
  readonly title: string;
}

const DEFAULT_MESSAGES: CanvasAudioExtractionMessages = {
  sourceUnavailable: 'The selected video file is unavailable.',
  videoStreamUnavailable: 'The selected file does not contain a video stream.',
  audioStreamUnavailable: 'This video does not contain an audio stream to extract.',
  probeFailed: 'The video streams could not be inspected.',
  extractionFailed: 'The audio file could not be extracted from this video.',
  outputUnavailable: 'The derived audio directory is unavailable.',
};

/**
 * Owns the Node-side media derivation transaction. Canvas remains the authority
 * for committing the returned portable material as a new node.
 */
export class CanvasAudioExtractionService {
  private readonly media: CanvasAudioExtractionMediaPort;
  private readonly messages: CanvasAudioExtractionMessages;
  private readonly createId: () => string;
  private disposed = false;

  constructor(
    private readonly options: {
      readonly globalMediaLibraryRoot: string;
      readonly media?: CanvasAudioExtractionMediaPort;
      readonly messages?: Partial<CanvasAudioExtractionMessages>;
      readonly createId?: () => string;
    },
  ) {
    this.media = options.media ?? new NodeMediaRuntime();
    this.messages = { ...DEFAULT_MESSAGES, ...options.messages };
    this.createId = options.createId ?? randomUUID;
  }

  async resolveAvailability(input: {
    readonly projectId: string;
    readonly workspace: AssetWorkspaceResolution;
    readonly source: ContentLocator;
  }): Promise<CanvasMaterialActionCapabilityAvailability> {
    this.requireActive();
    let sourcePath: string;
    try {
      sourcePath = await this.resolveSource(input);
    } catch {
      return unavailable('media-source-unavailable', this.messages.sourceUnavailable);
    }
    try {
      const probe = await this.media.probe(sourcePath);
      return this.availabilityForProbe(probe);
    } catch {
      return unavailable('media-probe-failed', this.messages.probeFailed);
    }
  }

  async extract(input: {
    readonly projectId: string;
    readonly workspace: AssetWorkspaceResolution;
    readonly source: ContentLocator;
    readonly signal?: AbortSignal;
  }): Promise<CanvasAudioExtractionResult> {
    this.requireActive();
    let sourcePath: string;
    try {
      sourcePath = await this.resolveSource(input);
    } catch {
      throw new CanvasHostVisibleEffectError(this.messages.sourceUnavailable);
    }

    let probe: MediaProbe;
    try {
      probe = await this.media.probe(sourcePath, input.signal);
    } catch {
      throw new CanvasHostVisibleEffectError(this.messages.probeFailed);
    }
    const availability = this.availabilityForProbe(probe);
    if (availability.status === 'unavailable') {
      throw new CanvasHostVisibleEffectError(availability.diagnostic.message);
    }

    const directory = await this.prepareOutputDirectory(input.workspace.workspacePath);
    const baseName = portableAudioBaseName(input.source);
    const outputId = this.createId();
    if (!/^[A-Za-z0-9_-]+$/u.test(outputId)) {
      throw new Error('Canvas audio extraction produced an invalid output identity.');
    }
    const fileName = `${baseName}-${outputId}.m4a`;
    const outputPath = path.join(directory, fileName);
    try {
      await this.media.transcode(sourcePath, outputPath, { kind: 'audio' }, input.signal);
    } catch {
      throw new CanvasHostVisibleEffectError(this.messages.extractionFailed);
    }
    return {
      locator: {
        file: { authority: 'workspace', path: `${DERIVED_AUDIO_DIRECTORY}/${fileName}` },
      },
      title: `${baseName}.m4a`,
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.media.dispose();
  }

  private async resolveSource(input: {
    readonly projectId: string;
    readonly workspace: AssetWorkspaceResolution;
    readonly source: ContentLocator;
  }): Promise<string> {
    if (input.source.file.authority !== 'workspace' || input.source.selector !== undefined) {
      throw new Error('Canvas audio extraction requires a Workspace video file.');
    }
    return resolveProjectWorkspaceContentLocator(
      {
        projectId: input.projectId,
        workspaceRoot: input.workspace.workspacePath,
        globalMediaLibraryRoot: this.options.globalMediaLibraryRoot,
      },
      { file: input.source.file },
    );
  }

  private availabilityForProbe(probe: MediaProbe): CanvasMaterialActionCapabilityAvailability {
    if (!probe.video) {
      return unavailable('media-video-stream-unavailable', this.messages.videoStreamUnavailable);
    }
    if (probe.audioStreams.length === 0) {
      return unavailable('media-audio-stream-unavailable', this.messages.audioStreamUnavailable);
    }
    return { status: 'available' };
  }

  private async prepareOutputDirectory(workspaceRoot: string): Promise<string> {
    let current = workspaceRoot;
    for (const segment of DERIVED_AUDIO_DIRECTORY.split('/')) {
      current = path.join(current, segment);
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (error) {
        if (!isNodeError(error, 'EEXIST')) {
          throw new CanvasHostVisibleEffectError(this.messages.outputUnavailable);
        }
      }
      try {
        const state = await lstat(current);
        if (!state.isDirectory() || state.isSymbolicLink()) {
          throw new Error('Canvas derived audio path is not a directory.');
        }
        const authorization = await authorizeWorkspaceContainedPath({
          workspaceRoot,
          requestedPath: current,
        });
        if (!authorization.authorized) {
          throw new Error(authorization.diagnostic.code);
        }
      } catch {
        throw new CanvasHostVisibleEffectError(this.messages.outputUnavailable);
      }
    }
    return current;
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Canvas audio extraction service is disposed.');
  }
}

function portableAudioBaseName(locator: ContentLocator): string {
  const sourceName = path.posix.basename(locator.file.path);
  const stem = path.posix.parse(sourceName).name;
  const portable = stem
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
  return `${portable || 'video'}-audio`;
}

function unavailable(
  code:
    | 'media-source-unavailable'
    | 'media-video-stream-unavailable'
    | 'media-audio-stream-unavailable'
    | 'media-probe-failed',
  message: string,
): CanvasMaterialActionCapabilityAvailability {
  return { status: 'unavailable', diagnostic: { code, message } };
}

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}
