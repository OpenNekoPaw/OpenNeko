import { CANVAS_NODE_TYPES, type CanvasNodeType } from './canvas';
import type { ContainerPolicyName } from './canvas-layered';

export interface CanvasNodePresetMetadata {
  readonly name: string;
  readonly nodeType: CanvasNodeType;
  readonly composable?: true;
  readonly label: string;
  readonly description?: string;
  readonly containerPolicy?: ContainerPolicyName;
  readonly deriveTargets: readonly string[];
}

export const BUILT_IN_CANVAS_NODE_PRESETS = [
  {
    name: 'annotation.basic',
    nodeType: 'annotation',
    composable: true,
    label: 'Annotation Basic',
    deriveTargets: ['annotation.basic', 'text.basic'],
  },
  {
    name: 'text.basic',
    nodeType: 'text',
    composable: true,
    label: 'Text Basic',
    deriveTargets: ['text.basic', 'annotation.basic'],
  },
  {
    name: 'shot.basic',
    nodeType: 'shot',
    composable: true,
    label: 'Shot Basic',
    description: 'Composable storyboard shot with bound controls and generation preview.',
    deriveTargets: ['shot.basic', 'media.basic', 'gallery.basic', 'annotation.basic', 'text.basic'],
  },
  {
    name: 'scene.basic',
    nodeType: 'scene',
    composable: true,
    label: 'Scene Basic',
    description: 'Composable Scene container with metadata controls and child-node slot.',
    containerPolicy: 'scene',
    deriveTargets: [
      'scene.basic',
      'shot.basic',
      'media.basic',
      'gallery.basic',
      'annotation.basic',
      'text.basic',
    ],
  },
  {
    name: 'gallery.basic',
    nodeType: 'gallery',
    composable: true,
    label: 'Gallery Basic',
    description: 'Composable Gallery container for character image management with media children.',
    containerPolicy: 'gallery',
    deriveTargets: ['gallery.basic', 'shot.basic', 'media.basic', 'annotation.basic', 'text.basic'],
  },
  {
    name: 'media.basic',
    nodeType: 'media',
    composable: true,
    label: 'Media Basic',
    description: 'Composable Media asset card with lightweight preview capability.',
    deriveTargets: [
      'media.basic',
      'scene.basic',
      'shot.basic',
      'gallery.basic',
      'annotation.basic',
      'text.basic',
    ],
  },
  {
    name: 'project.basic',
    nodeType: 'project',
    composable: true,
    label: 'Project Basic',
    description: 'Composable project reference with thumbnail preview.',
    deriveTargets: ['project.basic', 'media.basic', 'annotation.basic', 'text.basic'],
  },
  {
    name: 'group.container',
    nodeType: 'group',
    label: 'Group',
    containerPolicy: 'group',
    deriveTargets: ['group.container', 'annotation.basic', 'text.basic'],
  },
  {
    name: 'artboard.container',
    nodeType: 'artboard',
    label: 'Artboard',
    containerPolicy: 'artboard',
    deriveTargets: ['artboard.container', 'annotation.basic', 'text.basic'],
  },
  {
    name: 'table.basic',
    nodeType: 'table',
    composable: true,
    label: 'Table',
    description: 'Table container with rows and columns for organizing mixed content.',
    containerPolicy: 'table',
    deriveTargets: ['table.basic', 'annotation.basic', 'text.basic', 'media.basic'],
  },
] as const satisfies readonly CanvasNodePresetMetadata[];

const CANVAS_NODE_PRESET_NAMES = BUILT_IN_CANVAS_NODE_PRESETS.map((preset) => preset.name);

export const CANVAS_AGENT_CREATE_NODE_TYPES = uniqueStrings(
  CANVAS_NODE_TYPES,
) as readonly CanvasNodeType[];

export const CANVAS_AGENT_NODE_PRESETS = CANVAS_NODE_PRESET_NAMES;

export const CANVAS_AGENT_DERIVE_TARGET_PRESETS = uniqueStrings(
  BUILT_IN_CANVAS_NODE_PRESETS.flatMap((preset) => preset.deriveTargets),
);

export const CANVAS_AGENT_CONTAINER_PRESETS = BUILT_IN_CANVAS_NODE_PRESETS.filter((preset) =>
  hasContainerPolicy(preset),
).map((preset) => preset.name);

export const CANVAS_AGENT_CHILD_PRESETS = CANVAS_NODE_PRESET_NAMES;

export function getBuiltInCanvasNodePresetMetadata(
  name: string | undefined,
): CanvasNodePresetMetadata | undefined {
  return name ? BUILT_IN_CANVAS_NODE_PRESETS.find((preset) => preset.name === name) : undefined;
}

export function getDefaultCanvasNodePresetName(nodeType: CanvasNodeType): string | undefined {
  return BUILT_IN_CANVAS_NODE_PRESETS.find((preset) => preset.nodeType === nodeType)?.name;
}

export function isBuiltInCanvasNodePresetName(name: string): boolean {
  return getBuiltInCanvasNodePresetMetadata(name) !== undefined;
}

function uniqueStrings<T extends string>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function hasContainerPolicy(preset: object): preset is { containerPolicy: ContainerPolicyName } {
  return 'containerPolicy' in preset;
}
