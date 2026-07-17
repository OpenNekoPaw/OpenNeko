import { describe, expect, it, vi } from 'vitest';
import { ConfigBridge } from './index';
import type { Platform } from '@neko/platform';
import {
  AccountAiCatalogAuthorizationError,
  type AccountAiCatalogCache,
} from '../accountAiCatalogCache';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

describe('ConfigBridge', () => {
  it('projects config state when account catalog auth fails', async () => {
    const platform = createPlatform();
    const accountCatalog = {
      getSnapshot: vi.fn(async () => {
        throw new AccountAiCatalogAuthorizationError('unauthorized', 401);
      }),
      invalidateForAuthFailure: vi.fn(),
    } as unknown as AccountAiCatalogCache;
    const bridge = new ConfigBridge(platform, undefined, accountCatalog);
    const postMessage = vi.fn();

    await bridge.sendConfigState(postMessage);

    expect(accountCatalog.invalidateForAuthFailure).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'configState',
      config: {
        providers: [],
        configuredProviders: [],
        modelGroups: [],
        selectedProviderId: 'provider-default',
        selectedModelId: 'model-default',
        chatModelOptions: [],
        defaultMediaModels: {},
        maxTokens: 8192,
        executionMode: 'ask',
      },
    });

    bridge.dispose();
  });

  it('does not hide unexpected account catalog projection errors', async () => {
    const platform = createPlatform();
    const accountCatalog = {
      getSnapshot: vi.fn(async () => {
        throw new Error('catalog invariant broke');
      }),
      invalidateForAuthFailure: vi.fn(),
    } as unknown as AccountAiCatalogCache;
    const bridge = new ConfigBridge(platform, undefined, accountCatalog);

    await expect(bridge.sendConfigState(vi.fn())).rejects.toThrow('catalog invariant broke');
    expect(accountCatalog.invalidateForAuthFailure).not.toHaveBeenCalled();

    bridge.dispose();
  });
});

function createPlatform(): Platform {
  return {
    config: {
      getAssistantConfigState: vi.fn(() => ({
        providers: [],
        configuredProviders: [],
        modelGroups: [],
        selectedProviderId: 'provider-default',
        selectedModelId: 'model-default',
        chatModelOptions: [],
        defaultMediaModels: {},
        maxTokens: 8192,
        executionMode: 'ask',
      })),
    },
  } as unknown as Platform;
}
