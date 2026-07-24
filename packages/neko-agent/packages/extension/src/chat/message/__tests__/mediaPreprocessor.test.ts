import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaPreprocessor } from '../mediaPreprocessor';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';

const processMock = vi.hoisted(() => vi.fn());
const processImageMock = vi.hoisted(() => vi.fn());
const processVideoMock = vi.hoisted(() => vi.fn());
const visionDeps = vi.hoisted(
  () =>
    [] as Array<{
      readFile: (filePath: string) => Promise<Uint8Array>;
      videoProcessor?: unknown;
    }>,
);
const readImageBytesDuringProcess = vi.hoisted(() => ({ enabled: false }));

vi.mock('@neko/platform/media', () => ({
  VisionPreprocessor: class {
    constructor(
      private readonly deps: {
        readFile: (filePath: string) => Promise<Uint8Array>;
        videoProcessor?: unknown;
      },
    ) {
      visionDeps.push(deps);
    }

    process = processMock;
    processImage = async (filePath: string) => {
      if (readImageBytesDuringProcess.enabled) {
        await this.deps.readFile(filePath);
      }
      return processImageMock(filePath);
    };
    processVideo = processVideoMock;
  },
}));

vi.mock('../../../services/visionImageProcessor', () => ({
  createSharpVisionImageProcessor: vi.fn(() => ({})),
}));

vi.mock('../../../base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('MediaPreprocessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    visionDeps.length = 0;
    readImageBytesDuringProcess.enabled = false;
  });

  it('passes media paths to the platform preprocessor unchanged', async () => {
    processImageMock.mockResolvedValue({ type: 'unsupported', images: [] });
    processVideoMock.mockResolvedValue({ type: 'unsupported', images: [] });

    const processor = new MediaPreprocessor(null);
    await processor.processImage('/Volumes/assets/image/ref.png');
    await processor.processVideo('/Volumes/assets/video/ref.mp4', { maxFrames: 3 });

    expect(processImageMock).toHaveBeenCalledWith('/Volumes/assets/image/ref.png');
    expect(processVideoMock).toHaveBeenCalledWith('/Volumes/assets/video/ref.mp4', {
      maxFrames: 3,
    });
  });

  it('loads image preprocessing bytes through Agent content access runtime', async () => {
    readImageBytesDuringProcess.enabled = true;
    processImageMock.mockResolvedValue({ type: 'image', images: [] });
    const contentAccessRuntime = createContentAccessRuntime(new Uint8Array([1, 2, 3]));

    const processor = new MediaPreprocessor(null, contentAccessRuntime);
    await processor.processImage('/Volumes/assets/image/ref.png');

    expect(contentAccessRuntime.loadProviderAsset).toHaveBeenCalledWith({
      source: { kind: 'file', path: '/Volumes/assets/image/ref.png' },
      mimeTypeHint: 'image/png',
    });
    expect(processImageMock).toHaveBeenCalledWith('/Volumes/assets/image/ref.png');
  });

  it('keeps video preprocessing Engine-backed and does not use image content access', async () => {
    const contentAccessRuntime = createContentAccessRuntime(new Uint8Array([1, 2, 3]));
    processVideoMock.mockResolvedValue({
      type: 'unsupported',
      images: [],
      metadata: { duration: 0 },
    });

    const processor = new MediaPreprocessor(null, contentAccessRuntime);
    await processor.processVideo('/Volumes/assets/video/ref.mp4', { maxFrames: 3 });

    expect(visionDeps[0]?.videoProcessor).toBeNull();
    expect(contentAccessRuntime.loadProviderAsset).not.toHaveBeenCalled();
    expect(processVideoMock).toHaveBeenCalledWith('/Volumes/assets/video/ref.mp4', {
      maxFrames: 3,
    });
  });
});

function createContentAccessRuntime(bytes: Uint8Array): AgentContentAccessRuntime {
  return {
    resolve: vi.fn(),
    resolveImageMetadata: vi.fn(),
    resolveDocumentContent: vi.fn(),
    loadProviderAsset: vi.fn(async () => ({
      status: 'ready' as const,
      diagnostics: [],
      bytes,
      mimeType: 'image/png',
      sizeBytes: bytes.byteLength,
    })),
    projectResource: vi.fn(),
  } as unknown as AgentContentAccessRuntime;
}
