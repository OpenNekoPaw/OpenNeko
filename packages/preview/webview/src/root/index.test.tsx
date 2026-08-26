// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type PreviewHostRuntime,
  type PreviewProjection,
  type PreviewRuntimeIdentity,
} from '@neko/preview-domain';
import type { AuthorizedPreviewSessionRuntime } from '@neko/preview-domain/authorized-session';
import { AuthorizedPreviewRoot, PreviewPresentation, PreviewRoot } from './index';
import { LightweightPreview } from './lightweight-preview';
import { getRegisteredPreviewContentKinds } from './viewer-kernel';
import { PreviewViewerSnapshotProvider } from './viewer-snapshot-context';
import { createPreviewViewerSnapshotStore } from './viewer-snapshot';
import { createPreviewRuntimeBootstrap } from './runtime-bootstrap';
const playerStyles = readFileSync(resolve(__dirname, '../styles/player.css'), 'utf8');
const rootStyles = readFileSync(resolve(__dirname, './style.css'), 'utf8');

const identity: PreviewRuntimeIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'preview-1',
  viewInstanceId: 'view-instance-1',
  documentId: 'document-1',
  sessionId: 'session-1',
  rendererSessionId: 'endpoint-1',
};

const previewContentLocator = {
  file: { authority: 'workspace' as const, path: 'preview/fixture.bin' },
};

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PreviewRoot', () => {
  it('keeps embeddable viewer layout styles scoped away from the Host document root', () => {
    expect(playerStyles).not.toMatch(/(^|\n)\s*#root\s*\{/u);
    expect(playerStyles).not.toMatch(/(^|\n)\s*html\s*,/u);
    expect(rootStyles).toMatch(/\.neko-preview-root__viewer\s*\{[^}]*position:\s*relative;/u);
  });

  it('registers image, video, audio, text, document and model viewers explicitly', () => {
    expect(getRegisteredPreviewContentKinds()).toEqual([
      'image',
      'video',
      'audio',
      'text',
      'document',
      'model',
    ]);
  });

  it('gives the shared image element a definite two-axis contain box', () => {
    const imageRule = rootStyles.match(/\.neko-preview-viewer--image > img\s*\{([^}]*)\}/u)?.[1];

    expect(imageRule).toBeDefined();
    expect(imageRule).toMatch(/position:\s*absolute;/u);
    expect(imageRule).toMatch(/inset:\s*0;/u);
    expect(imageRule).toMatch(/width:\s*100%;/u);
    expect(imageRule).toMatch(/height:\s*100%;/u);
    expect(imageRule).toMatch(/object-fit:\s*contain;/u);
    expect(imageRule).not.toMatch(/max-width:/u);
    expect(imageRule).not.toMatch(/max-height:/u);
  });

  it('uses one package-owned presentation and viewer registry for Workspace and authorized previews', async () => {
    const descriptor = {
      descriptorId: 'descriptor-shared-image',
      sourceFingerprint: 'fingerprint-1',
      contentLocator: previewContentLocator,
      url: 'http://127.0.0.1:43125/resources/shared-image-token',
      contentKind: 'image' as const,
      mediaType: 'image/png',
      displayName: 'shared.png',
      byteLength: 42,
    };
    const workspaceContainer = document.createElement('div');
    const authorizedContainer = document.createElement('div');
    document.body.append(workspaceContainer, authorizedContainer);
    const workspaceRoot = createRoot(workspaceContainer);
    const authorizedRoot = createRoot(authorizedContainer);
    const authorizedIdentity = {
      previewSessionId: 'authorized-preview-1',
      windowId: 'window-1',
      owner: {
        kind: 'asset-center' as const,
        assetCenterSessionId: 'asset-center-1',
        resourceOwner: 'media-library' as const,
        itemId: 'media-library:item-1',
      },
    };
    const authorizedRuntime: AuthorizedPreviewSessionRuntime = {
      identity: authorizedIdentity,
      getSnapshot: async () => ({
        identity: authorizedIdentity,
        status: 'ready',
        descriptor,
      }),
      subscribe: () => () => undefined,
    };

    await act(async () => {
      workspaceRoot.render(
        withPreviewSnapshots(
          <PreviewRoot
            bootstrap={createPreviewRuntimeBootstrap(
              createRuntime({
                identity,
                presentation: 'side',
                status: 'ready',
                descriptor,
              }),
            )}
            chrome="content-only"
            locale="en"
          />,
        ),
      );
      authorizedRoot.render(
        <AuthorizedPreviewRoot
          chrome="content-only"
          locale="en"
          runtime={authorizedRuntime}
          snapshotStore={createPreviewViewerSnapshotStore()}
        />,
      );
    });
    await act(async () => Promise.resolve());

    for (const container of [workspaceContainer, authorizedContainer]) {
      expect(
        container.querySelector('[data-preview-presentation-owner="preview-webview"]'),
      ).toBeTruthy();
      expect(container.querySelector('img')?.getAttribute('src')).toBe(descriptor.url);
    }
    expect(
      workspaceContainer.querySelector('.neko-preview-root')?.getAttribute('data-preview-chrome'),
    ).toBe('content-only');
    expect(workspaceContainer.querySelector('.neko-preview-root > header')).toBeNull();
    expect(
      authorizedContainer.querySelector('.neko-preview-root')?.getAttribute('data-preview-chrome'),
    ).toBe('content-only');
    expect(authorizedContainer.querySelector('.neko-preview-root > header')).toBeNull();
    expect(
      authorizedContainer
        .querySelector('.neko-preview-root')
        ?.getAttribute('data-authorized-preview-session-id'),
    ).toBe('authorized-preview-1');

    await act(async () => {
      workspaceRoot.unmount();
      authorizedRoot.unmount();
    });
  });

  it('renders a Host-owned text descriptor without receiving a raw path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"items":[]}', { status: 200 })),
    );
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        withPreviewSnapshots(
          <PreviewRoot
            bootstrap={createPreviewRuntimeBootstrap(
              createRuntime({
                identity,
                presentation: 'temporary',
                status: 'ready',
                descriptor: {
                  descriptorId: 'descriptor-1',
                  sourceFingerprint: 'fingerprint-1',
                  contentLocator: previewContentLocator,
                  url: 'http://127.0.0.1:43125/resources/text-token',
                  contentKind: 'text',
                  mediaType: 'application/json',
                  displayName: 'candidates.json',
                  byteLength: 12,
                },
              }),
            )}
            locale="zh-cn"
          />,
        ),
      );
      await import('../video/VideoPlayer');
    });
    await act(async () => Promise.resolve());

    expect(container.textContent).toContain('candidates.json');
    expect(container.textContent).toContain('{"items":[]}');
    expect(JSON.stringify(container.innerHTML)).not.toContain('/Users/');
  });

  it('keeps Main Preview plain text literal and renders only explicitly typed Markdown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            url.includes('markdown-token') ? '# Heading\n\n**Strong**' : '# Literal text',
            {
              status: 200,
            },
          ),
      ),
    );
    const plainContainer = document.createElement('div');
    const markdownContainer = document.createElement('div');
    document.body.append(plainContainer, markdownContainer);
    const plainRoot = createRoot(plainContainer);
    const markdownRoot = createRoot(markdownContainer);
    const renderTextPreview = (mediaType: string, token: string) =>
      withPreviewSnapshots(
        <PreviewRoot
          bootstrap={createPreviewRuntimeBootstrap(
            createRuntime({
              identity,
              presentation: 'temporary',
              status: 'ready',
              descriptor: {
                descriptorId: `descriptor-${token}`,
                sourceFingerprint: `fingerprint-${token}`,
                contentLocator: previewContentLocator,
                url: `http://127.0.0.1:43125/resources/${token}`,
                contentKind: 'text',
                mediaType,
                displayName: token,
                byteLength: 24,
              },
            }),
          )}
          chrome="content-only"
          locale="en"
        />,
      );

    await act(async () => {
      plainRoot.render(renderTextPreview('text/plain', 'plain-token'));
      markdownRoot.render(renderTextPreview('text/markdown', 'markdown-token'));
    });
    await act(async () => Promise.resolve());

    expect(plainContainer.querySelector('pre')?.textContent).toBe('# Literal text');
    expect(plainContainer.querySelector('[data-markdown-document]')).toBeNull();
    expect(markdownContainer.querySelector('[data-markdown-document="ready"]')).not.toBeNull();
    expect(markdownContainer.querySelector('h1')?.textContent).toBe('Heading');
    for (const container of [plainContainer, markdownContainer]) {
      expect(container.querySelector('textarea')).toBeNull();
      expect(container.querySelector('.ProseMirror')).toBeNull();
      expect(container.textContent).not.toContain('Edit');
    }

    await act(async () => {
      plainRoot.unmount();
      markdownRoot.unmount();
    });
  });

  it('does not let an older initial Snapshot overwrite a newer runtime event', async () => {
    const stale = readyImageProjection('stale.png', 'stale-token');
    const current = readyImageProjection('current.png', 'current-token');
    let resolveSnapshot: ((projection: PreviewProjection) => void) | undefined;
    let onEvent:
      | ((event: { readonly sequence: number; readonly projection: PreviewProjection }) => void)
      | undefined;
    const runtime: PreviewHostRuntime = {
      identity,
      getSnapshot: () =>
        new Promise<PreviewProjection>((resolve) => {
          resolveSnapshot = resolve;
        }),
      execute: async () => current,
      subscribe: (listener) => {
        onEvent = listener;
        return () => undefined;
      },
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        withPreviewSnapshots(
          <PreviewRoot bootstrap={createPreviewRuntimeBootstrap(runtime)} locale="en" />,
        ),
      );
    });
    await act(async () => {
      onEvent?.({ sequence: 1, projection: current });
      resolveSnapshot?.(stale);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('current.png');
    expect(container.textContent).not.toContain('stale.png');
  });

  it('routes pin and side actions through the injected Preview runtime', async () => {
    const projection: PreviewProjection = {
      identity,
      presentation: 'temporary',
      status: 'ready',
      descriptor: {
        descriptorId: 'descriptor-image',
        sourceFingerprint: 'fingerprint-1',
        contentLocator: previewContentLocator,
        url: 'http://127.0.0.1:43125/resources/image-token',
        contentKind: 'image',
        mediaType: 'image/png',
        displayName: 'reference.png',
        byteLength: 42,
      },
    };
    const runtime = createRuntime(projection);
    const execute = vi.spyOn(runtime, 'execute');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        withPreviewSnapshots(
          <PreviewRoot bootstrap={createPreviewRuntimeBootstrap(runtime)} locale="en" />,
        ),
      );
    });
    const pin = container.querySelector<HTMLButtonElement>('[aria-label="Pin preview"]');
    expect(pin).toBeTruthy();
    await act(async () => pin?.click());

    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'view.pin',
        identity,
      }),
    );
    expect(container.querySelector('[aria-label="Open preview to the side"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="Close preview"]')).toBeTruthy();
  });

  it('renders Desktop video through the package-owned VideoPlayer component', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        withPreviewSnapshots(
          <PreviewRoot
            bootstrap={createPreviewRuntimeBootstrap(
              createRuntime({
                identity,
                presentation: 'temporary',
                status: 'ready',
                descriptor: {
                  descriptorId: 'descriptor-video',
                  sourceFingerprint: 'fingerprint-1',
                  contentLocator: previewContentLocator,
                  url: 'http://127.0.0.1:43125/resources/video-token',
                  contentKind: 'video',
                  mediaType: 'video/mp4',
                  displayName: 'clip.mp4',
                  byteLength: 42,
                },
              }),
            )}
            locale="en"
          />,
        ),
      );
    });

    expect(container.querySelector('video')?.getAttribute('src')).toBe(
      'http://127.0.0.1:43125/resources/video-token',
    );
    expect(container.querySelector('.absolute.inset-0.bg-black')).toBeTruthy();
    expect(container.querySelector('[aria-label="Play (Space)"]')).toBeTruthy();
  });

  it('releases an unmounted media Root and restores it from the package snapshot owner', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const runtime = createRuntime({
      identity,
      presentation: 'temporary',
      status: 'ready',
      descriptor: {
        descriptorId: 'descriptor-video-suspend',
        sourceFingerprint: 'fingerprint-1',
        contentLocator: previewContentLocator,
        url: 'http://127.0.0.1:43125/resources/video-suspend-token',
        contentKind: 'video',
        mediaType: 'video/mp4',
        displayName: 'suspend.mp4',
        byteLength: 42,
      },
    });
    const bootstrap = createPreviewRuntimeBootstrap(runtime);

    const renderPreview = (visible: boolean): ReactElement => (
      <PreviewViewerSnapshotProvider>
        {visible ? <PreviewRoot bootstrap={bootstrap} locale="en" /> : null}
      </PreviewViewerSnapshotProvider>
    );

    await act(async () => {
      root.render(renderPreview(true));
      await import('../video/VideoPlayer');
    });
    const presentationRoot = container.querySelector('.neko-preview-root');
    const initialVideo = container.querySelector('video');
    expect(initialVideo).not.toBeNull();
    if (!initialVideo) throw new Error('Initial video viewer is required.');
    initialVideo.currentTime = 37;
    initialVideo.playbackRate = 1.5;
    initialVideo.volume = 0.4;

    await act(async () => root.render(renderPreview(false)));
    expect(container.querySelector('.neko-preview-root')).toBeNull();
    expect(container.querySelector('video')).toBeNull();
    expect(pause).toHaveBeenCalled();

    await act(async () => root.render(renderPreview(true)));
    expect(container.querySelector('.neko-preview-root')).not.toBe(presentationRoot);
    const restoredVideo = container.querySelector('video');
    expect(restoredVideo).not.toBeNull();
    if (!restoredVideo) throw new Error('Restored video viewer is required.');
    restoredVideo.dispatchEvent(new Event('loadedmetadata', { bubbles: true }));
    expect(restoredVideo.currentTime).toBe(37);
    expect(restoredVideo.playbackRate).toBe(1.5);
    expect(restoredVideo.volume).toBe(0.4);
  });

  it('renders image quick preview from the opaque package-owned descriptor', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        withPreviewSnapshots(
          <LightweightPreview
            locale="en"
            descriptor={{
              descriptorId: 'descriptor-image-hover',
              sourceFingerprint: 'fingerprint-1',
              contentLocator: previewContentLocator,
              url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              contentKind: 'image',
              mediaType: 'image/png',
              displayName: 'hover.png',
              byteLength: 42,
            }}
          />,
        ),
      );
      await import('../video/VideoPlayer');
    });

    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(container.querySelector('.neko-preview-surface--lightweight')).toBeTruthy();
  });

  it('keeps compact video and audio paused by default and pauses them on unmount', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(async () => undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        withPreviewSnapshots(
          <LightweightPreview
            locale="en"
            descriptor={{
              descriptorId: 'descriptor-video-hover',
              sourceFingerprint: 'fingerprint-1',
              contentLocator: previewContentLocator,
              url: 'openneko://resource/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              contentKind: 'video',
              mediaType: 'video/mp4',
              displayName: 'hover.mp4',
              byteLength: 42,
            }}
          />,
        ),
      );
      await import('../audio/AudioPlayer');
    });
    const video = container.querySelector('video');
    expect(video?.autoplay).toBe(false);
    expect(video?.preload).toBe('metadata');
    expect(video?.controls).toBe(true);
    expect(play).not.toHaveBeenCalled();

    await act(async () => {
      root.render(
        withPreviewSnapshots(
          <LightweightPreview
            locale="en"
            descriptor={{
              descriptorId: 'descriptor-audio-hover',
              sourceFingerprint: 'fingerprint-1',
              contentLocator: previewContentLocator,
              url: 'openneko://resource/cccccccccccccccccccccccccccccccc',
              contentKind: 'audio',
              mediaType: 'audio/aac',
              displayName: 'hover.aac',
              byteLength: 42,
            }}
          />,
        ),
      );
    });
    const audio = container.querySelector('audio');
    expect(audio).toBeTruthy();
    expect(audio?.autoplay).toBe(false);
    expect(audio?.controls).toBe(false);
    expect(
      container.querySelector('[data-testid="preview-lightweight-audio-waveform"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="preview-lightweight-audio-toggle-playback"]'),
    ).toBeTruthy();
    expect(play).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    expect(pause).toHaveBeenCalled();
  });

  it('renders passive compact video without native controls or autoplay', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(async () => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        withPreviewSnapshots(
          <LightweightPreview
            locale="en"
            mediaPlayback="passive"
            descriptor={{
              descriptorId: 'descriptor-video-passive',
              sourceFingerprint: 'fingerprint-passive',
              contentLocator: previewContentLocator,
              url: 'openneko://resource/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
              contentKind: 'video',
              mediaType: 'video/mp4',
              displayName: 'passive.mp4',
              byteLength: 42,
            }}
          />,
        ),
      );
      await import('../video/VideoPlayer');
    });

    const video = container.querySelector('video');
    expect(video?.controls).toBe(false);
    expect(video?.autoplay).toBe(false);
    expect(play).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });

  it('keeps controlled video source failures distinct from play rejection', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
      new DOMException('User gesture required.', 'NotAllowedError'),
    );
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <LightweightPreview
          locale="zh-cn"
          descriptor={{
            descriptorId: 'descriptor-video-play-rejected',
            sourceFingerprint: 'fingerprint-video-play-rejected',
            contentLocator: previewContentLocator,
            url: 'openneko://resource/abababababababababababababababab',
            contentKind: 'video',
            mediaType: 'video/mp4',
            displayName: 'play-rejected.mp4',
            byteLength: 42,
          }}
          playback={{ requestId: 'play-rejected', state: 'playing' }}
        />,
      );
      await Promise.resolve();
    });

    expect(container.querySelector('video')?.controls).toBe(false);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('uses ambient parameters for direct Resource Browser video playback', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(async () => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <LightweightPreview
          locale="en"
          mediaPlayback="ambient"
          descriptor={{
            descriptorId: 'descriptor-video-ambient',
            sourceFingerprint: 'fingerprint-video-ambient',
            contentLocator: previewContentLocator,
            url: 'openneko://resource/12121212121212121212121212121212',
            contentKind: 'video',
            mediaType: 'video/mp4',
            displayName: 'ambient.mp4',
            byteLength: 42,
          }}
        />,
      );
      await import('../video/VideoPlayer');
    });

    const video = container.querySelector('video');
    expect(video?.autoplay).toBe(true);
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
    expect(video?.controls).toBe(false);
    expect(play).toHaveBeenCalledOnce();
  });

  it('plays Resource Browser audio without rendering a thumbnail or playback controls', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(async () => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <LightweightPreview
          locale="en"
          mediaPlayback="ambient"
          descriptor={{
            descriptorId: 'descriptor-audio-ambient',
            sourceFingerprint: 'fingerprint-audio-ambient',
            contentLocator: previewContentLocator,
            url: 'openneko://resource/23232323232323232323232323232323',
            contentKind: 'audio',
            mediaType: 'audio/aac',
            displayName: 'ambient.aac',
            byteLength: 42,
          }}
        />,
      );
      await import('../audio/AudioPlayer');
    });

    const audio = container.querySelector('audio');
    expect(audio?.autoplay).toBe(true);
    expect(audio?.controls).toBe(false);
    expect(
      container.querySelector('[data-testid="preview-lightweight-audio-waveform"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="preview-lightweight-audio-toggle-playback"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain('ambient.aac');
    expect(play).toHaveBeenCalledOnce();
  });

  it('hides internal controls when the Canvas storyline owns playback', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const descriptor = {
      descriptorId: 'descriptor-canvas-storyline-video',
      sourceFingerprint: 'fingerprint-canvas-storyline-video',
      contentLocator: previewContentLocator,
      url: 'openneko://resource/45454545454545454545454545454545',
      contentKind: 'video' as const,
      mediaType: 'video/mp4',
      displayName: 'storyline.mp4',
      byteLength: 42,
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <LightweightPreview
          locale="en"
          descriptor={descriptor}
          playback={{ requestId: 'storyline-play', state: 'playing' }}
        />,
      );
      await import('../video/VideoPlayer');
    });

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.controls).toBe(false);
    expect(container.querySelector('[data-testid="preview-video-toggle-playback"]')).toBeNull();

    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    await act(async () => {
      root.render(
        <LightweightPreview
          locale="en"
          descriptor={descriptor}
          playback={{ requestId: 'storyline-pause', state: 'paused' }}
        />,
      );
    });

    await act(async () => {
      root.render(
        <LightweightPreview
          locale="en"
          descriptor={{
            ...descriptor,
            descriptorId: 'descriptor-canvas-storyline-audio',
            sourceFingerprint: 'fingerprint-canvas-storyline-audio',
            url: 'openneko://resource/56565656565656565656565656565656',
            contentKind: 'audio',
            mediaType: 'audio/mpeg',
            displayName: 'storyline.mp3',
          }}
          playback={{ requestId: 'storyline-audio-pause', state: 'paused' }}
        />,
      );
      await import('../audio/AudioPlayer');
    });
    expect(
      container.querySelector('[data-testid="preview-lightweight-audio-waveform"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="preview-lightweight-audio-toggle-playback"]'),
    ).toBeNull();
    expect(container.querySelector('input[type="range"]')).toBeNull();
  });

  it('keeps a newer controlled pause authoritative over a pending play', async () => {
    let resolvePlay: (() => void) | undefined;
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePlay = resolve;
        }),
    );
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const descriptor = {
      descriptorId: 'descriptor-canvas-controlled-race',
      sourceFingerprint: 'fingerprint-canvas-controlled-race',
      contentLocator: previewContentLocator,
      url: 'openneko://resource/67676767676767676767676767676767',
      contentKind: 'video' as const,
      mediaType: 'video/mp4',
      displayName: 'controlled-race.mp4',
      byteLength: 42,
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <LightweightPreview
          locale="en"
          descriptor={descriptor}
          playback={{ requestId: 'controlled-play-race', state: 'playing' }}
        />,
      );
      await import('../video/VideoPlayer');
    });
    expect(play).toHaveBeenCalledOnce();

    await act(async () => {
      root.render(
        <LightweightPreview
          locale="en"
          descriptor={descriptor}
          playback={{ requestId: 'controlled-pause-race', state: 'paused' }}
        />,
      );
    });
    const video = container.querySelector('video');
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    video?.dispatchEvent(new Event('play', { bubbles: true }));
    await act(async () => resolvePlay?.());
    expect(pause).toHaveBeenCalled();
  });

  it('does not pause shared video or audio when caller projection callbacks rerender', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const videoDescriptor = {
      descriptorId: 'descriptor-video-projection-rerender',
      sourceFingerprint: 'fingerprint-video-projection-rerender',
      contentLocator: previewContentLocator,
      url: 'openneko://resource/34343434343434343434343434343434',
      contentKind: 'video' as const,
      mediaType: 'video/mp4',
      displayName: 'stable.mp4',
      byteLength: 42,
    };
    await act(async () => {
      root.render(
        <LightweightPreview
          locale="en"
          descriptor={videoDescriptor}
          playback={{ requestId: 'video-play', state: 'playing', onTimeUpdate: () => undefined }}
        />,
      );
      await import('../video/VideoPlayer');
    });
    pause.mockClear();
    await act(async () => {
      root.render(
        <LightweightPreview
          locale="en"
          descriptor={videoDescriptor}
          playback={{ requestId: 'video-play', state: 'playing', onTimeUpdate: () => undefined }}
        />,
      );
    });
    expect(pause).not.toHaveBeenCalled();

    const audioDescriptor = {
      ...videoDescriptor,
      descriptorId: 'descriptor-audio-projection-rerender',
      sourceFingerprint: 'fingerprint-audio-projection-rerender',
      url: 'openneko://resource/56565656565656565656565656565656',
      contentKind: 'audio' as const,
      mediaType: 'audio/mpeg',
      displayName: 'stable.mp3',
    };
    await act(async () => {
      root.render(
        <LightweightPreview
          locale="en"
          descriptor={audioDescriptor}
          playback={{ requestId: 'audio-play', state: 'playing', onTimeUpdate: () => undefined }}
        />,
      );
      await import('../audio/AudioPlayer');
    });
    pause.mockClear();
    await act(async () => {
      root.render(
        <LightweightPreview
          locale="en"
          descriptor={audioDescriptor}
          playback={{ requestId: 'audio-play', state: 'playing', onTimeUpdate: () => undefined }}
        />,
      );
    });
    expect(pause).not.toHaveBeenCalled();
  });

  it('uses the same media element implementation for Main and Lightweight Preview', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const descriptor = {
      descriptorId: 'descriptor-shared-webm',
      sourceFingerprint: 'fingerprint-shared-webm',
      contentLocator: previewContentLocator,
      url: 'openneko://resource/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      contentKind: 'video' as const,
      mediaType: 'video/webm',
      displayName: 'shared.webm',
      byteLength: 42,
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <>
          <LightweightPreview locale="en" descriptor={descriptor} />
          {withPreviewSnapshots(<PreviewPresentation locale="en" descriptor={descriptor} />)}
        </>,
      );
      await import('../video/VideoPlayer');
    });

    const videos = [...container.querySelectorAll('video')];
    expect(videos).toHaveLength(2);
    expect(videos.map((video) => video.src)).toEqual([descriptor.url, descriptor.url]);
    expect(videos.map((video) => video.className)).toEqual([
      'h-full w-full object-contain',
      'h-full w-full object-contain',
    ]);
    expect(videos[0]?.controls).toBe(true);
    expect(videos[1]?.controls).toBe(false);
  });

  it('uses controlled playback parameters without changing the native media path', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(async () => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <LightweightPreview
          locale="en"
          descriptor={{
            descriptorId: 'descriptor-controlled-video',
            sourceFingerprint: 'fingerprint-controlled-video',
            contentLocator: previewContentLocator,
            url: 'openneko://resource/ffffffffffffffffffffffffffffffff',
            contentKind: 'video',
            mediaType: 'video/webm',
            displayName: 'controlled.webm',
            byteLength: 42,
          }}
          playback={{ requestId: 'play-1', state: 'playing', startTimeSeconds: 1.5 }}
        />,
      );
      await import('../video/VideoPlayer');
    });

    expect(container.querySelector('video')?.currentTime).toBe(1.5);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('keeps Lightweight Preview state local without introducing a fullscreen viewer mode', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <LightweightPreview
          locale="zh-cn"
          descriptor={{
            descriptorId: 'descriptor-embedded-image',
            sourceFingerprint: 'fingerprint-embedded',
            contentLocator: previewContentLocator,
            url: 'openneko://resource/dddddddddddddddddddddddddddddddd',
            contentKind: 'image',
            mediaType: 'image/png',
            displayName: 'embedded.png',
            byteLength: 42,
          }}
        />,
      );
    });
    expect(container.querySelector('[data-preview-ui="lightweight"]')).toBeTruthy();
    expect(container.querySelector('[aria-label="图片缩放"]')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'openneko://resource/dddddddddddddddddddddddddddddddd',
    );
    expect(rootStyles).toMatch(
      /\.neko-preview-viewer--image\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/u,
    );
    expect(rootStyles).not.toMatch(/\.neko-preview-viewer--image[^}]*margin:/u);
  });

  it('keeps concurrent Surface locales isolated', async () => {
    const englishContainer = document.createElement('div');
    const chineseContainer = document.createElement('div');
    document.body.append(englishContainer, chineseContainer);
    const englishRoot = createRoot(englishContainer);
    const chineseRoot = createRoot(chineseContainer);
    await act(async () => {
      englishRoot.render(
        <LightweightPreview
          locale="en"
          descriptor={lightweightImageDescriptor(
            'embedded-locale-en',
            'gggggggggggggggggggggggggggggggg',
          )}
        />,
      );
      chineseRoot.render(
        <LightweightPreview
          locale="zh-cn"
          descriptor={lightweightImageDescriptor(
            'embedded-locale-zh',
            'hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
          )}
        />,
      );
    });
    expect(englishContainer.querySelector('[aria-label="embedded-locale-en.png"]')).toBeTruthy();
    expect(chineseContainer.querySelector('[aria-label="embedded-locale-zh.png"]')).toBeTruthy();
  });

  it('renders embedded text in a Preview-owned readable page with local error chrome', async () => {
    const fetch = vi.fn(async () => new Response('# Heading\n\nReadable body', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const descriptor = {
      ...lightweightImageDescriptor('lightweight-text', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk'),
      contentKind: 'text' as const,
      mediaType: 'text/markdown',
      displayName: 'notes.md',
    };

    await act(async () => {
      root.render(<LightweightPreview locale="en" descriptor={descriptor} />);
    });
    await act(async () => Promise.resolve());

    expect(container.querySelector('[data-preview-text-reader="compact"]')).toBeTruthy();
    expect(container.querySelector('.neko-preview-text-reader__page')).toBeTruthy();
    expect(container.querySelector('[data-markdown-document="ready"]')?.textContent).toContain(
      'Readable body',
    );
    expect(rootStyles).toMatch(/\.neko-preview-text-reader\s*\{[^}]*background:/u);
    expect(rootStyles).toMatch(/\.neko-preview-text-reader__page\s*\{[^}]*background:/u);
    expect(rootStyles).toMatch(/\.neko-preview-text-reader\s*\{[^}]*user-select:\s*text;/u);

    fetch.mockRejectedValueOnce(new Error('transport unavailable'));
    await act(async () => {
      root.render(
        <LightweightPreview
          locale="en"
          descriptor={{ ...descriptor, descriptorId: 'embedded-text-error' }}
        />,
      );
    });
    await act(async () => Promise.resolve());
    expect(container.querySelector('.neko-preview-text-reader__diagnostic')?.textContent).toContain(
      'Unable to load text',
    );
  });

  it('rejects arbitrary transport URLs locally and uses the shared text Viewer', async () => {
    const fetch = vi.fn(async () => new Response('shared text', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <LightweightPreview
          locale="en"
          descriptor={{
            ...lightweightImageDescriptor('invalid-transport', 'iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii'),
            url: 'https://example.com/shot.png',
          }}
        />,
      );
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'authorized OpenNeko resource',
    );

    await act(async () => {
      root.render(
        <LightweightPreview
          locale="en"
          descriptor={{
            ...lightweightImageDescriptor('lightweight-text', 'jjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj'),
            contentKind: 'text',
            mediaType: 'text/markdown',
            displayName: 'notes.md',
          }}
        />,
      );
    });
    await act(async () => Promise.resolve());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.neko-preview-text-reader')?.textContent).toContain(
      'shared text',
    );
  });
});

function lightweightImageDescriptor(descriptorId: string, token: string) {
  return {
    descriptorId,
    sourceFingerprint: `fingerprint-${descriptorId}`,
    contentLocator: previewContentLocator,
    url: `openneko://resource/${token}`,
    contentKind: 'image' as const,
    mediaType: 'image/png',
    displayName: `${descriptorId}.png`,
    byteLength: 42,
  };
}

function createRuntime(projection: PreviewProjection): PreviewHostRuntime {
  return {
    identity,
    getSnapshot: async () => projection,
    execute: async () => projection,
    subscribe: () => () => undefined,
  };
}

function readyImageProjection(displayName: string, token: string): PreviewProjection {
  return {
    identity,
    presentation: 'temporary',
    status: 'ready',
    descriptor: {
      descriptorId: `descriptor-${token}`,
      sourceFingerprint: 'fingerprint-1',
      contentLocator: previewContentLocator,
      url: `http://127.0.0.1:43125/resources/${token}`,
      contentKind: 'image',
      mediaType: 'image/png',
      displayName,
      byteLength: 42,
    },
  };
}

function withPreviewSnapshots(element: ReactElement): ReactElement {
  return <PreviewViewerSnapshotProvider>{element}</PreviewViewerSnapshotProvider>;
}
