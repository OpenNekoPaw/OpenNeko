import type { CanvasHostRuntimeIdentity } from '../canvas-host-runtime-contract';
import type { CanvasGenerationProjectionSnapshot } from '../canvas-generation-projection';
import type { CanvasMaterialActionTarget } from '../canvas-material-action-catalog';
import type {
  CanvasMaterialActionDescriptor,
  CanvasMaterialActionIntent,
  CanvasMaterialMediaKind,
} from '../types/canvas-material-contracts';

const MATERIAL_MEDIA_KINDS: readonly CanvasMaterialMediaKind[] = [
  'image',
  'video',
  'audio',
  'document',
  'model',
  'other',
];

export const CANVAS_PREVIEW_ACTION_ID = 'preview:open';
export const CANVAS_REVEAL_ACTION_ID = 'desktop:reveal';
export const CANVAS_OPEN_IN_CUT_ACTION_ID = 'cut:open';
export const CANVAS_ADD_TO_CUT_ACTION_ID = 'cut:add-resource';
export const CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID = 'media-library:copy-to-project';
export const CANVAS_COPY_TO_GLOBAL_MEDIA_LIBRARY_ACTION_ID = 'media-library:copy-to-global';
export const CANVAS_REGENERATE_ACTION_ID = 'generation:regenerate';
export const CANVAS_EDIT_AND_GENERATE_ACTION_ID = 'generation:edit-and-generate';

export interface CanvasMaterialActionExecutionResult {
  readonly generationProjection?: CanvasGenerationProjectionSnapshot;
}

export interface CanvasGenerationActionAvailability {
  readonly regenerate: boolean;
  readonly editAndGenerate: boolean;
}

export interface CanvasMaterialActionOwner {
  resolve(input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly targets: readonly CanvasMaterialActionTarget[];
  }): Promise<readonly CanvasMaterialActionDescriptor[]>;
  execute(input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly descriptor: CanvasMaterialActionDescriptor;
    readonly action: CanvasMaterialActionIntent;
    readonly targets: readonly CanvasMaterialActionTarget[];
  }): Promise<CanvasMaterialActionExecutionResult>;
}

/**
 * Composes capability owners into Canvas descriptors without importing their
 * concrete Preview, Cut, Generation, Assets, or shell implementations.
 */
export function createCanvasMaterialActionOwner(options: {
  readonly preview?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly target: CanvasMaterialActionTarget;
  }) => Promise<void>;
  readonly reveal?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly target: CanvasMaterialActionTarget;
  }) => Promise<void>;
  readonly resolveCut?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly target: CanvasMaterialActionTarget;
  }) => Promise<boolean>;
  readonly openInCut?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly target: CanvasMaterialActionTarget;
  }) => Promise<void>;
  readonly resolveAddToCut?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly target: CanvasMaterialActionTarget;
  }) => Promise<Readonly<Record<string, unknown>> | undefined>;
  readonly addToCut?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly target: CanvasMaterialActionTarget;
    readonly executionPayload: Readonly<Record<string, unknown>>;
  }) => Promise<void>;
  readonly resolveMediaLibraryCopy?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly target: CanvasMaterialActionTarget;
  }) => Promise<{
    readonly projectLinked: boolean;
    readonly global: boolean;
  }>;
  readonly copyToProjectMediaLibrary?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly target: CanvasMaterialActionTarget;
  }) => Promise<void>;
  readonly copyToGlobalMediaLibrary?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly target: CanvasMaterialActionTarget;
  }) => Promise<void>;
  readonly resolveGeneration?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly target: CanvasMaterialActionTarget;
  }) => Promise<CanvasGenerationActionAvailability>;
  readonly regenerate?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly target: CanvasMaterialActionTarget;
  }) => Promise<CanvasGenerationProjectionSnapshot>;
  readonly editAndGenerate?: (input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly target: CanvasMaterialActionTarget;
  }) => Promise<CanvasGenerationProjectionSnapshot | undefined>;
  readonly labels?: {
    readonly preview?: string;
    readonly reveal?: string;
    readonly openInCut?: string;
    readonly addToCut?: string;
    readonly copyToProjectMediaLibrary?: string;
    readonly copyToGlobalMediaLibrary?: string;
    readonly regenerate?: string;
    readonly editAndGenerate?: string;
  };
}): CanvasMaterialActionOwner {
  const baseDescriptors: CanvasMaterialActionDescriptor[] = [];
  if (options.preview) {
    baseDescriptors.push({
      id: CANVAS_PREVIEW_ACTION_ID,
      ownerId: 'preview',
      label: options.labels?.preview ?? 'Preview',
      mediaKinds: MATERIAL_MEDIA_KINDS,
      origins: ['referenced', 'generated'],
      selection: { minimum: 1, maximum: 1 },
      effect: 'read',
    });
  }
  if (options.reveal) {
    baseDescriptors.push({
      id: CANVAS_REVEAL_ACTION_ID,
      ownerId: 'desktop',
      label: options.labels?.reveal ?? 'Reveal',
      mediaKinds: MATERIAL_MEDIA_KINDS,
      origins: ['referenced', 'generated'],
      selection: { minimum: 1, maximum: 1 },
      effect: 'handoff',
    });
  }

  return {
    async resolve({ identity, targets }) {
      const descriptors = [...baseDescriptors];
      const target = targets.length === 1 ? targets[0] : undefined;
      if (
        target &&
        options.resolveCut &&
        options.openInCut &&
        (await options.resolveCut({ identity, target }))
      ) {
        descriptors.push({
          id: CANVAS_OPEN_IN_CUT_ACTION_ID,
          ownerId: 'cut',
          label: options.labels?.openInCut ?? 'Open in Cut',
          mediaKinds: ['document', 'other'],
          origins: ['referenced'],
          selection: { minimum: 1, maximum: 1 },
          effect: 'handoff',
        });
      }
      if (
        target &&
        (target.mediaKind === 'video' || target.mediaKind === 'audio') &&
        options.resolveAddToCut &&
        options.addToCut
      ) {
        const executionPayload = await options.resolveAddToCut({ identity, target });
        if (executionPayload) {
          descriptors.push({
            id: CANVAS_ADD_TO_CUT_ACTION_ID,
            ownerId: 'cut',
            label: options.labels?.addToCut ?? 'Add to Cut',
            mediaKinds: ['video', 'audio'],
            origins: ['referenced', 'generated'],
            selection: { minimum: 1, maximum: 1 },
            effect: 'handoff',
            executionPayload,
          });
        }
      }
      if (target && options.resolveMediaLibraryCopy) {
        const availability = await options.resolveMediaLibraryCopy({ identity, target });
        if (availability.projectLinked && options.copyToProjectMediaLibrary) {
          descriptors.push({
            id: CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID,
            ownerId: 'media-library',
            label: options.labels?.copyToProjectMediaLibrary ?? 'Copy to project Media Library',
            mediaKinds: MATERIAL_MEDIA_KINDS,
            origins: ['referenced', 'generated'],
            selection: { minimum: 1, maximum: 1 },
            effect: 'copy',
          });
        }
        if (availability.global && options.copyToGlobalMediaLibrary) {
          descriptors.push({
            id: CANVAS_COPY_TO_GLOBAL_MEDIA_LIBRARY_ACTION_ID,
            ownerId: 'media-library',
            label: options.labels?.copyToGlobalMediaLibrary ?? 'Copy to global Media Library',
            mediaKinds: MATERIAL_MEDIA_KINDS,
            origins: ['referenced', 'generated'],
            selection: { minimum: 1, maximum: 1 },
            effect: 'copy',
          });
        }
      }
      if (target?.origin === 'generated' && target.generation && options.resolveGeneration) {
        const availability = await options.resolveGeneration({ identity, target });
        if (availability.regenerate && options.regenerate) {
          descriptors.push({
            id: CANVAS_REGENERATE_ACTION_ID,
            ownerId: 'generation',
            label: options.labels?.regenerate ?? 'Regenerate',
            mediaKinds: MATERIAL_MEDIA_KINDS,
            origins: ['generated'],
            selection: { minimum: 1, maximum: 1 },
            effect: 'generate',
          });
        }
        if (availability.editAndGenerate && options.editAndGenerate) {
          descriptors.push({
            id: CANVAS_EDIT_AND_GENERATE_ACTION_ID,
            ownerId: 'generation',
            label: options.labels?.editAndGenerate ?? 'Edit and generate',
            mediaKinds: MATERIAL_MEDIA_KINDS,
            origins: ['generated'],
            selection: { minimum: 1, maximum: 1 },
            effect: 'generate',
          });
        }
      }
      return structuredClone(descriptors);
    },
    async execute({ identity, descriptor, action, targets }) {
      if (descriptor.id !== action.actionId) {
        throw new Error('Desktop Canvas material action descriptor does not match its intent.');
      }
      const target = requireSingleTarget(targets);
      if (action.actionId === CANVAS_PREVIEW_ACTION_ID && options.preview) {
        await options.preview({ identity, target });
        return {};
      }
      if (action.actionId === CANVAS_REVEAL_ACTION_ID && options.reveal) {
        await options.reveal({ identity, target });
        return {};
      }
      if (action.actionId === CANVAS_OPEN_IN_CUT_ACTION_ID && options.openInCut) {
        await options.openInCut({ identity, target });
        return {};
      }
      if (action.actionId === CANVAS_ADD_TO_CUT_ACTION_ID && options.addToCut) {
        await options.addToCut({
          identity,
          target,
          executionPayload: descriptor.executionPayload ?? {},
        });
        return {};
      }
      if (
        action.actionId === CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID &&
        options.copyToProjectMediaLibrary
      ) {
        await options.copyToProjectMediaLibrary({ identity, target });
        return {};
      }
      if (
        action.actionId === CANVAS_COPY_TO_GLOBAL_MEDIA_LIBRARY_ACTION_ID &&
        options.copyToGlobalMediaLibrary
      ) {
        await options.copyToGlobalMediaLibrary({ identity, target });
        return {};
      }
      if (action.actionId === CANVAS_REGENERATE_ACTION_ID && options.regenerate) {
        return {
          generationProjection: await options.regenerate({ identity, target }),
        };
      }
      if (action.actionId === CANVAS_EDIT_AND_GENERATE_ACTION_ID && options.editAndGenerate) {
        const generationProjection = await options.editAndGenerate({ identity, target });
        return generationProjection ? { generationProjection } : {};
      }
      throw new Error(`Desktop Canvas material action "${action.actionId}" has no active owner.`);
    },
  };
}

function requireSingleTarget(
  targets: readonly CanvasMaterialActionTarget[],
): CanvasMaterialActionTarget {
  if (targets.length !== 1) {
    throw new Error('Desktop Canvas material actions require exactly one authorized target.');
  }
  const target = targets[0];
  if (!target) {
    throw new Error('Desktop Canvas material action target is unavailable.');
  }
  return target;
}
