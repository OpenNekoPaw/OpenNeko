import type { GenerationModelParameterProfile } from '@neko/generation-domain';
import type { CanvasGenerationModelOption } from './canvas-host-runtime-contract';
import {
  CANVAS_GENERATION_PURPOSES,
  type CanvasGenerationPurpose,
} from './types/canvas-generation-node';

export interface CanvasGenerationCatalogProvider {
  readonly id: string;
  readonly displayName: string;
}

export interface CanvasGenerationCatalogModel {
  readonly id: string;
  readonly providerId: string;
  readonly name: string;
  readonly displayName?: string;
}

export interface CanvasGenerationCatalogModelRef {
  readonly providerId: string;
  readonly modelId: string;
}

export interface CanvasGenerationModelCatalogInput<
  Model extends CanvasGenerationCatalogModel = CanvasGenerationCatalogModel,
> {
  readonly providers: readonly CanvasGenerationCatalogProvider[];
  readonly models: readonly Model[];
  readonly supportsPurpose: (model: Model, purpose: CanvasGenerationPurpose) => boolean;
  readonly resolveParameterProfile?: (model: Model) => GenerationModelParameterProfile | undefined;
  readonly getDefaultModelPurposeRef: (
    purpose: CanvasGenerationPurpose,
  ) => CanvasGenerationCatalogModelRef | undefined;
  readonly getDefaultModelRef: (
    type: 'llm' | 'image' | 'video' | 'audio',
  ) => CanvasGenerationCatalogModelRef | undefined;
}

export function projectCanvasGenerationModels<Model extends CanvasGenerationCatalogModel>(
  input: CanvasGenerationModelCatalogInput<Model>,
): readonly CanvasGenerationModelOption[] {
  const providers = new Map(input.providers.map((provider) => [provider.id, provider] as const));
  return input.models
    .flatMap((model) => {
      const provider = providers.get(model.providerId);
      if (!provider) return [];
      const parameterProfile = input.resolveParameterProfile?.(model);
      return CANVAS_GENERATION_PURPOSES.filter((purpose) =>
        input.supportsPurpose(model, purpose),
      ).map((purpose) => {
        const configuredDefault =
          input.getDefaultModelPurposeRef(purpose) ??
          input.getDefaultModelRef(modelTypeForPurpose(purpose));
        return {
          binding: { purpose, providerId: provider.id, modelId: model.id },
          label: model.displayName ?? model.name,
          providerLabel: provider.displayName,
          isDefault:
            configuredDefault?.providerId === provider.id && configuredDefault.modelId === model.id,
          ...(purpose === 'video.generate' && parameterProfile ? { parameterProfile } : {}),
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
  purpose: CanvasGenerationPurpose,
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
