// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_HOST_RUNTIME_VERSION,
  type PreviewHostRuntime,
  type PreviewProjection,
  type PreviewRuntimeIdentity,
} from '@neko/preview-domain';
import type { AuthorizedPreviewSessionRuntime } from '@neko/preview-domain/authorized-session';
import {
  AuthorizedPreviewRoot,
  PreviewRoot,
  QuickPreviewSurface,
  getPreviewViewerRegistry,
} from './index';
const playerStyles = readFileSync(resolve(__dirname, '../styles/player.css'), 'utf8');
const modelStyles = readFileSync(resolve(__dirname, '../model/model.css'), 'utf8');
const rootStyles = readFileSync(resolve(__dirname, './style.css'), 'utf8');

const identity: PreviewRuntimeIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'preview-1',
  viewEpoch: 1,
  documentId: 'document-1',
  sessionId: 'session-1',
  endpointEpoch: 'endpoint-1',
  revision: 1,
};

const previewContentLocator = {
  kind: 'workspace-file' as const,
  path: 'preview/fixture.bin',
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
    expect(modelStyles).not.toMatch(/(^|\n)\s*#root\s*[,{]/u);
    expect(modelStyles).not.toMatch(/(^|\n)\s*html\s*,/u);
    expect(rootStyles).toMatch(/\.neko-preview-root__viewer\s*\{[^}]*position:\s*relative;/u);
  });

  it('registers image, video, audio, text, document and model viewers explicitly', () => {
    expect(getPreviewViewerRegistry().map((entry) => entry.kind)).toEqual([
      'image',
      'video',
      'audio',
      'text',
      'document',
      'model',
    ]);
  });

  it('uses one package-owned presentation and viewer registry for Workspace and authorized previews', async () => {
    const descriptor = {
      descriptorId: 'descriptor-shared-image',
      revision: 'revision-1',
      contentLocator: previewContentLocator,
      url: 'http://127.0.0.1:43125/v1/resources/shared-image-token',
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
      revision: 1,
    };
    const authorizedRuntime: AuthorizedPreviewSessionRuntime = {
      identity: authorizedIdentity,
      getSnapshot: async () => ({
        schemaVersion: 1,
        identity: authorizedIdentity,
        status: 'ready',
        descriptor,
      }),
      subscribe: () => () => undefined,
    };

    await act(async () => {
      workspaceRoot.render(
        <PreviewRoot
          locale="en"
          runtime={createRuntime({
            schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
            identity,
            presentation: 'side',
            status: 'ready',
            descriptor,
          })}
        />,
      );
      authorizedRoot.render(<AuthorizedPreviewRoot locale="en" runtime={authorizedRuntime} />);
    });
    await act(async () => Promise.resolve());

    for (const container of [workspaceContainer, authorizedContainer]) {
      expect(
        container.querySelector('[data-preview-presentation-owner="preview-webview"]'),
      ).toBeTruthy();
      expect(container.querySelector('img')?.getAttribute('src')).toBe(descriptor.url);
      expect(container.querySelector('.neko-preview-root__heading')?.textContent).toContain(
        'shared.png',
      );
    }
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
        <PreviewRoot
          locale="zh-cn"
          runtime={createRuntime({
            schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
            identity,
            presentation: 'temporary',
            status: 'ready',
            descriptor: {
              descriptorId: 'descriptor-1',
              revision: 'revision-1',
              contentLocator: previewContentLocator,
              url: 'http://127.0.0.1:43125/v1/resources/text-token',
              contentKind: 'text',
              mediaType: 'application/json',
              displayName: 'candidates.json',
              byteLength: 12,
            },
          })}
        />,
      );
    });
    await act(async () => Promise.resolve());

    expect(container.textContent).toContain('candidates.json');
    expect(container.textContent).toContain('{"items":[]}');
    expect(JSON.stringify(container.innerHTML)).not.toContain('/Users/');
  });

  it('routes pin and side actions through the injected Preview runtime', async () => {
    const projection: PreviewProjection = {
      schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
      identity,
      presentation: 'temporary',
      status: 'ready',
      descriptor: {
        descriptorId: 'descriptor-image',
        revision: 'revision-1',
        contentLocator: previewContentLocator,
        url: 'http://127.0.0.1:43125/v1/resources/image-token',
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
      root.render(<PreviewRoot locale="en" runtime={runtime} />);
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
        <PreviewRoot
          locale="en"
          runtime={createRuntime({
            schemaVersion: PREVIEW_HOST_RUNTIME_VERSION,
            identity,
            presentation: 'temporary',
            status: 'ready',
            descriptor: {
              descriptorId: 'descriptor-video',
              revision: 'revision-1',
              contentLocator: previewContentLocator,
              url: 'http://127.0.0.1:43125/v1/resources/video-token',
              contentKind: 'video',
              mediaType: 'video/mp4',
              displayName: 'clip.mp4',
              byteLength: 42,
            },
          })}
        />,
      );
    });

    expect(container.querySelector('video')?.getAttribute('src')).toBe(
      'http://127.0.0.1:43125/v1/resources/video-token',
    );
    expect(container.querySelector('.absolute.inset-0.bg-black')).toBeTruthy();
    expect(container.querySelector('[aria-label="Play (Space)"]')).toBeTruthy();
  });

  it('renders image quick preview from the opaque package-owned descriptor', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <QuickPreviewSurface
          locale="en"
          descriptor={{
            descriptorId: 'descriptor-image-hover',
            revision: 'revision-1',
            contentLocator: previewContentLocator,
            url: 'http://127.0.0.1:43125/v1/resources/image-hover-token',
            contentKind: 'image',
            mediaType: 'image/png',
            displayName: 'hover.png',
            byteLength: 42,
          }}
        />,
      );
    });

    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'http://127.0.0.1:43125/v1/resources/image-hover-token',
    );
    expect(container.querySelector('.neko-preview-quick')).toBeTruthy();
  });

  it('autoplays compact video and audio quick previews and pauses them on unmount', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementation(async () => undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <QuickPreviewSurface
          locale="en"
          descriptor={{
            descriptorId: 'descriptor-video-hover',
            revision: 'revision-1',
            contentLocator: previewContentLocator,
            url: 'http://127.0.0.1:43125/v1/resources/video-hover-token',
            contentKind: 'video',
            mediaType: 'video/mp4',
            displayName: 'hover.mp4',
            byteLength: 42,
          }}
        />,
      );
    });
    const video = container.querySelector('video');
    expect(video?.muted).toBe(true);
    expect(play).toHaveBeenCalledOnce();

    await act(async () => {
      root.render(
        <QuickPreviewSurface
          locale="en"
          descriptor={{
            descriptorId: 'descriptor-audio-hover',
            revision: 'revision-1',
            contentLocator: previewContentLocator,
            url: 'http://127.0.0.1:43125/v1/resources/audio-hover-token',
            contentKind: 'audio',
            mediaType: 'audio/aac',
            displayName: 'hover.aac',
            byteLength: 42,
          }}
        />,
      );
    });
    expect(container.querySelector('audio')).toBeTruthy();
    expect(play).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
    expect(pause).toHaveBeenCalled();
  });
});

function createRuntime(projection: PreviewProjection): PreviewHostRuntime {
  return {
    identity,
    getSnapshot: async () => projection,
    execute: async () => projection,
    subscribe: () => () => undefined,
  };
}
