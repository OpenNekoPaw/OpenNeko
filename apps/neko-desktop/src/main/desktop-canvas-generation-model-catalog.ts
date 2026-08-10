import { CANVAS_GENERATION_PURPOSES, type CanvasGenerationModelOption } from '@neko/canvas-domain';
import type { ConfigManager } from '@neko/host/settings';
import { modelSupportsPurpose } from '@neko/host/settings';

export function projectDesktopCanvasGenerationModels(
  config: ConfigManager,
): readonly CanvasGenerationModelOption[] {
  const providers = new Map(
    config.getEnabledProviders().map((provider) => [provider.id, provider] as const),
  );
  return config
    .getEnabledModels()
    .flatMap((model) => {
      const provider = providers.get(model.providerId);
      if (!provider) return [];
      return CANVAS_GENERATION_PURPOSES.filter((purpose) =>
        modelSupportsPurpose(model, purpose),
      ).map((purpose) => {
        const configuredDefault =
          config.getDefaultModelPurposeRef(purpose) ??
          config.getDefaultModelRef(modelTypeForPurpose(purpose));
        return {
          binding: { purpose, providerId: provider.id, modelId: model.id },
          label: model.displayName ?? model.name,
          providerLabel: provider.displayName,
          isDefault:
            configuredDefault?.providerId === provider.id && configuredDefault.modelId === model.id,
        };
      });
    })
    .sort((left, right) => {
      if (left.binding.purpose === right.binding.purpose && left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1;
      }
      return `${left.providerLabel}\u0000${left.label}\u0000${left.binding.purpose}`.localeCompare(
        `${right.providerLabel}\u0000${right.label}\u0000${right.binding.purpose}`,
      );
    });
}

function modelTypeForPurpose(
  purpose: (typeof CANVAS_GENERATION_PURPOSES)[number],
): 'llm' | 'image' | 'video' | 'audio' {
  switch (purpose) {
    case 'canvas.prompt':
      return 'llm';
    case 'image.generate':
      return 'image';
    case 'video.generate':
      return 'video';
    case 'audio.generate':
    case 'audio.music.generate':
      return 'audio';
  }
}
