import type { AgentObservationModality } from './agent-observation';

/**
 * Agent-first multimodal context contracts.
 *
 * UI context identifies what the user is pointing at. Project and artifact
 * references identify the authoritative state and reproducible content inputs.
 * The Agent owns the final observation and rationale.
 */

export type MultimodalPanelKind =
  'timeline' | 'canvas' | 'model-2d' | 'model-3d' | 'xr' | 'asset-browser' | 'unknown';

export type SelectionKind =
  | 'timeline-clip'
  | 'timeline-range'
  | 'canvas-node'
  | 'scene-node'
  | 'animation-track'
  | 'camera-shot'
  | 'asset'
  | 'xr-target'
  | 'unknown';

export type ArtifactKind =
  | 'generated-asset'
  | 'image'
  | 'video'
  | 'audio'
  | 'mesh'
  | 'texture'
  | 'motion'
  | 'camera-path'
  | 'metadata'
  | 'unknown';

export type ProjectObjectKind =
  | 'timeline-clip'
  | 'timeline-track'
  | 'canvas-node'
  | 'scene-node'
  | 'rig'
  | 'animation-track'
  | 'camera'
  | 'shot'
  | 'asset-record'
  | 'unknown';

export type PerceptionInputKind =
  | 'image-file'
  | 'video-frame'
  | 'video-segment'
  | 'audio-segment'
  | 'canvas-crop'
  | 'viewport-snapshot'
  | 'model-snapshot'
  | 'motion-segment'
  | 'structured-data';

export interface TimelineContextSnapshot {
  readonly playheadMs?: number;
  readonly rangeStartMs?: number;
  readonly rangeEndMs?: number;
  readonly activeTrackId?: string;
}

export interface ViewportContextSnapshot {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly zoom?: number;
  readonly cameraId?: string;
}

export interface SelectionRef {
  readonly id: string;
  readonly kind: SelectionKind;
  readonly panel: MultimodalPanelKind;
  readonly projectObjectId?: string;
  readonly artifactId?: string;
  readonly timeMs?: number;
  readonly rangeStartMs?: number;
  readonly rangeEndMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ArtifactRef {
  readonly id: string;
  readonly kind: ArtifactKind;
  readonly uri: string;
  readonly mimeType?: string;
  readonly generatedAssetId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ProjectObjectRef {
  readonly id: string;
  readonly kind: ProjectObjectKind;
  readonly engineObjectId?: string;
  readonly artifactIds: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface PerceptionInputRef {
  readonly id: string;
  readonly kind: PerceptionInputKind;
  readonly modality: AgentObservationModality;
  readonly sourceSelectionId?: string;
  readonly artifactId?: string;
  readonly projectObjectId?: string;
  readonly uri?: string;
  readonly timeMs?: number;
  readonly rangeStartMs?: number;
  readonly rangeEndMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface UIContextSnapshot {
  readonly activePanel: MultimodalPanelKind;
  readonly selectionIds: readonly string[];
  readonly timeline?: TimelineContextSnapshot;
  readonly viewport?: ViewportContextSnapshot;
  readonly userAnnotation?: string;
}

export interface MultimodalContextPacket {
  readonly id: string;
  readonly selection: readonly SelectionRef[];
  readonly artifactRefs: readonly ArtifactRef[];
  readonly projectRefs: readonly ProjectObjectRef[];
  readonly perceptionInputs: readonly PerceptionInputRef[];
  readonly uiContext: UIContextSnapshot;
  readonly createdAt: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface UIContextProvider {
  getActivePanel(): MultimodalPanelKind;
  getSelection(): readonly SelectionRef[];
  getTimelineState(): TimelineContextSnapshot | null;
  getViewportState(): ViewportContextSnapshot | null;
}

export interface ProjectStateProvider {
  resolveSelection(selection: SelectionRef): ProjectObjectRef | null;
}

export interface PerceptionInputResolver {
  resolveInputs(packet: MultimodalContextPacket): readonly PerceptionInputRef[];
}

export function hasSelectionRef(packet: MultimodalContextPacket, selectionId: string): boolean {
  return packet.selection.some((selection) => selection.id === selectionId);
}

export function isPerceptionInputTraceable(
  packet: MultimodalContextPacket,
  input: PerceptionInputRef,
): boolean {
  const hasSelection =
    input.sourceSelectionId === undefined || hasSelectionRef(packet, input.sourceSelectionId);
  const hasArtifact =
    input.artifactId === undefined ||
    packet.artifactRefs.some((artifact) => artifact.id === input.artifactId);
  const hasProjectObject =
    input.projectObjectId === undefined ||
    packet.projectRefs.some((projectObject) => projectObject.id === input.projectObjectId);

  return hasSelection && hasArtifact && hasProjectObject;
}
