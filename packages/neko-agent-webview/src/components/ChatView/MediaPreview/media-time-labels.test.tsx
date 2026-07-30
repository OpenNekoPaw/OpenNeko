import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudioCard } from './AudioCard';
import { VideoCard } from './VideoCard';

vi.mock('@/messages', () => ({
  AgentHostMessages: {
    openFile: vi.fn(),
    openUrl: vi.fn(),
  },
  VSCodeMessages: {
    openFile: vi.fn(),
    openUrl: vi.fn(),
  },
}));

describe('Agent media preview time labels', () => {
  it('formats audio preview duration through the shared media formatter', () => {
    render(<AudioCard src="file:///clip.wav" title="clip.wav" inline />);

    const audio = document.querySelector('audio');
    expect(audio).toBeTruthy();
    Object.defineProperty(audio, 'duration', {
      configurable: true,
      value: 65.678,
    });
    fireEvent.loadedMetadata(audio!);

    expect(screen.getByText('1:05')).toBeTruthy();
  });

  it('formats video preview duration through the shared media formatter', () => {
    render(<VideoCard src="file:///clip.mp4" title="clip.mp4" />);

    const video = document.querySelector('video');
    expect(video).toBeTruthy();
    Object.defineProperty(video, 'duration', {
      configurable: true,
      value: 3661.2,
    });
    fireEvent.loadedMetadata(video!);

    expect(screen.getAllByText('1:01:01').length).toBeGreaterThan(0);
  });
});
