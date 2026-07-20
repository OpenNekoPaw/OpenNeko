/**
 * FileOperationHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileOperationHandler } from '../fileOperationHandler';

vi.mock('vscode', async () => await import('../../../__mocks__/vscode'));

// Mock the logger
vi.mock('../../../base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  handleError: vi.fn(),
}));

describe('FileOperationHandler', () => {
  let handler: FileOperationHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new FileOperationHandler({});
  });

  describe('handleOpenFile', () => {
    it('should do nothing for empty path', async () => {
      const { commands } = await import('vscode');
      await handler.handleOpenFile('');

      expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it('should strip file:// protocol', async () => {
      const { commands } = await import('vscode');
      await handler.handleOpenFile('file:///tmp/test.txt');

      expect(commands.executeCommand).toHaveBeenCalledWith(
        'vscode.open',
        expect.objectContaining({ fsPath: '/tmp/test.txt' }),
      );
    });

    it('should open video with neko preview', async () => {
      const { commands } = await import('vscode');
      await handler.handleOpenFile('/tmp/video.mp4');

      expect(commands.executeCommand).toHaveBeenCalledWith(
        'vscode.openWith',
        expect.any(Object),
        'neko.videoPreview',
      );
    });

    it('should open audio with neko audio preview', async () => {
      const { commands } = await import('vscode');
      await handler.handleOpenFile('/tmp/audio.mp3');

      expect(commands.executeCommand).toHaveBeenCalledWith(
        'vscode.openWith',
        expect.any(Object),
        'neko.audioPreview',
      );
    });

    it('should open panoramic images and videos with neko panoramic preview', async () => {
      const { commands } = await import('vscode');
      await handler.handleOpenFile('/tmp/skybox.hdr');

      expect(commands.executeCommand).toHaveBeenCalledWith(
        'vscode.openWith',
        expect.any(Object),
        'neko.preview.panoramicImage',
      );

      vi.clearAllMocks();
      await handler.handleOpenFile('/tmp/tour_360.mp4');

      expect(commands.executeCommand).toHaveBeenCalledWith(
        'vscode.openWith',
        expect.any(Object),
        'neko.preview.panoramicVideo',
      );
    });

    it('should open non-media files with default editor', async () => {
      const { commands } = await import('vscode');
      await handler.handleOpenFile('/tmp/readme.md');

      expect(commands.executeCommand).toHaveBeenCalledWith('vscode.open', expect.any(Object));
    });

    it('should resolve generated asset refs before opening files', async () => {
      const { commands } = await import('vscode');
      handler = new FileOperationHandler({
        generatedAssetLookup: {
          get: vi.fn().mockReturnValue({
            id: 'asset-1',
            path: '/workspace/demo/neko/generated/image/task_1.png',
          }),
        },
      } as never);

      await handler.handleOpenFile('generated-assets/asset-1.png');

      expect(commands.executeCommand).toHaveBeenCalledWith(
        'vscode.open',
        expect.objectContaining({ fsPath: '/workspace/demo/neko/generated/image/task_1.png' }),
      );
    });

    it('should route various video extensions correctly', async () => {
      const { commands } = await import('vscode');
      for (const ext of ['mov', 'avi', 'mkv', 'webm']) {
        vi.clearAllMocks();
        await handler.handleOpenFile(`/tmp/video.${ext}`);
        expect(commands.executeCommand).toHaveBeenCalledWith(
          'vscode.openWith',
          expect.any(Object),
          'neko.videoPreview',
        );
      }
    });

    it('should route various audio extensions correctly', async () => {
      const { commands } = await import('vscode');
      for (const ext of ['wav', 'ogg', 'flac', 'aac']) {
        vi.clearAllMocks();
        await handler.handleOpenFile(`/tmp/audio.${ext}`);
        expect(commands.executeCommand).toHaveBeenCalledWith(
          'vscode.openWith',
          expect.any(Object),
          'neko.audioPreview',
        );
      }
    });
  });

  describe('handleOpenUrl', () => {
    it('should do nothing for empty url', async () => {
      const { env } = await import('vscode');
      await handler.handleOpenUrl('');

      expect(env.openExternal).not.toHaveBeenCalled();
    });

    it('should open url in external browser', async () => {
      const { env } = await import('vscode');
      await handler.handleOpenUrl('https://example.com');

      expect(env.openExternal).toHaveBeenCalled();
    });
  });

  describe('handleRevealDocumentLocator', () => {
    it('delegates document locator reveal to neko-preview', async () => {
      const { commands } = await import('vscode');
      const locator = { kind: 'page' as const, pageNumber: 2, pageIndex: 1 };

      await handler.handleRevealDocumentLocator({
        filePath: '/tmp/book.pdf',
        locator,
        source: { filePath: '/tmp/book.pdf', format: 'pdf' },
      });

      expect(commands.executeCommand).toHaveBeenCalledWith('neko.preview.revealDocumentLocator', {
        filePath: '/tmp/book.pdf',
        locator,
        source: { filePath: '/tmp/book.pdf', format: 'pdf' },
      });
    });
  });

  describe('handleRevealAsset', () => {
    it('delegates asset reveal to neko-assets', async () => {
      const { commands } = await import('vscode');

      await handler.handleRevealAsset('asset-1');

      expect(commands.executeCommand).toHaveBeenCalledWith('neko.assets.revealEntity', 'asset-1');
    });

    it('does nothing for empty asset id', async () => {
      const { commands } = await import('vscode');

      await handler.handleRevealAsset('');

      expect(commands.executeCommand).not.toHaveBeenCalled();
    });
  });

  describe('handleDownloadSvg', () => {
    it('should do nothing for empty svg', async () => {
      const { window } = await import('vscode');
      await handler.handleDownloadSvg('', 'test.svg');

      expect(window.showSaveDialog).not.toHaveBeenCalled();
    });

    it('should show save dialog and write file', async () => {
      const { window, workspace } = await import('vscode');
      const mockUri = { fsPath: '/tmp/diagram.svg' };
      (window.showSaveDialog as any).mockResolvedValue(mockUri);

      await handler.handleDownloadSvg('<svg>test</svg>', 'diagram.svg');

      expect(window.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ 'SVG Files': ['svg'] }),
        }),
      );
      expect(workspace.fs.writeFile).toHaveBeenCalledWith(mockUri, expect.any(Buffer));
    });

    it('should not write when user cancels save dialog', async () => {
      const { window, workspace } = await import('vscode');
      (window.showSaveDialog as any).mockResolvedValue(undefined);

      await handler.handleDownloadSvg('<svg>test</svg>', 'diagram.svg');

      expect(workspace.fs.writeFile).not.toHaveBeenCalled();
    });
  });
});
