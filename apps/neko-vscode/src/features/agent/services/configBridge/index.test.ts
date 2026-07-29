import { describe, expect, it, vi } from 'vitest';
import type { Platform } from '@neko/platform';
import { ConfigBridge } from './index';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

describe('ConfigBridge', () => {
  it('projects the local provider config snapshot without an auth dependency', async () => {
    const platform = {
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
    const bridge = new ConfigBridge(platform);
    const postMessage = vi.fn();

    await bridge.sendConfigState(postMessage);

    expect(postMessage).toHaveBeenCalledWith({
      type: 'configState',
      config: expect.objectContaining({
        selectedProviderId: 'provider-default',
        selectedModelId: 'model-default',
        modelGroups: [],
      }),
    });
    bridge.dispose();
  });
});
