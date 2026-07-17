import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock vscode module
// ============================================================================

const mockStatusBarItem = {
  text: '',
  tooltip: '',
  command: '',
  show: vi.fn(),
  hide: vi.fn(),
  dispose: vi.fn(),
};

vi.mock('vscode', () => ({
  StatusBarAlignment: { Left: 1, Right: 2 },
  window: {
    createStatusBarItem: vi.fn(() => ({ ...mockStatusBarItem })),
  },
}));

import { StatusBarManager, type StatusBarMediaInfo } from '../../ui/StatusBarManager';
import * as vscode from 'vscode';

// ============================================================================
// Tests
// ============================================================================

describe('StatusBarManager', () => {
  let manager: StatusBarManager;
  let statusItem: typeof mockStatusBarItem;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockStatusBarItem state
    mockStatusBarItem.text = '';
    mockStatusBarItem.tooltip = '';
    mockStatusBarItem.show.mockClear();
    mockStatusBarItem.hide.mockClear();
    mockStatusBarItem.dispose.mockClear();

    // Make createStatusBarItem return a fresh copy each time
    statusItem = {
      text: '',
      tooltip: '',
      command: '',
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(vscode.window.createStatusBarItem).mockReturnValue(
      statusItem as unknown as vscode.StatusBarItem,
    );

    manager = new StatusBarManager();
  });

  it('should create a status bar item on construction', () => {
    expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
      'neko.preview.status',
      vscode.StatusBarAlignment.Left,
      100,
    );
  });

  describe('show()', () => {
    it('should show the status bar with file name and duration', () => {
      const info: StatusBarMediaInfo = {
        fileName: 'test.mp4',
        duration: 120,
      };

      manager.show(info);

      expect(statusItem.show).toHaveBeenCalled();
      expect(statusItem.text).toContain('test.mp4');
      expect(statusItem.text).toContain('2:00');
      expect(statusItem.tooltip).toBe('Neko Preview: test.mp4');
    });

    it('should display video codec details when provided', () => {
      const info: StatusBarMediaInfo = {
        fileName: 'movie.mp4',
        codec: 'h264',
        width: 1920,
        height: 1080,
        fps: 30,
        duration: 60,
      };

      manager.show(info);

      expect(statusItem.text).toContain('H264');
      expect(statusItem.text).toContain('1920x1080');
      expect(statusItem.text).toContain('30fps');
    });

    it('should display audio codec details when provided', () => {
      const info: StatusBarMediaInfo = {
        fileName: 'song.mp3',
        audioCodec: 'aac',
        audioSampleRate: 44100,
        audioChannels: 2,
        duration: 180,
      };

      manager.show(info);

      expect(statusItem.text).toContain('AAC');
      expect(statusItem.text).toContain('44.1kHz');
      expect(statusItem.text).toContain('Stereo');
    });

    it('should display Mono for single-channel audio', () => {
      const info: StatusBarMediaInfo = {
        fileName: 'mono.wav',
        audioCodec: 'pcm',
        audioChannels: 1,
        duration: 10,
      };

      manager.show(info);

      expect(statusItem.text).toContain('Mono');
    });

    it('should display channel count for multi-channel audio (>2)', () => {
      const info: StatusBarMediaInfo = {
        fileName: 'surround.flac',
        audioCodec: 'flac',
        audioChannels: 6,
        duration: 300,
      };

      manager.show(info);

      expect(statusItem.text).toContain('6ch');
    });

    it('should display "Media" when no codec info is provided', () => {
      const info: StatusBarMediaInfo = {
        fileName: 'unknown.bin',
        duration: 0,
      };

      manager.show(info);

      expect(statusItem.text).toContain('Media');
    });

    it('should reset playback state and time when showing new media', () => {
      // First set some playback state
      manager.show({ fileName: 'a.mp4', duration: 60 });
      manager.updatePlayback('playing', 30);

      // Now show new media — should reset
      manager.show({ fileName: 'b.mp4', duration: 120 });

      // Time should be 0:00 / 2:00, icon should be file-media (stopped)
      expect(statusItem.text).toContain('$(file-media)');
      expect(statusItem.text).toContain('0:00 / 2:00');
    });
  });

  describe('hide()', () => {
    it('should hide the status bar and clear media info', () => {
      manager.show({ fileName: 'test.mp4', duration: 60 });
      manager.hide();

      expect(statusItem.hide).toHaveBeenCalled();
    });

    it('should not render after hide even if updatePlayback is called', () => {
      manager.show({ fileName: 'test.mp4', duration: 60 });
      manager.hide();

      // Clear the text set during show
      statusItem.text = '';

      // updatePlayback should not update text since mediaInfo is null
      manager.updatePlayback('playing', 10);

      expect(statusItem.text).toBe('');
    });
  });

  describe('updatePlayback()', () => {
    it('should show play icon when playing', () => {
      manager.show({ fileName: 'test.mp4', duration: 60 });
      manager.updatePlayback('playing', 15);

      expect(statusItem.text).toContain('$(play)');
      expect(statusItem.text).toContain('0:15');
    });

    it('should show pause icon when paused', () => {
      manager.show({ fileName: 'test.mp4', duration: 60 });
      manager.updatePlayback('paused', 30);

      expect(statusItem.text).toContain('$(debug-pause)');
      expect(statusItem.text).toContain('0:30');
    });

    it('should show file-media icon when stopped', () => {
      manager.show({ fileName: 'test.mp4', duration: 60 });
      manager.updatePlayback('stopped', 0);

      expect(statusItem.text).toContain('$(file-media)');
    });

    it('should format time with hours for long durations', () => {
      manager.show({ fileName: 'movie.mp4', duration: 7384 });
      manager.updatePlayback('playing', 3661);

      // 3661 = 1:01:01
      expect(statusItem.text).toContain('1:01:01');
      // 7384 = 2:03:04
      expect(statusItem.text).toContain('2:03:04');
    });

    it('should handle negative or non-finite time gracefully', () => {
      manager.show({ fileName: 'test.mp4', duration: 60 });
      manager.updatePlayback('playing', -5);

      expect(statusItem.text).toContain('0:00');
    });

    it('should handle Infinity duration gracefully', () => {
      manager.show({ fileName: 'stream.mp4', duration: Infinity });

      // formatTime(Infinity) should return '0:00'
      expect(statusItem.text).toContain('0:00');
    });
  });

  describe('dispose()', () => {
    it('should dispose the status bar item', () => {
      manager.dispose();

      expect(statusItem.dispose).toHaveBeenCalled();
    });
  });

  describe('combined video + audio details', () => {
    it('should display both video and audio codec info separated by pipe', () => {
      const info: StatusBarMediaInfo = {
        fileName: 'movie.mkv',
        codec: 'hevc',
        width: 3840,
        height: 2160,
        fps: 60,
        audioCodec: 'opus',
        audioSampleRate: 48000,
        audioChannels: 2,
        duration: 7200,
      };

      manager.show(info);

      expect(statusItem.text).toContain('HEVC');
      expect(statusItem.text).toContain('3840x2160');
      expect(statusItem.text).toContain('60fps');
      expect(statusItem.text).toContain('OPUS');
      expect(statusItem.text).toContain('48.0kHz');
      expect(statusItem.text).toContain('Stereo');
    });
  });
});
