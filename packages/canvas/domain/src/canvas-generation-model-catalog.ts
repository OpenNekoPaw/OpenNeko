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
  readonly type?: CanvasGenerationModelType;
}

export type CanvasGenerationModelType = 'llm' | 'image' | 'video' | 'audio' | 'music';

export interface CanvasGenerationCatalogModelRef {
  readonly providerId: string;
  readonly modelId: string;
}

export interface CanvasGenerationModelCatalogInput<
  Model extends CanvasGenerationCatalogModel = CanvasGenerationCatalogModel,
> {
  readonly providers: readonly CanvasGenerationCatalogProvider[];
  readonly models: readonly Model[];
  readonly resolveParameterProfile?: (model: Model) => GenerationModelParameterProfile | undefined;
  readonly getDefaultModelRef: (
    type: CanvasGenerationModelType,
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
        canvasGenerationModelSupportsPurpose(model, purpose),
      ).map((purpose) => {
        const configuredDefault = input.getDefaultModelRef(modelTypeForPurpose(purpose));
        return {
          binding: { purpose, providerId: provider.id, modelId: model.id },
          label: model.displayName ?? model.name,
          providerLabel: provider.displayName,
          isDefault:
            configuredDefault?.providerId === provider.id && configuredDefault.modelId === model.id,
          ...(parameterProfileMatchesPurpose(parameterProfile, purpose)
            ? { parameterProfile }
            : {}),
        };
      });
    })
    .sort((left, right) => {
      if (left.binding.purpose !== right.binding.purpose) {
        return left.binding.purpose.localeCompare(right.binding.purpose);
      }
      if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1;
      }
      return `${left.providerLabel}\u0000${left.label}`.localeCompare(
        `${right.providerLabel}\u0000${right.label}`,
      );
    });
}

function parameterProfileMatchesPurpose(
  profile: GenerationModelParameterProfile | undefined,
  purpose: CanvasGenerationPurpose,
): profile is GenerationModelParameterProfile {
  return (
    (purpose === 'image.generate' && profile?.kind === 'image') ||
    (purpose === 'video.generate' && profile?.kind === 'video')
  );
}

export function canvasGenerationModelSupportsPurpose(
  model: Pick<CanvasGenerationCatalogModel, 'type'>,
  purpose: CanvasGenerationPurpose,
): boolean {
  return model.type === modelTypeForPurpose(purpose);
}

function modelTypeForPurpose(purpose: CanvasGenerationPurpose): CanvasGenerationModelType {
  switch (purpose) {
    case 'canvas.prompt':
      return 'llm';
    case 'image.generate':
      return 'image';
    case 'video.generate':
      return 'video';
    case 'audio.generate':
      return 'audio';
  }
}
