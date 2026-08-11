import {
  optionalString,
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireIsoDate,
  requireOneOf,
  requireString,
  requireUniqueIdentities,
} from './codec';

export const STORYLINE_NODE_SPOILER_VISIBILITIES = ['visible', 'hidden'] as const;

export type StorylineNodeSpoilerVisibility = (typeof STORYLINE_NODE_SPOILER_VISIBILITIES)[number];

export interface CharacterStoryline {
  readonly characterStorylineId: string;
  readonly characterProjectId: string;
  readonly displayName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StorylineNodeNarrativeContext {
  readonly situation: string;
  readonly time?: string;
  readonly location?: string;
  readonly characterState?: string;
  readonly relationshipState?: string;
  readonly allowedStoryFacts: readonly string[];
  readonly forbiddenStoryFacts: readonly string[];
  readonly narrativeMemories: readonly string[];
  readonly knowledgeBoundary: readonly string[];
  readonly behaviorConstraints: readonly string[];
  readonly expressionConstraints: readonly string[];
  readonly authorOnlyNotes: readonly string[];
}

export interface StorylineNode {
  readonly storylineNodeId: string;
  readonly title: string;
  readonly spoilerVisibility: StorylineNodeSpoilerVisibility;
  readonly context: StorylineNodeNarrativeContext;
}

export interface StorylineEdge {
  readonly fromStorylineNodeId: string;
  readonly toStorylineNodeId: string;
  readonly label?: string;
}

export interface CharacterStorylineDraft {
  readonly characterStorylineId: string;
  readonly characterVersionId: string;
  readonly premise: string;
  readonly constraints: readonly string[];
  readonly nodeOrder: readonly string[];
  readonly nodes: readonly StorylineNode[];
  readonly edges: readonly StorylineEdge[];
  readonly updatedAt: string;
}

export interface CharacterStorylineVersion {
  readonly characterStorylineVersionId: string;
  readonly characterStorylineId: string;
  readonly characterVersionId: string;
  readonly label: string;
  readonly premise: string;
  readonly constraints: readonly string[];
  readonly nodeOrder: readonly string[];
  readonly nodes: readonly StorylineNode[];
  readonly edges: readonly StorylineEdge[];
  readonly publishedAt: string;
}

export interface CharacterStorylineVersionRef {
  readonly characterStorylineId: string;
  readonly characterStorylineVersionId: string;
  readonly characterVersionId: string;
}

export function parseCharacterStoryline(value: unknown): CharacterStoryline {
  const record = requireExactRecord(
    value,
    ['characterStorylineId', 'characterProjectId', 'displayName', 'createdAt', 'updatedAt'],
    'CharacterStoryline',
  );
  return {
    characterStorylineId: requireIdentity(
      record['characterStorylineId'],
      'CharacterStoryline identity',
    ),
    characterProjectId: requireIdentity(
      record['characterProjectId'],
      'CharacterStoryline CharacterProject identity',
    ),
    displayName: requireIdentity(record['displayName'], 'CharacterStoryline displayName'),
    createdAt: requireIsoDate(record['createdAt'], 'CharacterStoryline createdAt'),
    updatedAt: requireIsoDate(record['updatedAt'], 'CharacterStoryline updatedAt'),
  };
}

export function parseCharacterStorylineDraft(value: unknown): CharacterStorylineDraft {
  const record = requireExactRecord(
    value,
    [
      'characterStorylineId',
      'characterVersionId',
      'premise',
      'constraints',
      'nodeOrder',
      'nodes',
      'edges',
      'updatedAt',
    ],
    'CharacterStorylineDraft',
  );
  return parseStorylineContent(record, {
    characterStorylineId: requireIdentity(
      record['characterStorylineId'],
      'CharacterStorylineDraft Storyline identity',
    ),
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'CharacterStorylineDraft CharacterVersion identity',
    ),
    updatedAt: requireIsoDate(record['updatedAt'], 'CharacterStorylineDraft updatedAt'),
  });
}

export function parseCharacterStorylineVersion(value: unknown): CharacterStorylineVersion {
  const record = requireExactRecord(
    value,
    [
      'characterStorylineVersionId',
      'characterStorylineId',
      'characterVersionId',
      'label',
      'premise',
      'constraints',
      'nodeOrder',
      'nodes',
      'edges',
      'publishedAt',
    ],
    'CharacterStorylineVersion',
  );
  return parseStorylineContent(record, {
    characterStorylineVersionId: requireIdentity(
      record['characterStorylineVersionId'],
      'CharacterStorylineVersion identity',
    ),
    characterStorylineId: requireIdentity(
      record['characterStorylineId'],
      'CharacterStorylineVersion Storyline identity',
    ),
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'CharacterStorylineVersion CharacterVersion identity',
    ),
    label: requireIdentity(record['label'], 'CharacterStorylineVersion label'),
    publishedAt: requireIsoDate(record['publishedAt'], 'CharacterStorylineVersion publishedAt'),
  });
}

export function parseCharacterStorylineVersionRef(value: unknown): CharacterStorylineVersionRef {
  const record = requireExactRecord(
    value,
    ['characterStorylineId', 'characterStorylineVersionId', 'characterVersionId'],
    'CharacterStorylineVersionRef',
  );
  return {
    characterStorylineId: requireIdentity(
      record['characterStorylineId'],
      'CharacterStorylineVersionRef Storyline identity',
    ),
    characterStorylineVersionId: requireIdentity(
      record['characterStorylineVersionId'],
      'CharacterStorylineVersionRef identity',
    ),
    characterVersionId: requireIdentity(
      record['characterVersionId'],
      'CharacterStorylineVersionRef CharacterVersion identity',
    ),
  };
}

export function parseStorylineNode(value: unknown): StorylineNode {
  const record = requireExactRecord(
    value,
    ['storylineNodeId', 'title', 'spoilerVisibility', 'context'],
    'StorylineNode',
  );
  return {
    storylineNodeId: requireIdentity(record['storylineNodeId'], 'StorylineNode identity'),
    title: requireIdentity(record['title'], 'StorylineNode title'),
    spoilerVisibility: requireOneOf(
      record['spoilerVisibility'],
      STORYLINE_NODE_SPOILER_VISIBILITIES,
      'StorylineNode spoiler visibility',
    ),
    context: parseStorylineNodeNarrativeContext(record['context']),
  };
}

export function parseStorylineNodeNarrativeContext(value: unknown): StorylineNodeNarrativeContext {
  const record = requireExactRecord(
    value,
    [
      'situation',
      'time',
      'location',
      'characterState',
      'relationshipState',
      'allowedStoryFacts',
      'forbiddenStoryFacts',
      'narrativeMemories',
      'knowledgeBoundary',
      'behaviorConstraints',
      'expressionConstraints',
      'authorOnlyNotes',
    ],
    'StorylineNode narrative context',
  );
  const time = optionalString(record['time'], 'StorylineNode time');
  const location = optionalString(record['location'], 'StorylineNode location');
  const characterState = optionalString(record['characterState'], 'StorylineNode Character state');
  const relationshipState = optionalString(
    record['relationshipState'],
    'StorylineNode relationship state',
  );
  const allowedStoryFacts = requireUniqueStringArray(
    record['allowedStoryFacts'],
    'StorylineNode allowed story facts',
  );
  const forbiddenStoryFacts = requireUniqueStringArray(
    record['forbiddenStoryFacts'],
    'StorylineNode forbidden story facts',
  );
  const forbidden = new Set(forbiddenStoryFacts);
  const conflictingFact = allowedStoryFacts.find((fact) => forbidden.has(fact));
  if (conflictingFact !== undefined) {
    throw new Error(
      `StorylineNode narrative context cannot both allow and forbid '${conflictingFact}'.`,
    );
  }
  return {
    situation: requireIdentity(record['situation'], 'StorylineNode situation'),
    ...(time === undefined ? {} : { time }),
    ...(location === undefined ? {} : { location }),
    ...(characterState === undefined ? {} : { characterState }),
    ...(relationshipState === undefined ? {} : { relationshipState }),
    allowedStoryFacts,
    forbiddenStoryFacts,
    narrativeMemories: requireUniqueStringArray(
      record['narrativeMemories'],
      'StorylineNode narrative memories',
    ),
    knowledgeBoundary: requireUniqueStringArray(
      record['knowledgeBoundary'],
      'StorylineNode knowledge boundary',
    ),
    behaviorConstraints: requireUniqueStringArray(
      record['behaviorConstraints'],
      'StorylineNode behavior constraints',
    ),
    expressionConstraints: requireUniqueStringArray(
      record['expressionConstraints'],
      'StorylineNode expression constraints',
    ),
    authorOnlyNotes: requireUniqueStringArray(
      record['authorOnlyNotes'],
      'StorylineNode author-only notes',
    ),
  };
}

function parseStorylineContent<T extends Readonly<Record<string, unknown>>>(
  record: Readonly<Record<string, unknown>>,
  identity: T,
): T & {
  readonly premise: string;
  readonly constraints: readonly string[];
  readonly nodeOrder: readonly string[];
  readonly nodes: readonly StorylineNode[];
  readonly edges: readonly StorylineEdge[];
} {
  const nodes = requireUniqueIdentities(
    requireArray(record['nodes'], parseStorylineNode, 'Storyline nodes'),
    (node) => node.storylineNodeId,
    'Storyline nodes',
  );
  if (nodes.length === 0) throw new Error('Storyline requires at least one node.');
  const nodeIds = new Set(nodes.map((node) => node.storylineNodeId));
  const nodeOrder = requireUniqueStringArray(record['nodeOrder'], 'Storyline node order');
  if (
    nodeOrder.length !== nodes.length ||
    nodeOrder.some((storylineNodeId) => !nodeIds.has(storylineNodeId))
  ) {
    throw new Error('Storyline node order must contain every exact StorylineNode once.');
  }
  const orderById = new Map(nodeOrder.map((storylineNodeId, index) => [storylineNodeId, index]));
  const edges = requireUniqueIdentities(
    requireArray(record['edges'], parseStorylineEdge, 'Storyline edges'),
    (edge) => `${edge.fromStorylineNodeId}\u0000${edge.toStorylineNodeId}`,
    'Storyline edges',
  );
  for (const edge of edges) {
    const fromIndex = orderById.get(edge.fromStorylineNodeId);
    const toIndex = orderById.get(edge.toStorylineNodeId);
    if (fromIndex === undefined || toIndex === undefined) {
      throw new Error('Storyline edge references an unknown StorylineNode.');
    }
    if (fromIndex >= toIndex) {
      throw new Error('Storyline edge must follow the authored node order.');
    }
  }
  return {
    ...identity,
    premise: requireString(record['premise'], 'Storyline premise'),
    constraints: requireUniqueStringArray(record['constraints'], 'Storyline constraints'),
    nodeOrder,
    nodes,
    edges,
  };
}

function parseStorylineEdge(value: unknown): StorylineEdge {
  const record = requireExactRecord(
    value,
    ['fromStorylineNodeId', 'toStorylineNodeId', 'label'],
    'StorylineEdge',
  );
  const label = optionalString(record['label'], 'StorylineEdge label');
  return {
    fromStorylineNodeId: requireIdentity(
      record['fromStorylineNodeId'],
      'StorylineEdge source node',
    ),
    toStorylineNodeId: requireIdentity(record['toStorylineNodeId'], 'StorylineEdge target node'),
    ...(label === undefined ? {} : { label }),
  };
}

function requireUniqueStringArray(value: unknown, label: string): readonly string[] {
  return requireUniqueIdentities(
    requireArray(value, (item) => requireIdentity(item, label), label),
    (item) => item,
    label,
  );
}
