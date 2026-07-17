/**
 * MediaDiffService 单元测试
 *
 * 测试媒体 Diff 服务的核心功能
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('vscode', () => ({
  Disposable: { from: vi.fn() },
  Uri: {
    file: (path: string) => ({ scheme: 'file', fsPath: path, path }),
    parse: (uri: string) => ({ scheme: 'file', fsPath: uri, path: uri }),
  },
  workspace: {
    fs: {
      readFile: vi.fn(),
    },
  },
  commands: {
    executeCommand: vi.fn(),
  },
  extensions: {
    getExtension: vi.fn(),
  },
}));

import { MediaDiffService } from './MediaDiffService';
import { AnalyzerRegistry, type IMediaDiffAnalyzer } from './analyzers/IMediaDiffAnalyzer';
import type { DiffResult, DiffOptions, MediaType } from '@neko/shared';
import type { IScheduler } from '../../contracts/IScheduler';
import type { IWorkspaceIO } from '../../contracts/IWorkspaceIO';

// =============================================================================
// Mock Analyzer
// =============================================================================

class MockAnalyzer implements IMediaDiffAnalyzer {
  readonly mediaType: MediaType;
  private shouldFail = false;
  private delay = 0;
  private cancelled = false;

  constructor(mediaType: MediaType) {
    this.mediaType = mediaType;
  }

  setFailure(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  setDelay(delay: number): void {
    this.delay = delay;
  }

  async analyze(current: Buffer, previous: Buffer, options?: DiffOptions): Promise<DiffResult> {
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    if (this.cancelled) {
      throw new Error('Analysis cancelled');
    }

    if (this.shouldFail) {
      throw new Error('Mock analyzer failure');
    }

    return {
      mediaType: this.mediaType,
      similarity: 0.85,
      details: {
        width: { current: 100, previous: 100 },
        height: { current: 100, previous: 100 },
        format: { current: 'png', previous: 'png' },
      },
    };
  }

  cancel(): void {
    this.cancelled = true;
  }

  supports(filePath: string): boolean {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (this.mediaType) {
      case 'image':
        return ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '');
      case 'video':
        return ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext || '');
      case 'audio':
        return ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext || '');
      default:
        return false;
    }
  }
}

// =============================================================================
// Mock Git Service
// =============================================================================

const createMockGitService = () => ({
  isReady: vi.fn().mockReturnValue(true),
  getChangedMediaFiles: vi.fn().mockResolvedValue([]),
  getFileVersions: vi.fn().mockResolvedValue({
    current: Buffer.from('current').buffer,
    previous: Buffer.from('previous').buffer,
    currentPath: '/test/image.png',
    previousPath: '/test/image.png@HEAD',
    mediaType: 'image' as MediaType,
  }),
  getFileAtCommit: vi.fn().mockResolvedValue(Buffer.from('content')),
  isTracked: vi.fn().mockResolvedValue(true),
  dispose: vi.fn(),
});

const createMockScheduler = (): IScheduler => ({
  scheduleOnce: vi.fn((callback: () => void, delayMs: number) => {
    const handle = setTimeout(callback, delayMs);
    return {
      cancel: vi.fn(() => clearTimeout(handle)),
    };
  }),
  wait: vi.fn((delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs))),
});

const createMockWorkspaceIO = (): IWorkspaceIO =>
  ({
    readFile: vi.fn().mockResolvedValue(new Uint8Array(Buffer.from('local-file'))),
    stat: vi.fn(),
    findFiles: vi.fn(),
    createFileSystemWatcher: vi.fn(),
    getTextDocuments: vi.fn().mockReturnValue([]),
    getVisibleTextEditors: vi.fn().mockReturnValue([]),
    onDidOpenTextDocument: vi.fn(),
    onDidChangeTextDocument: vi.fn(),
    onDidCloseTextDocument: vi.fn(),
  }) as unknown as IWorkspaceIO;

// =============================================================================
// AnalyzerRegistry Tests
// =============================================================================

describe('AnalyzerRegistry', () => {
  let registry: AnalyzerRegistry;

  beforeEach(() => {
    registry = new AnalyzerRegistry();
  });

  afterEach(() => {
    registry.clear();
  });

  describe('register', () => {
    it('should register an analyzer', () => {
      const analyzer = new MockAnalyzer('image');

      registry.register(analyzer);

      expect(registry.isSupported('image')).toBe(true);
    });

    it('should allow multiple analyzers for different types', () => {
      const imageAnalyzer = new MockAnalyzer('image');
      const videoAnalyzer = new MockAnalyzer('video');
      const audioAnalyzer = new MockAnalyzer('audio');

      registry.register(imageAnalyzer);
      registry.register(videoAnalyzer);
      registry.register(audioAnalyzer);

      expect(registry.isSupported('image')).toBe(true);
      expect(registry.isSupported('video')).toBe(true);
      expect(registry.isSupported('audio')).toBe(true);
    });

    it('should replace existing analyzer for same type', () => {
      const analyzer1 = new MockAnalyzer('image');
      const analyzer2 = new MockAnalyzer('image');

      registry.register(analyzer1);
      registry.register(analyzer2);

      expect(registry.get('image')).toBe(analyzer2);
    });
  });

  describe('get', () => {
    it('should return registered analyzer', () => {
      const analyzer = new MockAnalyzer('image');
      registry.register(analyzer);

      expect(registry.get('image')).toBe(analyzer);
    });

    it('should return undefined for unregistered type', () => {
      expect(registry.get('image')).toBeUndefined();
    });
  });

  describe('isSupported', () => {
    it('should return true for supported type', () => {
      registry.register(new MockAnalyzer('image'));

      expect(registry.isSupported('image')).toBe(true);
    });

    it('should return false for unsupported type', () => {
      expect(registry.isSupported('image')).toBe(false);
    });
  });

  describe('cancelAll', () => {
    it('should cancel all registered analyzers', () => {
      const imageAnalyzer = new MockAnalyzer('image');
      const videoAnalyzer = new MockAnalyzer('video');

      const cancelSpy1 = vi.spyOn(imageAnalyzer, 'cancel');
      const cancelSpy2 = vi.spyOn(videoAnalyzer, 'cancel');

      registry.register(imageAnalyzer);
      registry.register(videoAnalyzer);

      registry.cancelAll();

      expect(cancelSpy1).toHaveBeenCalled();
      expect(cancelSpy2).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should remove all analyzers', () => {
      registry.register(new MockAnalyzer('image'));
      registry.register(new MockAnalyzer('video'));

      registry.clear();

      expect(registry.isSupported('image')).toBe(false);
      expect(registry.isSupported('video')).toBe(false);
    });
  });
});

// =============================================================================
// MediaDiffService Tests
// =============================================================================

describe('MediaDiffService', () => {
  let service: MediaDiffService;
  let mockGitService: ReturnType<typeof createMockGitService>;
  let mockRegistry: AnalyzerRegistry;
  let mockWorkspaceIO: IWorkspaceIO;
  let mockScheduler: IScheduler;

  beforeEach(() => {
    mockGitService = createMockGitService();
    mockRegistry = new AnalyzerRegistry();
    mockWorkspaceIO = createMockWorkspaceIO();
    mockScheduler = createMockScheduler();
    service = new MediaDiffService(
      mockGitService as any,
      mockRegistry,
      mockWorkspaceIO,
      mockScheduler,
    );
  });

  afterEach(() => {
    service.dispose();
  });

  describe('isSupported', () => {
    it('should return true for supported file types', () => {
      mockRegistry.register(new MockAnalyzer('image'));

      // Mock getMediaType to return 'image' for .png files
      const mockUri = { fsPath: '/test/image.png' } as any;

      expect(service.isSupported(mockUri)).toBe(true);
    });

    it('should return false for unsupported file types', () => {
      const mockUri = { fsPath: '/test/file.xyz' } as any;

      expect(service.isSupported(mockUri)).toBe(false);
    });
  });

  describe('registerAnalyzer', () => {
    it('should register analyzer in registry', () => {
      const analyzer = new MockAnalyzer('image');

      service.registerAnalyzer(analyzer);

      expect(mockRegistry.isSupported('image')).toBe(true);
    });
  });

  describe('getFileVersions', () => {
    it('should delegate to git service', async () => {
      const mockUri = { fsPath: '/test/image.png' } as any;

      await service.getFileVersions(mockUri, 'HEAD');

      expect(mockGitService.getFileVersions).toHaveBeenCalledWith(mockUri, 'HEAD');
    });
  });

  describe('isTracked', () => {
    it('should delegate to git service', async () => {
      const mockUri = { fsPath: '/test/image.png' } as any;

      await service.isTracked(mockUri);

      expect(mockGitService.isTracked).toHaveBeenCalledWith(mockUri);
    });
  });

  describe('getLocalFileVersions', () => {
    it('should read both files through workspace IO', async () => {
      const currentUri = { fsPath: '/test/current.png' } as any;
      const previousUri = { fsPath: '/test/previous.png' } as any;
      const readFile = vi
        .mocked(mockWorkspaceIO.readFile)
        .mockResolvedValueOnce(new Uint8Array(Buffer.from('current')))
        .mockResolvedValueOnce(new Uint8Array(Buffer.from('previous')));

      const result = await service.getLocalFileVersions(currentUri, previousUri);

      expect(readFile).toHaveBeenCalledWith(currentUri);
      expect(readFile).toHaveBeenCalledWith(previousUri);
      expect(Buffer.from(result.current).toString()).toContain('current');
      expect(Buffer.from(result.previous).toString()).toContain('previous');
    });
  });

  describe('cancel', () => {
    it('should cancel registry analyzers', () => {
      const cancelSpy = vi.spyOn(mockRegistry, 'cancelAll');

      service.cancel();

      expect(cancelSpy).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should cancel and clean up', () => {
      const cancelSpy = vi.spyOn(service, 'cancel');
      const gitDisposeSpy = mockGitService.dispose;
      const registryClearSpy = vi.spyOn(mockRegistry, 'clear');

      service.dispose();

      expect(cancelSpy).toHaveBeenCalled();
      expect(gitDisposeSpy).toHaveBeenCalled();
      expect(registryClearSpy).toHaveBeenCalled();
    });
  });
});
