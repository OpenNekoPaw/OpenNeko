import * as vscode from 'vscode';
import { modelSupportsPurpose, type AgentModelPurpose } from '@neko/platform';
import type { ChatModelOption, ModelRefConfig } from '@neko/shared';

const CHARACTER_MODEL_PURPOSES = [
  'character.dialogue',
  'character.profile',
] as const satisfies readonly AgentModelPurpose[];

type CharacterModelPurpose = (typeof CHARACTER_MODEL_PURPOSES)[number];

export interface CharacterPurposeModelConfig {
  resolveModelRefForPurpose(purpose: CharacterModelPurpose): ModelRefConfig | undefined;
  getChatModelOptions(): ChatModelOption[];
  setDefaultModelPurposeRefs(
    updates: Readonly<Partial<Record<CharacterModelPurpose, ModelRefConfig>>>,
  ): Promise<void>;
}

interface CharacterModelQuickPickItem extends vscode.QuickPickItem {
  readonly ref: ModelRefConfig;
}

export class VSCodeCharacterPurposeModelConfigurator {
  private pendingPreparation: Promise<void> | undefined;

  constructor(private readonly config: CharacterPurposeModelConfig) {}

  prepare(): Promise<void> {
    if (this.pendingPreparation) return this.pendingPreparation;

    const preparation = this.prepareOnce().finally(() => {
      if (this.pendingPreparation === preparation) {
        this.pendingPreparation = undefined;
      }
    });
    this.pendingPreparation = preparation;
    return preparation;
  }

  private async prepareOnce(): Promise<void> {
    const missingPurposes = CHARACTER_MODEL_PURPOSES.filter(
      (purpose) => !this.config.resolveModelRefForPurpose(purpose),
    );
    if (missingPurposes.length === 0) return;

    const items = this.config
      .getChatModelOptions()
      .filter(isCharacterModelOption)
      .map((option): CharacterModelQuickPickItem => ({
        label: option.label,
        ...(option.providerLabel ? { description: option.providerLabel } : {}),
        ref: {
          providerId: option.providerId,
          modelId: option.modelId,
        },
      }));
    if (items.length === 0) {
      throw new Error('No compatible configured chat model is available for Character roleplay.');
    }

    const selected = await vscode.window.showQuickPick(items, {
      title: 'Select a Character roleplay model',
      placeHolder: 'This model becomes the explicit default for missing Character purposes.',
      ignoreFocusOut: true,
      matchOnDescription: true,
    });
    if (!selected) {
      throw new Error('Character model selection was cancelled.');
    }

    const updates: Partial<Record<CharacterModelPurpose, ModelRefConfig>> = {};
    for (const purpose of missingPurposes) {
      updates[purpose] = selected.ref;
    }
    await this.config.setDefaultModelPurposeRefs(updates);
  }
}

function isCharacterModelOption(option: ChatModelOption): boolean {
  return (
    option.category === 'llm' &&
    modelSupportsPurpose(
      {
        type: option.category,
        capabilities: option.capabilities ?? [],
      },
      'character.dialogue',
    )
  );
}
