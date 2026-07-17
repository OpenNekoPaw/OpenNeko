/**
 * Minimal node shape required by narrative graph analysis.
 *
 * Full Canvas nodes are structurally assignable to this contract, but narrative
 * traversal/validation does not need to import the full Canvas document model.
 */
export interface CanvasNarrativeNodeLike {
  readonly id: string;
  readonly type: string;
  readonly data: unknown;
}

/**
 * Minimal connection shape required by narrative graph analysis.
 */
export interface CanvasNarrativeConnectionLike {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly type?: string;
  readonly label?: string;
  readonly choiceText?: string;
  readonly condition?: string;
  readonly priority?: number;
}
