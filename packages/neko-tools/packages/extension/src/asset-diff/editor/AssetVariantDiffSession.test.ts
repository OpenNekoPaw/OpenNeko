import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import type * as vscode from 'vscode';
import { AssetVariantDiffSession } from './AssetVariantDiffSession';
import { AssetVariantDiffSessionFactory } from './AssetVariantDiffSessionFactory';
import type { IAssetVariantDiffMessageHandler } from './AssetVariantDiffSession';
import type { VariantComparisonResult } from '@neko/shared';

function createMockDisposable() {
  return { dispose: vi.fn() };
}

function createMockWebviewPanel() {
  const receiveDisposable = createMockDisposable();
  const disposeDisposable = createMockDisposable();
  let onDidDisposeListener: (() => void) | undefined;

  const webview = {
    onDidReceiveMessage: vi.fn().mockReturnValue(receiveDisposable),
  };

  const panel = {
    webview,
    onDidDispose: vi.fn().mockImplementation((listener: () => void) => {
      onDidDisposeListener = listener;
      return disposeDisposable;
    }),
  };

  return {
    panel: panel as unknown as vscode.WebviewPanel,
    webview,
    receiveDisposable,
    disposeDisposable,
    triggerDispose: async () => {
      onDidDisposeListener?.();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

function createMockMessageHandler(): IAssetVariantDiffMessageHandler {
  return {
    initializeDiff: vi.fn().mockResolvedValue(undefined),
    handleMessage: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    disposeAsync: vi.fn().mockResolvedValue(undefined),
  };
}

describe('AssetVariantDiffSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should attach listeners and initialize diff', async () => {
    const { panel } = createMockWebviewPanel();
    const messageHandler = createMockMessageHandler();
    const session = new AssetVariantDiffSession(panel, messageHandler);

    session.attach(vi.fn());
    await session.start();

    expect(panel.webview.onDidReceiveMessage).toHaveBeenCalledTimes(1);
    expect(panel.onDidDispose).toHaveBeenCalledTimes(1);
    expect(messageHandler.initializeDiff).toHaveBeenCalledTimes(1);
  });

  it('should dispose listeners and handler only once', async () => {
    const { panel, receiveDisposable, disposeDisposable } = createMockWebviewPanel();
    const messageHandler = createMockMessageHandler();
    const session = new AssetVariantDiffSession(panel, messageHandler);

    session.attach(vi.fn());
    await session.disposeAsync();
    await session.disposeAsync();

    expect(receiveDisposable.dispose).toHaveBeenCalledTimes(1);
    expect(disposeDisposable.dispose).toHaveBeenCalledTimes(1);
    expect(messageHandler.disposeAsync).toHaveBeenCalledTimes(1);
  });

  it('should finish cleanup before invoking the dispose callback', async () => {
    const { panel, triggerDispose } = createMockWebviewPanel();
    let cleanupFinished = false;
    const messageHandler: IAssetVariantDiffMessageHandler = {
      initializeDiff: vi.fn().mockResolvedValue(undefined),
      handleMessage: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      disposeAsync: vi.fn().mockImplementation(async () => {
        await Promise.resolve();
        cleanupFinished = true;
      }),
    };
    const session = new AssetVariantDiffSession(panel, messageHandler);
    const onDidDispose = vi.fn(() => {
      expect(cleanupFinished).toBe(true);
    });

    session.attach(onDidDispose);
    await triggerDispose();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(messageHandler.disposeAsync).toHaveBeenCalledTimes(1);
    expect(onDidDispose).toHaveBeenCalledTimes(1);
  });
});

describe('AssetVariantDiffSessionFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create session with message handler factory', async () => {
    const { panel } = createMockWebviewPanel();
    const compareVariants =
      vi.fn<
        (
          entityId: string,
          variantIdA: string,
          variantIdB: string,
        ) => Promise<VariantComparisonResult>
      >();
    const messageHandler = createMockMessageHandler();
    const createMessageHandler = vi.fn().mockReturnValue(messageHandler);
    const factory = new AssetVariantDiffSessionFactory(compareVariants, createMessageHandler);
    const entity = { id: 'entity-1' };
    const variantA = { id: 'variant-a' };
    const variantB = { id: 'variant-b' };

    const session = factory.createSession({
      webviewPanel: panel,
      entity: entity as never,
      variantA: variantA as never,
      variantB: variantB as never,
    });

    expect(createMessageHandler).toHaveBeenCalledWith({
      webview: panel.webview,
      entity,
      variantA,
      variantB,
    });

    await session.start();
    expect(messageHandler.initializeDiff).toHaveBeenCalledTimes(1);
  });

  it('should reject creating sessions after factory disposal', () => {
    const { panel } = createMockWebviewPanel();
    const factory = new AssetVariantDiffSessionFactory();

    factory.dispose();

    expect(() =>
      factory.createSession({
        webviewPanel: panel,
        entity: { id: 'entity-1' } as never,
        variantA: { id: 'variant-a' } as never,
        variantB: { id: 'variant-b' } as never,
      }),
    ).toThrow('AssetVariantDiffSessionFactory has been disposed');
  });
});
