/**
 * Canvas Timeline Sync Types
 *
 * Defines the minimal fields that timeline tools are allowed to flow back into canvas nodes.
 * Canvas remains the semantic storyboard source; neko-cut may only sync operational metadata.
 */

export type CanvasTimelineSyncSource = 'neko-cut';

export type CanvasTimelineSyncReason = 'storyboard-import' | 'timeline-selection' | 'render-output';

export interface CanvasTimelineShotSync {
  /** Target ShotNode id on the canvas */
  shotId: string;
  /** Timeline project name that produced the sync event */
  projectName?: string;
  /** Timestamp when the shot was imported or updated in timeline */
  importedAt?: number;
  /** Optional future backflow fields kept explicit by contract */
  duration?: number;
  videoThumbnailPath?: string;
  selectedInTimeline?: boolean;
}

export interface CanvasTimelineSyncPayload {
  source: CanvasTimelineSyncSource;
  reason: CanvasTimelineSyncReason;
  shots: readonly CanvasTimelineShotSync[];
}
