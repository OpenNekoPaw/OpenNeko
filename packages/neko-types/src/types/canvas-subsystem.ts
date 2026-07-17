import {
  type CanvasData,
  type CanvasNodeType,
  type CanvasSerializableRecord,
  type CanvasSerializableValue,
} from './canvas';
import type { ConnectionType } from './canvas';

export type CanvasSubsystemId = 'storyboard' | 'narrative' | 'behavior' | 'entity' | 'memory';

export type CanvasConnectionRuleId =
  | 'port-data-type'
  | 'narrative-choice-target'
  | 'behavior-transition-target'
  | 'memory-association-weight';

export interface CanvasConnectionRuleDescriptor {
  readonly id: CanvasConnectionRuleId;
  readonly options?: CanvasSerializableRecord;
}

export type CanvasAutoArrangeStrategyId = 'flow' | 'tree' | 'grid' | 'cluster';

export interface CanvasSubsystemAgentToolDef {
  readonly name: string;
  readonly description: string;
  readonly parameters: CanvasSerializableRecord;
}

export interface CanvasSubsystemMetadataDescriptor {
  readonly key: string;
  readonly defaultValue: CanvasSerializableValue;
}

export interface CanvasSubsystemManifest {
  readonly id: CanvasSubsystemId;
  readonly label: string;
  readonly triggerNodeTypes: readonly CanvasNodeType[];
  readonly connectionTypes?: readonly ConnectionType[];
  readonly connectionRules?: readonly CanvasConnectionRuleDescriptor[];
  readonly autoArrangeStrategy?: CanvasAutoArrangeStrategyId;
  readonly agentTools?: readonly CanvasSubsystemAgentToolDef[];
  readonly metadata?: CanvasSubsystemMetadataDescriptor;
}

export interface CanvasSubsystemSummary {
  readonly nodeTypeSummary: Readonly<Record<string, number>>;
  readonly activeSubsystems: readonly CanvasSubsystemId[];
}

export const BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS = [
  {
    id: 'storyboard',
    label: 'Storyboard',
    triggerNodeTypes: [
      'storyboard',
      'shot',
      'scene',
      'gallery',
      'table',
      'script',
      'document',
      'model',
      'canvas-embed',
      'project',
    ],
    connectionTypes: ['default', 'sequence', 'reference'],
    connectionRules: [{ id: 'port-data-type' }],
    autoArrangeStrategy: 'grid',
  },
  {
    id: 'narrative',
    label: 'Narrative',
    triggerNodeTypes: [
      'narrative-start',
      'choice',
      'merge',
      'narrative-scene',
      'narrative-note',
      'narrative-ending',
    ],
    connectionTypes: ['choice'],
    connectionRules: [{ id: 'narrative-choice-target' }],
    autoArrangeStrategy: 'flow',
    metadata: {
      key: 'narrative',
      defaultValue: {
        variables: [],
        genre: 'illustrated-text',
      },
    },
  },
  {
    id: 'behavior',
    label: 'Behavior',
    triggerNodeTypes: ['state', 'trigger', 'action', 'condition', 'composite'],
    connectionTypes: ['transition', 'child'],
    connectionRules: [{ id: 'behavior-transition-target' }],
    autoArrangeStrategy: 'tree',
    metadata: {
      key: 'behavior',
      defaultValue: {
        blackboard: [],
      },
    },
  },
  {
    id: 'entity',
    label: 'Entity',
    triggerNodeTypes: ['entity', 'representation-slot', 'occurrence', 'generated-asset'],
    connectionTypes: ['association'],
    autoArrangeStrategy: 'cluster',
    metadata: {
      key: 'entityGraph',
      defaultValue: {
        entityScope: [],
        bindingSource: '',
      },
    },
  },
  {
    id: 'memory',
    label: 'Memory',
    triggerNodeTypes: ['memory', 'conversation', 'fact'],
    connectionTypes: ['association', 'derived-from'],
    connectionRules: [{ id: 'memory-association-weight' }],
    autoArrangeStrategy: 'cluster',
    metadata: {
      key: 'memoryGraph',
      defaultValue: {},
    },
  },
] as const satisfies readonly CanvasSubsystemManifest[];

export type CanvasSubsystemMetadataKey = NonNullable<CanvasSubsystemManifest['metadata']>['key'];

export function createBuiltInCanvasSubsystemManifestRegistry(): ReadonlyMap<
  CanvasSubsystemId,
  CanvasSubsystemManifest
> {
  return new Map(BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS.map((manifest) => [manifest.id, manifest]));
}

export function getBuiltInCanvasSubsystemManifest(
  id: CanvasSubsystemId,
): CanvasSubsystemManifest | undefined {
  return BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS.find((manifest) => manifest.id === id);
}

export function summarizeCanvasSubsystems(
  canvas: Pick<CanvasData, 'nodes'>,
  manifests: readonly CanvasSubsystemManifest[] = BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS,
): CanvasSubsystemSummary {
  const nodeTypeSummary: Record<string, number> = {};

  for (const node of canvas.nodes) {
    nodeTypeSummary[node.type] = (nodeTypeSummary[node.type] ?? 0) + 1;
  }

  const activeSubsystems = manifests
    .filter((manifest) =>
      manifest.triggerNodeTypes.some((type) => (nodeTypeSummary[type] ?? 0) > 0),
    )
    .map((manifest) => manifest.id);

  return {
    nodeTypeSummary,
    activeSubsystems,
  };
}

export function getCanvasActiveSubsystems(
  canvas: Pick<CanvasData, 'nodes'>,
  manifests: readonly CanvasSubsystemManifest[] = BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS,
): readonly CanvasSubsystemId[] {
  return summarizeCanvasSubsystems(canvas, manifests).activeSubsystems;
}

export function applyCanvasSubsystemMetadataDefaults<TCanvas extends CanvasData>(
  canvas: TCanvas,
  activeSubsystems: readonly CanvasSubsystemId[] = getCanvasActiveSubsystems(canvas),
  manifests: readonly CanvasSubsystemManifest[] = BUILT_IN_CANVAS_SUBSYSTEM_MANIFESTS,
): TCanvas {
  let nextCanvas: TCanvas = canvas;

  for (const subsystemId of activeSubsystems) {
    const manifest = manifests.find((candidate) => candidate.id === subsystemId);
    const metadata = manifest?.metadata;
    if (!metadata || nextCanvas[metadata.key as keyof CanvasData] !== undefined) {
      continue;
    }

    nextCanvas = {
      ...nextCanvas,
      [metadata.key]: cloneSerializableValue(metadata.defaultValue),
    };
  }

  return nextCanvas;
}

function cloneSerializableValue<T extends CanvasSerializableValue>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
