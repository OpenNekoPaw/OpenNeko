// =============================================================================
// Geometry Types (基础几何类型)
// =============================================================================

/** 2D point */
export interface Point2D {
  x: number;
  y: number;
}

/** Bezier control point with handles */
export interface BezierPoint {
  anchor: Point2D;
  /** In handle (relative to anchor) */
  handleIn: Point2D;
  /** Out handle (relative to anchor) */
  handleOut: Point2D;
  /** Whether handles are linked (move together) */
  linkedHandles: boolean;
}
