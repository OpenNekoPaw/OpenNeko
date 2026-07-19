import { describe, expect, it, vi } from 'vitest';
import {
  buildNekoSuitePluginTransferPlan,
  executeNekoSuitePluginTransferPlan,
  type NekoSuitePluginTransferHostAdapter,
} from '..';

describe('neko-suite plugin transfer host adapters', () => {
  it('lets TUI execute canonical authoring plans without VSCode/Webview assumptions', async () => {
    const executeCommand = vi.fn(async () => ({
      version: 1,
      ok: true,
      documentUri: 'file:///workspace/timeline.nkv',
      diagnostics: [],
    }));
    const adapter: NekoSuitePluginTransferHostAdapter = {
      client: 'tui',
      executeCommand,
    };
    const plan = buildNekoSuitePluginTransferPlan({
      target: 'cut',
      payload: {
        kind: 'singleAsset',
        asset: { path: '/workspace/generated/shot.mp4', mediaType: 'video' },
        target: {
          kind: 'file',
          documentUri: 'file:///workspace/timeline.nkv',
          expectedProjectRevision: 'revision-1',
        },
      },
    });

    await expect(
      executeNekoSuitePluginTransferPlan(plan, adapter, { target: 'cut' }),
    ).resolves.toEqual({
      success: true,
      executed: 1,
      results: [
        {
          version: 1,
          ok: true,
          documentUri: 'file:///workspace/timeline.nkv',
          diagnostics: [],
        },
      ],
      unsupported: [],
    });
    expect(executeCommand).toHaveBeenCalledWith('neko.cut.authoring.importGeneratedClip', {
      assetPath: '/workspace/generated/shot.mp4',
      mediaType: 'video',
      target: { kind: 'file', documentUri: 'file:///workspace/timeline.nkv' },
      expectedProjectRevision: 'revision-1',
    });
  });

  it('lets Electron keep native reveal separate from authoring execution', async () => {
    const executeCommand = vi.fn(async () => {
      throw new Error('authoring command should not run for explorer reveal');
    });
    const revealFile = vi.fn(async (filePath: string) => ({
      windowAction: 'show-item-in-folder',
      filePath,
    }));
    const adapter: NekoSuitePluginTransferHostAdapter = {
      client: 'electron',
      executeCommand,
      revealFile,
    };
    const plan = buildNekoSuitePluginTransferPlan({
      target: 'explorer',
      assetPath: '/workspace/generated/shot.mp4',
      mediaType: 'video',
    });

    await expect(executeNekoSuitePluginTransferPlan(plan, adapter)).resolves.toEqual({
      success: true,
      executed: 1,
      results: [
        {
          windowAction: 'show-item-in-folder',
          filePath: '/workspace/generated/shot.mp4',
        },
      ],
      unsupported: [],
    });
    expect(executeCommand).not.toHaveBeenCalled();
    expect(revealFile).toHaveBeenCalledWith('/workspace/generated/shot.mp4');
  });

  it('projects authoring diagnostics for any host client', async () => {
    const adapter: NekoSuitePluginTransferHostAdapter = {
      client: 'tui',
      executeCommand: vi.fn(async () => ({
        version: 1,
        ok: false,
        diagnostics: [
          {
            code: 'missing-authoring-target',
            severity: 'error',
            message: 'Canvas image import authoring requires documentUri.',
          },
        ],
      })),
    };
    const plan = buildNekoSuitePluginTransferPlan({
      target: 'canvas',
      payload: {
        kind: 'singleAsset',
        asset: { path: '/workspace/generated/frame.png', mediaType: 'image' },
      },
    });

    await expect(
      executeNekoSuitePluginTransferPlan(plan, adapter, { target: 'canvas' }),
    ).resolves.toMatchObject({
      success: false,
      executed: 1,
      unsupported: [
        {
          target: 'canvas',
          reason: 'missing-authoring-target: Canvas image import authoring requires documentUri.',
        },
      ],
    });
  });
});
