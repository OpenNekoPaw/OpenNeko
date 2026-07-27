import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    file: (filePath: string) => ({
      fsPath: filePath,
      path: filePath,
      scheme: 'file',
      toString: () => `file://${filePath}`,
    }),
  },
}));

import type * as vscode from 'vscode';
import type { DiffResult, FileVersionPair } from '@neko-tools/contracts';
import type { IMediaRuntimeService } from '../../contracts/IMediaRuntimeService';
import type { IScheduledTask, IScheduler } from '../../contracts/IScheduler';
import type { ITempFileService } from '../../contracts/ITempFileService';
import type { IWorkspaceIO } from '../../contracts/IWorkspaceIO';
import { MediaDiffService } from './MediaDiffService';
import type { IGitMediaService } from './GitMediaService';

const imageResult: DiffResult = {
  mediaType: 'image',
  similarity: 0.8,
  details: {
    dimensions: {
      current: { width: 1, height: 1 },
      previous: { width: 1, height: 1 },
    },
    pixelDifference: 0.2,
    structuralSimilarity: 0.8,
  },
};

function createUri(filePath: string): vscode.Uri {
  return {
    fsPath: filePath,
    path: filePath,
    scheme: 'file',
    toString: () => `file://${filePath}`,
  } as vscode.Uri;
}

function createGitVersions(overrides: Partial<FileVersionPair> = {}): FileVersionPair {
  return {
    current: Uint8Array.from([1]).buffer,
    previous: Uint8Array.from([2]).buffer,
    currentPath: '/workspace/current.png',
    previousPath: '/workspace/previous.png',
    mediaType: 'image',
    ...overrides,
  };
}

function createGitService(): IGitMediaService {
  return {
    isReady: vi.fn(() => true),
    getChangedMediaFiles: vi.fn(async () => []),
    getFileVersions: vi.fn(async () => createGitVersions()),
    getFileAtCommit: vi.fn(async () => Buffer.from([1])),
    getFileHistory: vi.fn(async () => []),
    extractFileToPath: vi.fn(async () => undefined),
    isTracked: vi.fn(async () => true),
    dispose: vi.fn(),
  };
}

function createRuntimeService(): IMediaRuntimeService {
  return {
    runtime: {
      probe: vi.fn(),
      captureFrame: vi.fn(),
      generateWaveform: vi.fn(),
      prepareVideo: vi.fn(),
      startPcm: vi.fn(),
      stop: vi.fn(),
      dispose: vi.fn(),
    },
    compare: vi.fn(async () => imageResult),
    probe: vi.fn(),
  };
}

function createWorkspaceIO(): IWorkspaceIO {
  return {
    readFile: vi.fn(async (uri: vscode.Uri) =>
      Uint8Array.from(uri.fsPath.includes('current') ? [1] : [2]),
    ),
  } as unknown as IWorkspaceIO;
}

function createScheduler(): IScheduler & {
  readonly scheduledCallbacks: Array<() => void>;
} {
  const scheduledCallbacks: Array<() => void> = [];
  return {
    scheduledCallbacks,
    scheduleOnce: vi.fn((callback: () => void): IScheduledTask => {
      scheduledCallbacks.push(callback);
      return { cancel: vi.fn() };
    }),
    wait: vi.fn(async () => undefined),
  };
}

function createTempFileService(): ITempFileService {
  let sequence = 0;
  return {
    createTempPath: vi.fn(),
    writeTempFile: vi.fn(async (_prefix, extension) => `/tmp/media-${sequence++}${extension}`),
    deleteTempFile: vi.fn(async () => undefined),
  };
}

function createService(dependencies?: {
  gitService?: IGitMediaService;
  runtimeService?: IMediaRuntimeService;
  workspaceIO?: IWorkspaceIO;
  scheduler?: IScheduler;
  tempFileService?: ITempFileService;
}): MediaDiffService {
  return new MediaDiffService(
    dependencies?.gitService ?? createGitService(),
    dependencies?.runtimeService ?? createRuntimeService(),
    dependencies?.workspaceIO ?? createWorkspaceIO(),
    dependencies?.scheduler ?? createScheduler(),
    dependencies?.tempFileService ?? createTempFileService(),
  );
}

describe('MediaDiffService', () => {
  it('owns only image/audio/video file support', () => {
    const service = createService();

    expect(service.isSupported(createUri('/workspace/image.png'))).toBe(true);
    expect(service.isSupported(createUri('/workspace/audio.wav'))).toBe(true);
    expect(service.isSupported(createUri('/workspace/video.mp4'))).toBe(true);
    expect(service.isSupported(createUri('/workspace/legacy.nkv'))).toBe(false);
  });

  it('uses the canonical runtime comparison for local files', async () => {
    const runtimeService = createRuntimeService();
    const service = createService({ runtimeService });
    const signal = new AbortController().signal;

    await expect(
      service.analyzeLocalFiles(
        createUri('/workspace/current.png'),
        createUri('/workspace/previous.png'),
        { precision: 0.9 },
        undefined,
        signal,
      ),
    ).resolves.toEqual(imageResult);

    expect(runtimeService.compare).toHaveBeenCalledWith(
      'image',
      '/workspace/current.png',
      '/workspace/previous.png',
      { precision: 0.9 },
      expect.any(AbortSignal),
    );
  });

  it('rejects cross-media comparison before invoking the runtime', async () => {
    const runtimeService = createRuntimeService();
    const service = createService({ runtimeService });

    await expect(
      service.analyzeLocalFiles(
        createUri('/workspace/current.png'),
        createUri('/workspace/previous.mp4'),
      ),
    ).rejects.toThrow('Cannot compare different media types');
    expect(runtimeService.compare).not.toHaveBeenCalled();
  });

  it('returns an explicit new-file result without manufacturing a comparison', async () => {
    const gitService = createGitService();
    vi.mocked(gitService.getFileVersions).mockResolvedValue(createGitVersions({ isNewFile: true }));
    const runtimeService = createRuntimeService();
    const service = createService({ gitService, runtimeService });

    await expect(service.analyze(createUri('/workspace/new.png'))).resolves.toEqual({
      mediaType: 'image',
      similarity: 0,
      details: { isNewFile: true },
    });
    expect(runtimeService.compare).not.toHaveBeenCalled();
  });

  it('keeps extracted files alive until comparison settles and then deletes them', async () => {
    const runtimeService = createRuntimeService();
    let resolveComparison: ((result: DiffResult) => void) | undefined;
    vi.mocked(runtimeService.compare).mockImplementation(
      () =>
        new Promise<DiffResult>((resolve) => {
          resolveComparison = resolve;
        }),
    );
    const tempFileService = createTempFileService();
    const service = createService({ runtimeService, tempFileService });

    const analysis = service.analyze(createUri('/workspace/image.png'));
    await vi.waitFor(() => expect(runtimeService.compare).toHaveBeenCalledTimes(1));
    expect(tempFileService.deleteTempFile).not.toHaveBeenCalled();

    resolveComparison?.(imageResult);
    await expect(analysis).resolves.toEqual(imageResult);
    expect(tempFileService.deleteTempFile).toHaveBeenCalledTimes(2);
  });

  it('cleans the first temporary file when the second materialization fails', async () => {
    const tempFileService = createTempFileService();
    vi.mocked(tempFileService.writeTempFile)
      .mockResolvedValueOnce('/tmp/current.png')
      .mockRejectedValueOnce(new Error('second write failed'));
    const service = createService({ tempFileService });

    await expect(service.analyze(createUri('/workspace/image.png'))).rejects.toThrow(
      'second write failed',
    );
    expect(tempFileService.deleteTempFile).toHaveBeenCalledWith('/tmp/current.png');
  });

  it('fails a successful comparison when temporary cleanup fails', async () => {
    const tempFileService = createTempFileService();
    vi.mocked(tempFileService.deleteTempFile).mockRejectedValue(new Error('cleanup failed'));
    const service = createService({ tempFileService });

    await expect(service.analyze(createUri('/workspace/image.png'))).rejects.toThrow(
      'Failed to clean up media comparison temporary files',
    );
  });

  it('preserves the primary comparison failure when cleanup also fails', async () => {
    const tempFileService = createTempFileService();
    vi.mocked(tempFileService.deleteTempFile).mockRejectedValue(new Error('cleanup failed'));
    const runtimeService = createRuntimeService();
    vi.mocked(runtimeService.compare).mockRejectedValue(new Error('comparison failed'));
    const service = createService({ tempFileService, runtimeService });

    await expect(service.analyze(createUri('/workspace/image.png'))).rejects.toThrow(
      'comparison failed',
    );
  });

  it('forwards cancellation to the same runtime operation', async () => {
    const runtimeService = createRuntimeService();
    vi.mocked(runtimeService.compare).mockImplementation(
      (_mediaType, _currentPath, _previousPath, _options, signal) =>
        new Promise<DiffResult>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    const service = createService({ runtimeService });
    const controller = new AbortController();
    const analysis = service.analyzeLocalFiles(
      createUri('/workspace/current.png'),
      createUri('/workspace/previous.png'),
      {},
      undefined,
      controller.signal,
    );

    controller.abort(new Error('test cancellation'));

    await expect(analysis).rejects.toThrow('test cancellation');
    const comparisonSignal = vi.mocked(runtimeService.compare).mock.calls[0]?.[4];
    expect(comparisonSignal?.aborted).toBe(true);
  });

  it('aborts the runtime when the comparison timeout fires', async () => {
    const scheduler = createScheduler();
    const runtimeService = createRuntimeService();
    vi.mocked(runtimeService.compare).mockImplementation(
      (_mediaType, _currentPath, _previousPath, _options, signal) =>
        new Promise<DiffResult>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    const service = createService({ scheduler, runtimeService });
    const analysis = service.analyzeLocalFiles(
      createUri('/workspace/current.png'),
      createUri('/workspace/previous.png'),
      { timeout: 25 },
    );

    await vi.waitFor(() => expect(scheduler.scheduledCallbacks).toHaveLength(1));
    scheduler.scheduledCallbacks[0]?.();

    await expect(analysis).rejects.toThrow('timed out after 25ms');
  });

  it('reads local versions through the workspace boundary', async () => {
    const workspaceIO = createWorkspaceIO();
    const service = createService({ workspaceIO });
    const currentUri = createUri('/workspace/current.png');
    const previousUri = createUri('/workspace/previous.png');

    const versions = await service.getLocalFileVersions(currentUri, previousUri);

    expect(workspaceIO.readFile).toHaveBeenCalledWith(currentUri);
    expect(workspaceIO.readFile).toHaveBeenCalledWith(previousUri);
    expect(Array.from(new Uint8Array(versions.current))).toEqual([1]);
    expect(Array.from(new Uint8Array(versions.previous))).toEqual([2]);
  });
});
