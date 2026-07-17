import type { CanvasNode, CanvasNodeType, CanvasPreviewRole } from '@neko/shared';
import type { PreviewSourceDescriptor } from '../../../preview';
import type { CanvasStore } from '../../../stores/canvasStore';
import type { ClipboardStore } from '../../../stores/clipboardStore';
import type { HistoryStore } from '../../../stores/historyStore';

export type CardPreviewRenderForm =
  'asset-thumbnail' | 'media-poster' | 'waveform' | 'text' | 'icon' | 'none';

export type CardPreviewAspectRatio = '3/2' | '16/9' | '1/1';

export interface AssetPreviewSource {
  readonly renderForm: 'asset-thumbnail';
  readonly aspectRatio: CardPreviewAspectRatio;
  readonly source: PreviewSourceDescriptor;
}

export interface MediaPosterPreviewSource {
  readonly renderForm: 'media-poster';
  readonly aspectRatio: CardPreviewAspectRatio;
  readonly source: PreviewSourceDescriptor;
}

export interface WaveformPreviewSource {
  readonly renderForm: 'waveform';
  readonly waveformStyle?: 'bars' | 'line';
}

export interface TextPreviewSource {
  readonly renderForm: 'text';
  readonly textExcerpt: string;
}

export interface IconPreviewSource {
  readonly renderForm: 'icon';
  readonly icon: string;
}

export interface NonePreviewSource {
  readonly renderForm: 'none';
}

export type CardPreviewSource =
  | AssetPreviewSource
  | MediaPosterPreviewSource
  | WaveformPreviewSource
  | TextPreviewSource
  | IconPreviewSource
  | NonePreviewSource;

export interface CardBadge {
  readonly label: string;
  readonly tone: 'info' | 'success' | 'warning' | 'error' | 'neutral';
}

export type ActionCondition =
  'always' | 'has-selection' | 'has-preview' | 'not-generating' | 'has-asset';

export type NodeCardActionId =
  | 'remove'
  | 'generate'
  | 'open-media-preview'
  | 'open-content-overlay'
  | 'edit-media'
  | 'save-to-asset-library'
  | 'duplicate'
  | 'open-in-editor';

export interface CardActionDescriptor {
  readonly id: NodeCardActionId;
  readonly label: string;
  readonly icon?: string;
  readonly position: 'top-right' | 'bottom' | 'overlay-center';
  readonly visibleWhen: 'always' | 'hover';
  readonly danger?: boolean;
  readonly confirm?: string;
  readonly enabledWhen?: ActionCondition;
}

export interface NodeCardPolicy {
  readonly nodeType: CanvasNodeType;
  resolvePreviewSource(node: CanvasNode): CardPreviewSource;
  resolveTitle(node: CanvasNode, parent?: CanvasNode): string;
  resolveSubtitle?(node: CanvasNode): string | undefined;
  resolveBadges?(node: CanvasNode): readonly CardBadge[];
  resolveActions?(node: CanvasNode, parent?: CanvasNode): readonly CardActionDescriptor[];
}

export type NodeCardPolicyRegistry = Partial<Record<CanvasNodeType, NodeCardPolicy>>;

export type NodeCardVariant =
  'thumbnail' | 'compact' | 'row' | 'summary' | 'summary-large' | 'review-full' | 'gallery';

export interface ActionConditionContext {
  readonly node: CanvasNode;
  readonly parentNode?: CanvasNode;
  readonly childNodes?: readonly CanvasNode[];
  readonly selection: { readonly nodeIds: readonly string[] };
  readonly previewSource?: CardPreviewSource;
}

export interface NodeCardActionContext {
  readonly nodeId: string;
  readonly node: CanvasNode;
  readonly parentNodeId?: string;
  readonly canvasStore: CanvasStore;
  readonly historyStore: HistoryStore;
  readonly clipboardStore: ClipboardStore;
  readonly postMessage: (message: unknown) => void;
}

export type NodeCardActionHandler = (ctx: NodeCardActionContext) => void;
export type NodeCardActionDispatcher = Record<NodeCardActionId, NodeCardActionHandler>;

export type ContainerActionId =
  | 'assign-selected-children'
  | 'auto-layout'
  | 'batch-generate'
  | 'add-row'
  | 'add-column'
  | 'remove-row'
  | 'remove-column'
  | 'arrange-stable'
  | 'arrange-name'
  | 'arrange-type'
  | 'arrange-created'
  | 'fit-to-content'
  | 'collapse-group'
  | 'expand-group';

export type ContainerActionVisibility = 'always' | 'selected' | 'has-children' | 'empty';

export interface ContainerActionDescriptor {
  readonly id: ContainerActionId;
  readonly label: string;
  readonly icon?: string;
  readonly visibleWhen: ContainerActionVisibility;
  readonly danger?: boolean;
  readonly confirm?: string;
  readonly enabledWhen?: ActionCondition;
}

export interface ContainerActionContext {
  readonly containerId: string;
  readonly node: CanvasNode;
  readonly childNodes: readonly CanvasNode[];
  readonly selection: { readonly nodeIds: readonly string[] };
  readonly canvasStore: CanvasStore;
  readonly postMessage: (message: unknown) => void;
}

export interface ContainerActionDescriptorContext {
  readonly node: CanvasNode;
  readonly childNodes: readonly CanvasNode[];
  readonly selection: { readonly nodeIds: readonly string[] };
  readonly isSelected: boolean;
}

export type ContainerActionHandler = (ctx: ContainerActionContext) => void;
export type ContainerActionDispatcher = Record<ContainerActionId, ContainerActionHandler>;

export interface RuntimePreviewState {
  readonly source?: PreviewSourceDescriptor;
  readonly stableUrl?: string;
}

export interface PreviewRoleMapping {
  readonly role: CanvasPreviewRole;
  readonly renderForm: CardPreviewRenderForm;
}
