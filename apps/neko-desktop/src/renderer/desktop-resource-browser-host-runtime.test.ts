import { describe, expect, it, vi } from 'vitest';
import {
  ResourceBrowserOperationRejectedError,
  type ResourceBrowserIdentity,
  type ResourceBrowserProjection,
} from '@neko/assets-domain/resource-browser/contract';
import type { OpenNekoDesktopResourceBrowserBridge } from '../shared/resource-browser-bridge-contract';
import { createElectronResourceBrowserHostRuntime } from './desktop-resource-browser-host-runtime';

const identity: ResourceBrowserIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-browser:view-1',
  viewInstanceId: 'view-instance-1',
  rendererSessionId: 'endpoint-1',
};
const projection: ResourceBrowserProjection = {
  identity,
  source: 'media',
  query: '',
  items: [],
};

describe('Electron Resource Browser Host runtime', () => {
  it('builds snapshot requests and filters foreign events', async () => {
    let publish:
      Parameters<OpenNekoDesktopResourceBrowserBridge['resources']['subscribe']>[0] | undefined;
    const bridge: OpenNekoDesktopResourceBrowserBridge = {
      resources: {
        getSnapshot: vi.fn(async () => projection),
        children: vi.fn(async () => projection),
        resolveThumbnail: vi.fn(async (request) => ({
          requestId: request.requestId,
          identity: request.identity,
          resourceId: request.resourceId,
          descriptorId: request.descriptorId,
          sourceFingerprint: request.sourceFingerprint,
          dataUrl: 'data:image/png;base64,aW1hZ2U=',
        })),
        resolveQuickPreview: vi.fn(async (request) => ({
          requestId: request.requestId,
          identity: request.identity,
          resourceId: request.resourceId,
          previewSessionId: 'hover-1',
          descriptor: {
            descriptorId: 'descriptor-1',
            sourceFingerprint: 'fingerprint-1',
            contentLocator: { file: { authority: 'workspace' as const, path: 'media/clip.mp4' } },
            url: 'openneko://resource/0123456789abcdefghijklmnopqrstuv',
            contentKind: 'video' as const,
            mediaType: 'video/mp4',
            displayName: 'clip.mp4',
            byteLength: 100,
          },
        })),
        releaseQuickPreview: vi.fn(async (request) => ({
          requestId: request.requestId,
          identity: request.identity,
          previewSessionId: request.previewSessionId,
          status: 'released' as const,
        })),
        planRecovery: vi.fn(async (request) => ({
          requestId: request.requestId,
          identity: request.identity,
          resourceId: request.resourceId,
          status: 'cancelled' as const,
        })),
        applyRecovery: vi.fn(async () => projection),
        cancelRecovery: vi.fn(async (request) => ({
          requestId: request.requestId,
          identity: request.identity,
          planId: request.planId,
          status: 'cancelled' as const,
        })),
        search: vi.fn(async () => projection),
        execute: vi.fn(async (request) => ({
          requestId: request.requestId,
          identity: request.identity,
          status: 'completed' as const,
          projection,
        })),
        subscribe: vi.fn((listener) => {
          publish = listener;
          return () => undefined;
        }),
      },
    };
    const runtime = createElectronResourceBrowserHostRuntime({ bridge, identity });
    const listener = vi.fn();
    runtime.subscribe(listener);

    await runtime.getSnapshot();
    await runtime.children({
      requestId: 'children-1',
      identity,
      route: 'children',
      source: 'media',
      parentResourceId: 'content:library',
      limit: 100,
    });
    publish?.({
      sequence: 1,
      projection: { ...projection, identity: { ...identity, viewInstanceId: 'view-instance-2' } },
    });
    publish?.({
      sequence: 1,
      projection,
    });

    expect(bridge.resources.getSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'snapshot.get',
        identity,
      }),
    );
    expect(bridge.resources.children).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'children',
        parentResourceId: 'content:library',
      }),
    );
    expect(listener).toHaveBeenCalledOnce();
  });

  it('converts a typed Main View capacity result without returning a fallback projection', async () => {
    const execute = vi.fn(async (request) => ({
      requestId: request.requestId,
      identity: request.identity,
      status: 'rejected' as const,
      rejection: { code: 'main-view-capacity-reached' as const, maximum: 8 },
    }));
    const bridge = {
      resources: {
        getSnapshot: vi.fn(async () => projection),
        children: vi.fn(async () => projection),
        resolveThumbnail: vi.fn(),
        resolveQuickPreview: vi.fn(),
        releaseQuickPreview: vi.fn(),
        planRecovery: vi.fn(),
        applyRecovery: vi.fn(),
        cancelRecovery: vi.fn(),
        search: vi.fn(async () => projection),
        execute,
        subscribe: vi.fn(() => () => undefined),
      },
    } satisfies OpenNekoDesktopResourceBrowserBridge;
    const runtime = createElectronResourceBrowserHostRuntime({ bridge, identity });

    await expect(
      runtime.execute({
        requestId: 'open-ninth-view',
        identity,
        route: 'text.edit',
        resourceId: 'content:ninth',
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ResourceBrowserOperationRejectedError>>({
        code: 'main-view-capacity-reached',
        maximum: 8,
      }),
    );
    expect(execute).toHaveBeenCalledOnce();
  });
});
