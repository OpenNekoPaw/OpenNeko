import type { CanvasSubsystemId, RegisteredCanvasNodeType } from '@neko/shared';
import type {
  NodeTypeDescriptor,
  NodeTypeDescriptorRegistry,
} from '../components/nodes/nodeTypeDescriptor';

export type PlaceholderSubsystemId = Exclude<CanvasSubsystemId, 'storyboard' | 'narrative'>;

interface PlaceholderNodeDefinition {
  readonly type: RegisteredCanvasNodeType;
  readonly labelKey: string;
  readonly icon: string;
  readonly tagLabel: string;
  readonly tagColor: string;
  readonly defaultSize: NodeTypeDescriptor['defaultSize'];
  readonly titleKeys: readonly string[];
  readonly detailKeys: readonly string[];
}

const PLACEHOLDER_NODE_DEFINITIONS: Record<
  PlaceholderSubsystemId,
  readonly PlaceholderNodeDefinition[]
> = {
  behavior: [
    definition('state', 'node.state', 'S', 'STATE', '#2563eb', ['name', 'label'], ['description']),
    definition(
      'trigger',
      'node.trigger',
      'T',
      'TRIGGER',
      '#f59e0b',
      ['event', 'name', 'label'],
      ['description'],
    ),
    definition(
      'action',
      'node.action',
      'A',
      'ACTION',
      '#ef4444',
      ['name', 'label'],
      ['description'],
    ),
    definition(
      'condition',
      'node.condition',
      'C',
      'COND',
      '#8b5cf6',
      ['expression', 'name'],
      ['description'],
    ),
    definition(
      'composite',
      'node.composite',
      'C',
      'COMP',
      '#64748b',
      ['name', 'label'],
      ['description'],
    ),
  ],
  entity: [
    definition(
      'entity',
      'node.entity',
      'E',
      'ENTITY',
      '#0f766e',
      ['displayName', 'name'],
      ['entityType', 'description'],
    ),
    definition(
      'representation-slot',
      'node.representationSlot',
      'R',
      'SLOT',
      '#14b8a6',
      ['label', 'role'],
      ['description'],
    ),
    definition(
      'occurrence',
      'node.occurrence',
      'O',
      'OCCUR',
      '#06b6d4',
      ['label', 'source'],
      ['locator', 'description'],
    ),
    definition(
      'generated-asset',
      'node.generatedAsset',
      'G',
      'ASSET',
      '#a855f7',
      ['label', 'assetId'],
      ['description'],
    ),
  ],
  memory: [
    definition(
      'memory',
      'node.memory',
      'M',
      'MEMORY',
      '#7c3aed',
      ['title', 'name'],
      ['content', 'description'],
    ),
    definition(
      'conversation',
      'node.conversation',
      'C',
      'CONVO',
      '#db2777',
      ['title', 'name'],
      ['summary', 'description'],
    ),
    definition(
      'fact',
      'node.fact',
      'F',
      'FACT',
      '#16a34a',
      ['statement', 'title'],
      ['source', 'description'],
    ),
  ],
};

export function createPlaceholderNodeTypeDescriptors(
  subsystemId: PlaceholderSubsystemId,
): NodeTypeDescriptorRegistry {
  return Object.fromEntries(
    PLACEHOLDER_NODE_DEFINITIONS[subsystemId].map((item) => [
      item.type,
      {
        type: item.type,
        labelKey: item.labelKey,
        icon: item.icon,
        tagLabel: item.tagLabel,
        tagColor: item.tagColor,
        defaultSize: item.defaultSize,
        presentation: 'structured',
      } satisfies NodeTypeDescriptor,
    ]),
  ) as NodeTypeDescriptorRegistry;
}

export function getPlaceholderNodeDefinitions(
  subsystemId: PlaceholderSubsystemId,
): readonly PlaceholderNodeDefinition[] {
  return PLACEHOLDER_NODE_DEFINITIONS[subsystemId];
}

export function getPlaceholderNodeDefinition(type: string): PlaceholderNodeDefinition | undefined {
  return Object.values(PLACEHOLDER_NODE_DEFINITIONS)
    .flat()
    .find((definition) => definition.type === type);
}

function definition(
  type: RegisteredCanvasNodeType,
  labelKey: string,
  icon: string,
  tagLabel: string,
  tagColor: string,
  titleKeys: readonly string[],
  detailKeys: readonly string[],
): PlaceholderNodeDefinition {
  return {
    type,
    labelKey,
    icon,
    tagLabel,
    tagColor,
    defaultSize: { width: 220, height: 140 },
    titleKeys,
    detailKeys,
  };
}
