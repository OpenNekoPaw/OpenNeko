import type {
  CanvasHostRuntimeIdentity,
  CanvasGenerationProjectionSnapshot,
  CanvasMaterialActionTarget,
} from '@neko-canvas/domain';
import type {
  CanvasMaterialActionDescriptor,
  CanvasMaterialActionIntent,
  CanvasMaterialMediaKind,
} from '@neko/shared';

const MATERIAL_MEDIA_KINDS: readonly CanvasMaterialMediaKind[] = [
  'image',
  'video',
  'audio',
  'document',
  'model',
  'other',
];

export const DESKTOP_CANVAS_PREVIEW_ACTION_ID = 'preview:open';
export const DESKTOP_CANVAS_REVEAL_ACTION_ID = 'desktop:reveal';
export const DESKTOP_CANVAS_OPEN_IN_CUT_ACTION_ID = 'cut:open';
export const DESKTOP_CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID =
  'media-library:copy-to-project';
export const DESKTOP_CANVAS_COPY_TO_GLOBAL_MEDIA_LIBRARY_ACTION_ID =
  'media-library:copy-to-global';
export const DESKTOP_CANVAS_REGENERATE_ACTION_ID = 'generation:regenerate';
const DESKTOP_CANVAS_EDIT_AND_GENERATE_ACTION_ID = 'generation:edit-and-generate';

export interface DesktopCanvasMaterialActionExecutionResult {
  readonly generationProjection?: CanvasGenerationProjectionSnapshot;
}

export interface DesktopCanvasGenerationActionAvailability {
  readonly regenerate: boolean;
  readonly editAndGenerate: boolean;
}

export interface DesktopCanvasMaterialActionOwner {
  resolve(input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly targets: readonly CanvasMaterialActionTarget[];
  }): Promise<readonly CanvasMaterialActionDescriptor[]>;
  execute(input: {
    readonly identity: CanvasHostRuntimeIdentity;
    readonly descriptor: CanvasMaterialActionDescriptor;
    readonly action: CanvasMaterialActionIntent;
    readonly targets: readonly CanvasMaterialActionTarget[];
  }): Promise<DesktopCanvasMaterialActionExecutionResult>;
}

/**
 * Adapts Desktop capability owners to Canvas descriptors without importing
 * Preview or shell implementations into the Canvas package.
 */
export function createDesktopCanvasMaterialActionOwner(options: {
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
  }) => Promise<DesktopCanvasGenerationActionAvailability>;
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
    readonly copyToProjectMediaLibrary?: string;
    readonly copyToGlobalMediaLibrary?: string;
    readonly regenerate?: string;
    readonly editAndGenerate?: string;
  };
}): DesktopCanvasMaterialActionOwner {
  const baseDescriptors: CanvasMaterialActionDescriptor[] = [];
  if (options.preview) {
    baseDescriptors.push({
      id: DESKTOP_CANVAS_PREVIEW_ACTION_ID,
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
      id: DESKTOP_CANVAS_REVEAL_ACTION_ID,
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
          id: DESKTOP_CANVAS_OPEN_IN_CUT_ACTION_ID,
          ownerId: 'cut',
          label: options.labels?.openInCut ?? 'Open in Cut',
          mediaKinds: ['document', 'other'],
          origins: ['referenced'],
          selection: { minimum: 1, maximum: 1 },
          effect: 'handoff',
        });
      }
      if (target && options.resolveMediaLibraryCopy) {
        const availability = await options.resolveMediaLibraryCopy({ identity, target });
        if (availability.projectLinked && options.copyToProjectMediaLibrary) {
          descriptors.push({
            id: DESKTOP_CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID,
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
            id: DESKTOP_CANVAS_COPY_TO_GLOBAL_MEDIA_LIBRARY_ACTION_ID,
            ownerId: 'media-library',
            label: options.labels?.copyToGlobalMediaLibrary ?? 'Copy to global Media Library',
            mediaKinds: MATERIAL_MEDIA_KINDS,
            origins: ['referenced', 'generated'],
            selection: { minimum: 1, maximum: 1 },
            effect: 'copy',
          });
        }
      }
      if (
        target?.origin === 'generated' &&
        target.generation &&
        options.resolveGeneration
      ) {
        const availability = await options.resolveGeneration({ identity, target });
        if (availability.regenerate && options.regenerate) {
          descriptors.push({
            id: DESKTOP_CANVAS_REGENERATE_ACTION_ID,
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
            id: DESKTOP_CANVAS_EDIT_AND_GENERATE_ACTION_ID,
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
      if (action.actionId === DESKTOP_CANVAS_PREVIEW_ACTION_ID && options.preview) {
        await options.preview({ identity, target });
        return {};
      }
      if (action.actionId === DESKTOP_CANVAS_REVEAL_ACTION_ID && options.reveal) {
        await options.reveal({ identity, target });
        return {};
      }
      if (action.actionId === DESKTOP_CANVAS_OPEN_IN_CUT_ACTION_ID && options.openInCut) {
        await options.openInCut({ identity, target });
        return {};
      }
      if (
        action.actionId === DESKTOP_CANVAS_COPY_TO_PROJECT_MEDIA_LIBRARY_ACTION_ID &&
        options.copyToProjectMediaLibrary
      ) {
        await options.copyToProjectMediaLibrary({ identity, target });
        return {};
      }
      if (
        action.actionId === DESKTOP_CANVAS_COPY_TO_GLOBAL_MEDIA_LIBRARY_ACTION_ID &&
        options.copyToGlobalMediaLibrary
      ) {
        await options.copyToGlobalMediaLibrary({ identity, target });
        return {};
      }
      if (
        action.actionId === DESKTOP_CANVAS_REGENERATE_ACTION_ID &&
        options.regenerate
      ) {
        return {
          generationProjection: await options.regenerate({ identity, target }),
        };
      }
      if (
        action.actionId === DESKTOP_CANVAS_EDIT_AND_GENERATE_ACTION_ID &&
        options.editAndGenerate
      ) {
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
