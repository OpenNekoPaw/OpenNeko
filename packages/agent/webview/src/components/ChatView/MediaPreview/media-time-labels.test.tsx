import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AudioCard } from './AudioCard';
import { VideoCard } from './VideoCard';

describe('Agent media preview time labels', () => {
  it('formats audio preview duration through the shared media formatter', () => {
    render(
      <AudioCard src="http://127.0.0.1:43125/v1/resources/audio-token" title="clip.wav" inline />,
    );

    const audio = document.querySelector('audio');
    expect(audio).toBeTruthy();
    expect(audio?.hasAttribute('controls')).toBe(true);
    expect(audio?.crossOrigin).toBe('anonymous');
    Object.defineProperty(audio, 'duration', {
      configurable: true,
      value: 65.678,
    });
    fireEvent.loadedMetadata(audio!);

    expect(screen.getByText('1:05')).toBeTruthy();
  });

  it('formats video preview duration through the shared media formatter', () => {
    render(<VideoCard src="http://127.0.0.1:43125/v1/resources/video-token" title="clip.mp4" />);

    const video = document.querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.hasAttribute('controls')).toBe(true);
    expect(video?.crossOrigin).toBe('anonymous');
    Object.defineProperty(video, 'duration', {
      configurable: true,
      value: 3661.2,
    });
    fireEvent.loadedMetadata(video!);

    expect(screen.getAllByText('1:01:01').length).toBeGreaterThan(0);
  });

  it.each([
    ['audio', 'file:///clip.wav'],
    ['audio', 'data:audio/wav;base64,AA=='],
    ['video', 'neko-media://desktop/clip.mp4'],
    ['video', '/tmp/clip.mp4'],
  ] as const)('rejects unsafe %s display source %s', (kind, src) => {
    if (kind === 'audio') {
      render(<AudioCard src={src} />);
    } else {
      render(<VideoCard src={src} />);
    }

    expect(document.querySelector(kind)).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('not authorized');
  });
});
