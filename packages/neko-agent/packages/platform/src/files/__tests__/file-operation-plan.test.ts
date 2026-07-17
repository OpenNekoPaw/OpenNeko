import { describe, expect, it, vi } from 'vitest';
import {
  buildConfigFilePath,
  buildSettingsFilePlan,
  buildSvgDownloadPlan,
  buildSvgDownloadSavedMessage,
  createOpenFilePlan,
  detectFileOpenViewer,
  ensureFileOperationPlan,
} from '../file-operation-plan';

describe('file operation plan', () => {
  it('creates open-file plans and routes media viewers', () => {
    expect(createOpenFilePlan('file:///tmp/readme.md')).toEqual({
      cleanPath: '/tmp/readme.md',
      viewer: 'default',
    });
    expect(detectFileOpenViewer('/tmp/skybox.hdr')).toBe('panoramic-image');
    expect(detectFileOpenViewer('/tmp/skybox_360.jpg')).toBe('panoramic-image');
    expect(detectFileOpenViewer('/tmp/tour_360.mp4')).toBe('panoramic-video');
    expect(detectFileOpenViewer('/tmp/video.MP4')).toBe('video');
    expect(detectFileOpenViewer('/tmp/audio.wav')).toBe('audio');
    expect(createOpenFilePlan('')).toBeNull();
  });

  it('builds settings file plans', () => {
    expect(
      buildSettingsFilePlan({
        source: 'local',
        homeDir: '/home/me',
        workspaceRoot: '/repo',
      }),
    ).toEqual(
      expect.objectContaining({
        ok: true,
        dirPath: '/repo/.neko',
        filePath: '/repo/.neko/settings.local.json',
      }),
    );
  });

  it('builds project settings file plan under neko/ (git-tracked)', () => {
    expect(
      buildSettingsFilePlan({
        source: 'project',
        homeDir: '/home/me',
        workspaceRoot: '/repo',
      }),
    ).toEqual(
      expect.objectContaining({
        ok: true,
        dirPath: '/repo/neko',
        filePath: '/repo/neko/settings.json',
      }),
    );
  });

  it('builds config file paths', () => {
    expect(buildConfigFilePath('/home/me')).toBe('/home/me/.neko/config.toml');
  });

  it('builds SVG download plans and saved messages', () => {
    expect(buildSvgDownloadPlan({ svg: '' })).toBeNull();
    expect(buildSvgDownloadPlan({ svg: '<svg />' })).toEqual({
      defaultFileName: 'diagram.svg',
      filters: [
        { name: 'SVG Files', extensions: ['svg'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      content: '<svg />',
    });
    expect(buildSvgDownloadPlan({ svg: '<svg />', filename: 'flow.svg' })?.defaultFileName).toBe(
      'flow.svg',
    );
    expect(buildSvgDownloadSavedMessage('/tmp/flow.svg')).toBe('SVG saved to /tmp/flow.svg');
  });

  it('returns failures for missing workspace', () => {
    expect(
      buildSettingsFilePlan({
        source: 'project',
        homeDir: '/home/me',
      }),
    ).toEqual({ ok: false, error: 'No workspace folder open' });
  });

  it('ensures template files through injected fs ops', async () => {
    const fs = {
      mkdir: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockRejectedValue(new Error('ENOENT')),
      writeFile: vi.fn().mockResolvedValue(undefined),
    };

    const result = await ensureFileOperationPlan({
      plan: {
        ok: true,
        dirPath: '/repo/.neko',
        filePath: '/repo/.neko/settings.json',
        template: '{}',
      },
      fs,
    });

    expect(result).toEqual({
      ok: true,
      filePath: '/repo/.neko/settings.json',
      created: true,
    });
    expect(fs.mkdir).toHaveBeenCalledWith('/repo/.neko', { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith('/repo/.neko/settings.json', '{}', 'utf-8');
  });

  it('does not overwrite existing files when ensuring a template file', async () => {
    const fs = {
      mkdir: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    };

    const result = await ensureFileOperationPlan({
      plan: {
        ok: true,
        dirPath: '/repo/.neko',
        filePath: '/repo/.neko/settings.json',
        template: '{}',
      },
      fs,
    });

    expect(result).toEqual({
      ok: true,
      filePath: '/repo/.neko/settings.json',
      created: false,
    });
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});
