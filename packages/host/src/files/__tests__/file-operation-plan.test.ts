import { describe, expect, it } from 'vitest';
import {
  buildConfigFilePath,
  buildSvgDownloadPlan,
  buildSvgDownloadSavedMessage,
  createOpenFilePlan,
  detectFileOpenViewer,
} from '../file-operation-plan';

describe('file operation plan', () => {
  it('creates open-file plans and routes media viewers', () => {
    expect(createOpenFilePlan('file:///tmp/readme.md')).toEqual({
      cleanPath: '/tmp/readme.md',
      viewer: 'default',
    });
    expect(detectFileOpenViewer('/tmp/skybox.hdr')).toBe('default');
    expect(detectFileOpenViewer('/tmp/skybox_360.jpg')).toBe('default');
    expect(detectFileOpenViewer('/tmp/tour_360.mp4')).toBe('video');
    expect(detectFileOpenViewer('/tmp/video.MP4')).toBe('video');
    expect(detectFileOpenViewer('/tmp/audio.wav')).toBe('audio');
    expect(createOpenFilePlan('')).toBeNull();
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
});
