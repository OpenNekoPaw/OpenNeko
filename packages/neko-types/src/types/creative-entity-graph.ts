// =============================================================================
// Creative Entity Graph — Cross-modal relationship graph types (ADR Phase 3)
//
// Defines the graph node, edge, and snapshot types for the CreativeEntityGraph
// layer that tracks relationships between creative entities (characters, scenes,
// objects) and their occurrences across script, canvas, assets, and generated
// media.
//
// Registry decides "identity"; Graph decides "connections"; OccurrenceIndex
// decides "where it appears". See adr-character-unified-index.md §3.2, §4.5-4.6.
// =============================================================================

// -- Graph Node --

export type CreativeGraphNodeKind =
  | 'entity'
  | 'occurrence'
  | 'asset'
  | 'canvas-node'
  | 'script-range'
  | 'generated-asset';

export interface CreativeGraphNode {
  readonly id: string;
  readonly kind: CreativeGraphNodeKind;
  /** Reference ID pointing to the backing object (e.g. CharacterRecord.id, AssetEntity.id) */
  readonly refId?: string;
  readonly label?: string;
}

// -- Relation Edge --

export type CreativeRelationEdgeType =
  | 'alias-of'
  | 'bound-to-representation'
  | 'depicts-character'
  | 'depicts-object'
  | 'set-in-scene'
  | 'appears-in-scene'
  | 'appears-in-shot'
  | 'references-entity'
  | 'performs-action'
  | 'uses-object'
  | 'voices-character'
  | 'generated-from'
  | 'derived-from'
  | 'default-visual-for';

export type CreativeRelationStrength = 'confirmed' | 'inferred';

export type CreativeRelationProvenance = 'user' | 'lineage' | 'rule' | 'ai' | 'import';

export interface CreativeRelationEdge {
  readonly from: string;
  readonly to: string;
  readonly type: CreativeRelationEdgeType;
  readonly strength: CreativeRelationStrength;
  readonly confidence?: number;
  readonly provenance?: CreativeRelationProvenance;
}

// -- Occurrence Locator --

export type OccurrenceSource =
  | 'registry'
  | 'script'
  | 'canvas-node'
  | 'asset-entity'
  | 'generated-asset';

export interface OccurrenceLocator {
  readonly uri?: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly nodeId?: string;
  readonly elementId?: string;
}

export interface OccurrenceIndexEntry {
  readonly entityKind: string;
  readonly entityId: string;
  readonly source: OccurrenceSource;
  readonly sourceId: string;
  readonly label: string;
  readonly locator: OccurrenceLocator;
  readonly strength: CreativeRelationStrength;
  readonly detail?: string;
}

// -- Serializable Snapshot --

export interface CreativeEntityGraphSnapshot {
  readonly version: 1;
  readonly nodes: readonly CreativeGraphNode[];
  readonly edges: readonly CreativeRelationEdge[];
}
