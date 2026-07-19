// =============================================================================
// Canvas Layered Node Contracts
//
// Platform-neutral contracts for the decoupled Canvas spatial, content,
// organization, relationship, and preview layers.
// =============================================================================

export type JsonPointerPath = '' | `/${string}`;

export type FieldBindingMode = 'read' | 'write' | 'readwrite';

export type FieldValueType =
  'string' | 'number' | 'boolean' | 'array' | 'object' | 'asset' | 'unknown';

export interface FieldBinding {
  /** JSON Pointer-style path into the owning node.data object. */
  path: JsonPointerPath;
  /** Optional display label for editors and diagnostics. */
  label?: string;
  /** Expected value category for renderer and property-panel selection. */
  valueType?: FieldValueType;
  /** Whether the binding can read, write, or both. Defaults to readwrite. */
  mode?: FieldBindingMode;
  /** Required bindings are reported when the path cannot be resolved. */
  required?: boolean;
  /** Stable default value used by renderers when data is absent. */
  defaultValue?: unknown;
}

export type CanvasContentVisibility = 'always' | 'selected' | 'expanded' | 'hover';

export type CanvasContentLayout =
  'stack' | 'row' | 'grid' | 'table' | 'gallery' | 'overlay' | 'custom';

export type CanvasBlockKind =
  | 'text'
  | 'editable-text'
  | 'input'
  | 'select'
  | 'textarea'
  | 'number'
  | 'status'
  | 'tag-list'
  | 'asset-preview'
  | 'button'
  | 'list'
  | 'key-value'
  | 'collection'
  | 'projection'
  | 'child-node-slot'
  | 'custom';

export interface CanvasBlock {
  /** Stable block ID used by bindings, diagnostics, and future endpoints. */
  id: string;
  kind: CanvasBlockKind;
  label?: string;
  binding?: FieldBinding;
  visibleWhen?: CanvasContentVisibility;
  capabilities?: BlockCapability[];
  children?: CanvasBlock[];
  collection?: CollectionView;
  projection?: ProjectionView;
  childSlot?: ChildNodeSlot;
  metadata?: Record<string, unknown>;
}

export interface ContainerSection {
  /** Stable section ID for renderer state and generated property panels. */
  id: string;
  title?: string;
  layout?: CanvasContentLayout;
  visibleWhen?: CanvasContentVisibility;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  blocks?: CanvasBlock[];
  sections?: ContainerSection[];
  childSlots?: ChildNodeSlot[];
  metadata?: Record<string, unknown>;
}

export interface CollectionView {
  id: string;
  /** Binding to the collection source, for example /cells or /tags. */
  source: FieldBinding;
  itemKeyPath?: JsonPointerPath;
  itemLabelPath?: JsonPointerPath;
  itemPreviewPath?: JsonPointerPath;
  layout?: CanvasContentLayout;
  emptyLabel?: string;
  itemBlocks?: CanvasBlock[];
}

export interface ProjectionView {
  id: string;
  /** Stable projection kind such as storyboard-table or scene-shot-list. */
  kind: string;
  sourceNodeIds?: string[];
  sourceBinding?: FieldBinding;
  columns?: ProjectionColumn[];
  editable?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ProjectionColumn {
  id: string;
  label: string;
  binding?: FieldBinding;
  width?: number;
}

export interface ChildNodeSlot {
  id: string;
  /** Direct child IDs to display. Omitted means use the owning container order. */
  childIds?: string[];
  filter?: ChildNodeSlotFilter;
  layout?: CanvasContentLayout;
  summaryRole?: CanvasPreviewRole;
  visibleWhen?: CanvasContentVisibility;
  emptyLabel?: string;
}

export interface ChildNodeSlotFilter {
  nodeTypes?: string[];
  presets?: string[];
  roles?: string[];
}

export type ContainerPolicyName = 'scene' | 'group' | 'artboard' | 'gallery' | (string & {});

export type ContainerLayoutMode = 'manual' | 'grid' | 'sequence' | 'stack' | 'table' | 'gallery';

export interface ContainerLayoutState {
  mode: ContainerLayoutMode;
  spacing?: number;
  columns?: number;
  rowHeight?: number;
  columnWidth?: number;
  lockedChildIds?: string[];
  collapsedChildIds?: string[];
  updatedAt?: number;
  metadata?: Record<string, unknown>;
}

export interface ContainerAcceptedChildren {
  nodeTypes?: string[];
  presets?: string[];
  maxChildren?: number;
}

export interface ContainerChildPlacement {
  childId: string;
  order?: number;
  slotId?: string;
  layoutLocked?: boolean;
  collapsed?: boolean;
  metadata?: Record<string, unknown>;
}

export type ContainerDeleteBehavior = 'release-children' | 'delete-subtree' | 'prompt';

export interface ContainerCapability {
  policy: ContainerPolicyName;
  /** Ordered IDs of direct child CanvasNodes. */
  childIds: string[];
  layout?: ContainerLayoutState;
  acceptedChildren?: ContainerAcceptedChildren;
  childPlacements?: Record<string, ContainerChildPlacement>;
  deleteBehavior?: ContainerDeleteBehavior;
  collapsed?: boolean;
  metadata?: Record<string, unknown>;
}

export type CanvasPreviewRole =
  | 'text'
  | 'image'
  | 'source-image'
  | 'document-cover'
  | 'audio-waveform'
  | 'video-poster'
  | 'video-proxy'
  | 'model-screenshot'
  | 'model-turntable'
  | 'panorama-fov-crop'
  | 'panorama-rotation'
  | 'generation-candidate'
  | 'collection'
  | 'project-thumbnail'
  | 'node-summary'
  | 'unavailable';

export interface CanvasPreviewDimensions {
  width: number;
  height: number;
}

export interface CanvasPreviewVariant {
  /** Stable descriptor ID. Runtime blob URLs and engine tokens are not persisted here. */
  id: string;
  role: CanvasPreviewRole;
  assetId?: string;
  sourcePath?: string;
  generatedAssetId?: string;
  mimeType?: string;
  dimensions?: CanvasPreviewDimensions;
  durationSecs?: number;
  selected?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AssetIdentityCapability {
  kind: 'asset-identity';
  assetId?: string;
  path?: string;
  uri?: string;
  mediaType?: string;
  title?: string;
  sourceHash?: string;
}

export interface PreviewCapability {
  kind: 'preview';
  roles: CanvasPreviewRole[];
  preferredRole?: CanvasPreviewRole;
  variants?: CanvasPreviewVariant[];
  unavailableLabel?: string;
}

export interface PlaybackCapability {
  kind: 'playback';
  mediaTypes: Array<'audio' | 'video' | 'animation'>;
  inline?: boolean;
  hover?: boolean;
  allowMultiple?: boolean;
}

export type DelegateTarget =
  'preview' | 'model' | 'cut' | 'audio' | 'document' | 'project' | 'external';

export interface DelegateAction {
  id: string;
  label: string;
  target: DelegateTarget;
  command?: string;
  route?: string;
  assetBinding?: FieldBinding;
  metadata?: Record<string, unknown>;
}

export interface DelegateCapability {
  kind: 'delegate';
  actions: DelegateAction[];
}

export interface GenerationPreviewCapability {
  kind: 'generation-preview';
  candidates: FieldBinding;
  selectedCandidateId?: FieldBinding;
  status?: FieldBinding;
}

export interface CollectionPreviewCapability {
  kind: 'collection-preview';
  collection: FieldBinding;
  itemPreview?: FieldBinding;
  selectedItem?: FieldBinding;
}

export interface NodeSummaryCapability {
  kind: 'node-summary';
  title?: FieldBinding;
  subtitle?: FieldBinding;
  thumbnail?: FieldBinding;
  badges?: FieldBinding[];
  fields?: FieldBinding[];
}

export type BlockCapability =
  | AssetIdentityCapability
  | PreviewCapability
  | PlaybackCapability
  | DelegateCapability
  | GenerationPreviewCapability
  | CollectionPreviewCapability
  | NodeSummaryCapability;

export interface NodePreviewDescriptor {
  nodeId: string;
  title?: string;
  subtitle?: string;
  thumbnailVariantId?: string;
  role?: CanvasPreviewRole;
  badges?: Array<{ label: string; tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }>;
  capabilities?: BlockCapability[];
  metadata?: Record<string, unknown>;
}

export type CanvasConnectionEndpointScope = 'node' | 'port' | 'block' | 'field';

export interface CanvasConnectionEndpoint {
  nodeId: string;
  scope?: CanvasConnectionEndpointScope;
  portId?: string;
  blockId?: string;
  fieldPath?: JsonPointerPath;
}
