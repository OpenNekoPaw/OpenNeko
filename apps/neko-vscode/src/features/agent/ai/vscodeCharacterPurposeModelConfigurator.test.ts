import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { VSCodeCharacterPurposeModelConfigurator } from './vscodeCharacterPurposeModelConfigurator';

describe('VSCodeCharacterPurposeModelConfigurator', () => {
  beforeEach(() => {
    vi.mocked(vscode.window.showQuickPick).mockReset();
  });

  it('keeps existing explicit Character bindings without opening a selector', async () => {
    const config = createConfig({
      bindings: {
        'character.dialogue': { providerId: 'provider-a', modelId: 'model-a' },
        'character.profile': { providerId: 'provider-b', modelId: 'model-b' },
      },
    });
    const configurator = new VSCodeCharacterPurposeModelConfigurator(config);

    await configurator.prepare();

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    expect(config.setDefaultModelPurposeRefs).not.toHaveBeenCalled();
  });

  it('persists one explicit selection under both missing Character purposes', async () => {
    const config = createConfig();
    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
      label: 'Provider A / Model A',
      description: 'Provider A',
      ref: { providerId: 'provider-a', modelId: 'model-a' },
    } as never);
    const configurator = new VSCodeCharacterPurposeModelConfigurator(config);

    await configurator.prepare();

    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          label: 'Provider A / Model A',
          ref: { providerId: 'provider-a', modelId: 'model-a' },
        }),
      ],
      expect.objectContaining({
        title: 'Select a Character roleplay model',
        ignoreFocusOut: true,
      }),
    );
    expect(config.setDefaultModelPurposeRefs).toHaveBeenCalledWith({
      'character.dialogue': { providerId: 'provider-a', modelId: 'model-a' },
      'character.profile': { providerId: 'provider-a', modelId: 'model-a' },
    });
  });

  it('writes only the missing dialogue purpose and preserves profile', async () => {
    const config = createConfig({
      bindings: {
        'character.profile': { providerId: 'provider-b', modelId: 'model-b' },
      },
    });
    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
      label: 'Provider A / Model A',
      ref: { providerId: 'provider-a', modelId: 'model-a' },
    } as never);
    const configurator = new VSCodeCharacterPurposeModelConfigurator(config);

    await configurator.prepare();

    expect(config.setDefaultModelPurposeRefs).toHaveBeenCalledWith({
      'character.dialogue': { providerId: 'provider-a', modelId: 'model-a' },
    });
  });

  it('coalesces concurrent preparation into one selection and persistence operation', async () => {
    const config = createConfig();
    let resolveSelection: ((value: unknown) => void) | undefined;
    const selection = new Promise<unknown>((resolve) => {
      resolveSelection = resolve;
    });
    vi.mocked(vscode.window.showQuickPick).mockReturnValueOnce(selection as never);
    const configurator = new VSCodeCharacterPurposeModelConfigurator(config);

    const first = configurator.prepare();
    const second = configurator.prepare();

    expect(second).toBe(first);
    expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(1);

    resolveSelection?.({
      label: 'Provider A / Model A',
      ref: { providerId: 'provider-a', modelId: 'model-a' },
    });
    await Promise.all([first, second]);

    expect(config.setDefaultModelPurposeRefs).toHaveBeenCalledTimes(1);
  });

  it('fails visibly on cancellation without writing or consulting default models', async () => {
    const config = createConfig();
    vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);
    const configurator = new VSCodeCharacterPurposeModelConfigurator(config);

    await expect(configurator.prepare()).rejects.toThrow(
      'Character model selection was cancelled.',
    );

    expect(config.setDefaultModelPurposeRefs).not.toHaveBeenCalled();
    expect(config.getDefaultModelRef).not.toHaveBeenCalled();
    expect(config.getActiveAgentModelRef).not.toHaveBeenCalled();
  });

  it('rejects an empty compatible catalog without a default-model fallback', async () => {
    const config = createConfig({ modelOptions: [] });
    const configurator = new VSCodeCharacterPurposeModelConfigurator(config);

    await expect(configurator.prepare()).rejects.toThrow(
      'No compatible configured chat model is available for Character roleplay.',
    );

    expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    expect(config.setDefaultModelPurposeRefs).not.toHaveBeenCalled();
    expect(config.getDefaultModelRef).not.toHaveBeenCalled();
    expect(config.getActiveAgentModelRef).not.toHaveBeenCalled();
  });
});

function createConfig(
  options: {
    readonly bindings?: Readonly<
      Partial<
        Record<
          'character.dialogue' | 'character.profile',
          { readonly providerId: string; readonly modelId: string }
        >
      >
    >;
    readonly modelOptions?: readonly {
      readonly id: string;
      readonly label: string;
      readonly providerId: string;
      readonly modelId: string;
      readonly category: 'llm';
      readonly capabilities: readonly string[];
    }[];
  } = {},
) {
  const bindings = options.bindings ?? {};
  return {
    resolveModelRefForPurpose: vi.fn(
      (purpose: 'character.dialogue' | 'character.profile') => bindings[purpose],
    ),
    getChatModelOptions: vi.fn(
      () =>
        options.modelOptions ?? [
          {
            id: 'provider-a:model-a',
            label: 'Provider A / Model A',
            providerId: 'provider-a',
            modelId: 'model-a',
            category: 'llm' as const,
            capabilities: ['chat'],
          },
          {
            id: 'provider-a:image-a',
            label: 'Provider A / Image A',
            providerId: 'provider-a',
            modelId: 'image-a',
            category: 'image' as const,
            capabilities: ['image.generate'],
          },
        ],
    ),
    setDefaultModelPurposeRefs: vi.fn(async () => {}),
    getDefaultModelRef: vi.fn(() => {
      throw new Error('default_models.llm fallback used');
    }),
    getActiveAgentModelRef: vi.fn(() => {
      throw new Error('active Agent model fallback used');
    }),
  };
}
