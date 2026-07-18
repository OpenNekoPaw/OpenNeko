import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CanvasNode } from '@neko/shared';
import type { RuntimePreviewVariant } from '../../../preview';
import { WebviewPreviewResolver } from '../../../preview/previewResolver';
import {
  useInteractionRenderMode,
  type NodeInteractionRenderMode,
} from '../../../hooks/useInteractionRenderMode';
import { useCanvasStore } from '../../../stores/canvasStore';
import { useClipboardStore } from '../../../stores/clipboardStore';
import { useHistoryStore } from '../../../stores/historyStore';
import { getGlobalVSCodeApi } from '../../../utils/vscode';
import { isImagePreviewUrl } from '../../../preview';
import { dispatchNodeCardAction, NODE_CARD_ACTION_DISPATCHER } from './actionDispatcher';
import { createBuiltInNodeCardPolicyRegistry, getNodeCardPolicy } from './policies';
import type {
  CardActionDescriptor,
  CardBadge,
  CardPreviewAspectRatio,
  CardPreviewSource,
  NodeCardActionId,
  NodeCardVariant,
  NodeCardPolicyRegistry,
} from './types';
import {
  evaluateActionCondition,
  getStableSafeVariantUrl,
  hasPreviewDescriptorContent,
} from './utils';
import { t } from '../../../i18n';

const BUILT_IN_POLICY_REGISTRY = createBuiltInNodeCardPolicyRegistry();

export interface NodeCardProps {
  node: CanvasNode;
  parentNode?: CanvasNode;
  policyRegistry?: NodeCardPolicyRegistry;
  selection?: { nodeIds: readonly string[] };
  variant?: NodeCardVariant;
  interactionRenderMode?: NodeInteractionRenderMode;
  onSelect?: (id: string, multi: boolean) => void;
  onAction?: (nodeId: string, actionId: NodeCardActionId) => void;
}

export function NodeCard({
  node,
  parentNode,
  policyRegistry = BUILT_IN_POLICY_REGISTRY,
  selection = { nodeIds: [] },
  variant = 'thumbnail',
  interactionRenderMode = 'full',
  onSelect,
  onAction,
}: NodeCardProps): React.ReactNode {
  const policy = getNodeCardPolicy(policyRegistry, node);
  const previewSource = policy.resolvePreviewSource(node);
  const title = policy.resolveTitle(node, parentNode);
  const subtitle = policy.resolveSubtitle?.(node);
  const badges = policy.resolveBadges?.(node) ?? [];
  const actions = policy.resolveActions?.(node, parentNode) ?? [];

  const handleAction = useCallback(
    (actionId: NodeCardActionId) => {
      onAction?.(node.id, actionId);
      dispatchNodeCardAction(NODE_CARD_ACTION_DISPATCHER, actionId, {
        nodeId: node.id,
        node,
        parentNodeId: parentNode?.id,
        canvasStore: useCanvasStore.getState(),
        historyStore: useHistoryStore.getState(),
        clipboardStore: useClipboardStore.getState(),
        postMessage: (message) => getGlobalVSCodeApi()?.postMessage(message),
      });
    },
    [node, onAction, parentNode?.id],
  );

  return (
    <div
      className="group relative min-w-0"
      data-node-card-id={node.id}
      data-node-card-variant={variant}
    >
      <button
        type="button"
        className={getCardButtonClassName(variant)}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => onSelect?.(node.id, event.shiftKey || event.metaKey)}
      >
        {variant !== 'summary' && (
          <CardPreviewSlot
            source={previewSource}
            title={title}
            variant={variant}
            interactionRenderMode={interactionRenderMode}
          />
        )}
        <CardMetadataSlot title={title} subtitle={subtitle} badges={badges} variant={variant} />
      </button>
      <CardActionSlot
        actions={actions}
        node={node}
        parentNode={parentNode}
        selection={selection}
        previewSource={previewSource}
        onAction={handleAction}
      />
    </div>
  );
}

export function CardPreviewSlot({
  source,
  title,
  variant = 'thumbnail',
  interactionRenderMode = 'full',
  imageFit = 'cover',
}: {
  source: CardPreviewSource;
  title: string;
  variant?: NodeCardVariant;
  interactionRenderMode?: NodeInteractionRenderMode;
  imageFit?: 'cover' | 'contain';
}): React.ReactNode {
  const effectiveMode = useInteractionRenderMode({
    requestedMode: interactionRenderMode,
  });
  const shouldRenderShell = effectiveMode === 'shell' && canShellPreviewSource(source);
  const previewDescriptor =
    source.renderForm === 'asset-thumbnail' || source.renderForm === 'media-poster'
      ? source.source
      : undefined;
  const stableUrl = useMemo(
    () => (previewDescriptor ? getStableSafeVariantUrl(previewDescriptor) : undefined),
    [previewDescriptor],
  );
  const resolvedVariant = useResolvedPreview(
    stableUrl || !previewDescriptor || !hasPreviewDescriptorContent(previewDescriptor)
      ? undefined
      : previewDescriptor,
  );
  const resolvedDisplayUrl =
    source.renderForm === 'media-poster'
      ? readImagePreviewUrl(resolvedVariant?.runtimeUrl)
      : resolvedVariant?.runtimeUrl;
  const displayUrl = stableUrl ?? resolvedDisplayUrl;

  switch (source.renderForm) {
    case 'asset-thumbnail':
      if (shouldRenderShell) {
        return <PreviewShell aspectRatio={source.aspectRatio} variant={variant} />;
      }
      return displayUrl ? (
        <PreviewImage
          url={displayUrl}
          title={title}
          aspectRatio={source.aspectRatio}
          variant={variant}
          imageFit={imageFit}
        />
      ) : (
        <IconPlaceholder icon="IMG" aspectRatio={source.aspectRatio} variant={variant} />
      );
    case 'media-poster':
      return (
        <div
          className={getPreviewFrameClassName(variant)}
          style={previewFrameStyle(source.aspectRatio, variant)}
        >
          {displayUrl ? (
            <img
              src={displayUrl}
              alt={title}
              className={`h-full w-full ${imageFit === 'contain' ? 'object-contain' : 'object-cover'}`}
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-[var(--node-fg-secondary)]">
              {t('preview.videoPlaceholder')}
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-[11px] text-white">
              {t('action.playShort')}
            </div>
          </div>
        </div>
      );
    case 'waveform':
      if (shouldRenderShell) {
        return <PreviewShell aspectRatio="3/2" variant={variant} />;
      }
      return <AudioWaveformPreview variant={variant} />;
    case 'text':
      if (shouldRenderShell) {
        return <PreviewShell aspectRatio="3/2" variant={variant} />;
      }
      return <TextExcerptPreview text={source.textExcerpt} variant={variant} />;
    case 'icon':
      if (shouldRenderShell) {
        return <PreviewShell aspectRatio="3/2" variant={variant} />;
      }
      return <IconPlaceholder icon={source.icon} aspectRatio="3/2" variant={variant} />;
    case 'none':
      return null;
  }
}

function readImagePreviewUrl(url: string | undefined): string | undefined {
  return url && isImagePreviewUrl(url) ? url : undefined;
}

function canShellPreviewSource(source: CardPreviewSource): boolean {
  return source.renderForm !== 'media-poster' && source.renderForm !== 'none';
}

function CardMetadataSlot({
  title,
  subtitle,
  badges,
  variant,
}: {
  title: string;
  subtitle?: string;
  badges: readonly CardBadge[];
  variant: NodeCardVariant;
}): React.ReactNode {
  const showSubtitle = variant !== 'summary' && subtitle;
  return (
    <div className={getMetadataClassName(variant)}>
      <div className="min-w-0">
        <div
          className={
            variant === 'row'
              ? 'truncate text-[11px] text-[var(--node-fg)]'
              : 'truncate text-[10px] text-[var(--node-fg)]'
          }
        >
          {title}
        </div>
        {showSubtitle ? (
          <div className="truncate text-[9px] text-[var(--node-fg-secondary)]">{subtitle}</div>
        ) : null}
      </div>
      {badges.length > 0 ? (
        <div className="flex max-w-[72px] flex-shrink-0 flex-wrap justify-end gap-0.5">
          {badges.slice(0, 2).map((badge) => (
            <span key={`${badge.tone}:${badge.label}`} className={getBadgeClassName(badge.tone)}>
              {badge.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CardActionSlot({
  actions,
  node,
  parentNode,
  selection,
  previewSource,
  onAction,
}: {
  actions: readonly CardActionDescriptor[];
  node: CanvasNode;
  parentNode?: CanvasNode;
  selection: { nodeIds: readonly string[] };
  previewSource: CardPreviewSource;
  onAction: (actionId: NodeCardActionId) => void;
}): React.ReactNode {
  const enabledActions = actions.filter((action) =>
    evaluateActionCondition(action.enabledWhen, { node, parentNode, selection, previewSource }),
  );
  const topRightActions = enabledActions.filter((action) => action.position === 'top-right');
  const overlayActions = enabledActions.filter((action) => action.position === 'overlay-center');
  const bottomActions = enabledActions.filter((action) => action.position === 'bottom');

  return (
    <>
      {topRightActions.map((action) => (
        <ActionButton
          key={action.id}
          action={action}
          className="absolute right-0.5 top-0.5"
          onAction={onAction}
        />
      ))}
      {overlayActions.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center group-hover:flex">
          {overlayActions.map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              className="pointer-events-auto"
              onAction={onAction}
            />
          ))}
        </div>
      ) : null}
      {bottomActions.length > 0 ? (
        <div className="absolute bottom-1 left-1 right-1 hidden gap-1 group-hover:flex">
          {bottomActions.map((action) => (
            <ActionButton key={action.id} action={action} className="flex-1" onAction={onAction} />
          ))}
        </div>
      ) : null}
    </>
  );
}

function ActionButton({
  action,
  className,
  onAction,
}: {
  action: CardActionDescriptor;
  className?: string;
  onAction: (actionId: NodeCardActionId) => void;
}): React.ReactNode {
  return (
    <button
      type="button"
      className={`${className ?? ''} ${getActionClassName(action)}`}
      title={resolveActionTitle(action)}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onAction(action.id);
      }}
    >
      {resolveActionLabel(action)}
    </button>
  );
}

function PreviewImage({
  url,
  title,
  aspectRatio,
  variant,
  imageFit,
}: {
  url: string;
  title: string;
  aspectRatio: CardPreviewAspectRatio;
  variant: NodeCardVariant;
  imageFit: 'cover' | 'contain';
}): React.ReactNode {
  return (
    <div
      className={getPreviewFrameClassName(variant)}
      style={previewFrameStyle(aspectRatio, variant)}
    >
      <img src={url} alt={title} className={getPreviewImageClassName(variant, imageFit)} />
    </div>
  );
}

function getPreviewImageClassName(variant: NodeCardVariant, imageFit: 'cover' | 'contain'): string {
  if (variant === 'review-full') {
    return imageFit === 'contain'
      ? 'h-auto max-h-[220px] w-auto max-w-full object-contain'
      : 'h-auto max-h-[220px] w-auto max-w-full object-cover';
  }
  return `h-full w-full ${imageFit === 'contain' ? 'object-contain' : 'object-cover'}`;
}

function AudioWaveformPreview({ variant }: { variant: NodeCardVariant }): React.ReactNode {
  if (variant === 'summary-large' || variant === 'gallery') {
    return (
      <div className="flex h-full min-h-[72px] w-full flex-col justify-center gap-2 bg-gray-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white text-[10px] text-gray-700 shadow-sm">
            {t('action.playShort')}
          </div>
          <div className="h-1 flex-1 rounded bg-gray-200" />
        </div>
        <div className="flex h-8 items-end gap-px">
          {Array.from({ length: 18 }, (_, index) => (
            <div
              key={index}
              className="flex-1 rounded-sm bg-gray-300"
              style={{ height: `${20 + Math.sin(index * 0.8) * 40 + Math.cos(index * 1.3) * 30}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        variant === 'row'
          ? 'flex h-10 w-14 flex-shrink-0 flex-col justify-center gap-1 bg-black/20 px-1.5 py-1'
          : 'flex w-full flex-col gap-1.5 bg-gradient-to-b from-black/30 to-black/10 px-2 py-2'
      }
    >
      <div className="flex items-center gap-1.5">
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-[9px]">
          {t('action.playShort')}
        </div>
        <div className="h-0.5 flex-1 rounded bg-white/20" />
      </div>
      <div className="flex h-4 items-end gap-px">
        {Array.from({ length: 16 }, (_, index) => (
          <div
            key={index}
            className="flex-1 rounded-sm bg-white/20"
            style={{ height: `${20 + Math.sin(index * 0.8) * 40 + Math.cos(index * 1.3) * 30}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function TextExcerptPreview({
  text,
  variant,
}: {
  text: string;
  variant: NodeCardVariant;
}): React.ReactNode {
  if (variant === 'summary-large' || variant === 'gallery') {
    return (
      <div className="flex h-full min-h-[72px] w-full items-start overflow-hidden rounded bg-gray-100 px-2 py-2 text-[11px] leading-snug text-gray-600">
        <span className="line-clamp-4 break-words">{text || t('preset.inlineField.text')}</span>
      </div>
    );
  }

  return (
    <div
      className={
        variant === 'row'
          ? 'flex h-10 w-14 flex-shrink-0 items-start overflow-hidden bg-black/20 px-1.5 py-1 text-[9px] leading-tight text-[var(--node-fg-secondary)]'
          : 'flex w-full items-start overflow-hidden bg-black/20 px-2 py-1.5 text-[10px] leading-snug text-[var(--node-fg-secondary)]'
      }
      style={variant === 'row' ? undefined : previewFrameStyle('3/2', variant)}
    >
      <span
        className={
          variant === 'compact' || variant === 'row'
            ? 'line-clamp-2 break-words'
            : 'line-clamp-3 break-words'
        }
      >
        {text || t('preset.inlineField.text')}
      </span>
    </div>
  );
}

function IconPlaceholder({
  icon,
  aspectRatio,
  variant,
}: {
  icon: string;
  aspectRatio: CardPreviewAspectRatio;
  variant: NodeCardVariant;
}): React.ReactNode {
  return (
    <div
      className={getPreviewFrameClassName(variant)}
      style={previewFrameStyle(aspectRatio, variant)}
    >
      {icon}
    </div>
  );
}

function PreviewShell({
  aspectRatio,
  variant,
}: {
  aspectRatio: CardPreviewAspectRatio;
  variant: NodeCardVariant;
}): React.ReactNode {
  return (
    <div
      className={getPreviewFrameClassName(variant)}
      data-node-card-preview-shell="true"
      style={previewFrameStyle(aspectRatio, variant)}
    >
      <div className="h-5 w-12 rounded bg-white/10" />
    </div>
  );
}

function useResolvedPreview(
  source: Parameters<WebviewPreviewResolver['resolve']>[0]['source'] | undefined,
): RuntimePreviewVariant | undefined {
  const resolver = useMemo(() => new WebviewPreviewResolver(), []);
  const [variant, setVariant] = useState<RuntimePreviewVariant | undefined>();

  useEffect(() => {
    if (!source) {
      setVariant(undefined);
      return;
    }

    let cancelled = false;
    resolver.resolve({ source }).then((resolved) => {
      if (!cancelled) {
        setVariant(resolved);
      }
    });

    return () => {
      cancelled = true;
      resolver.dispose();
    };
  }, [resolver, source]);

  return variant;
}

function aspectRatioStyle(aspectRatio: CardPreviewAspectRatio): React.CSSProperties {
  return { aspectRatio: aspectRatio.replace('/', ' / ') };
}

function previewFrameStyle(
  aspectRatio: CardPreviewAspectRatio,
  variant: NodeCardVariant,
): React.CSSProperties | undefined {
  if (
    variant === 'row' ||
    variant === 'summary-large' ||
    variant === 'review-full' ||
    variant === 'gallery'
  ) {
    return undefined;
  }

  return aspectRatioStyle(aspectRatio);
}

function getCardButtonClassName(variant: NodeCardVariant): string {
  const base =
    variant === 'thumbnail'
      ? 'w-full overflow-hidden rounded border border-[var(--node-border)] bg-black/10 text-left hover:border-[var(--node-selected)]'
      : 'w-full overflow-hidden bg-transparent text-left';
  if (variant === 'row' || variant === 'summary') {
    return `${base} flex min-h-[42px] min-w-0 flex-row items-stretch`;
  }

  return `${base} flex min-w-0 flex-col`;
}

function getPreviewFrameClassName(variant: NodeCardVariant): string {
  if (variant === 'row') {
    return 'relative flex h-10 w-14 flex-shrink-0 items-center justify-center overflow-hidden bg-black/20 text-xs text-[var(--node-fg-secondary)]';
  }
  if (variant === 'summary-large') {
    return 'relative flex h-full min-h-[72px] w-full items-center justify-center overflow-hidden rounded bg-gray-100 text-sm text-gray-500';
  }
  if (variant === 'review-full') {
    return 'relative inline-flex max-h-[220px] max-w-[180px] items-center justify-center overflow-hidden rounded bg-gray-50 text-sm text-gray-500';
  }
  if (variant === 'gallery') {
    return 'relative flex h-full min-h-[104px] w-full items-center justify-center overflow-hidden bg-gray-100 text-base text-gray-500';
  }

  return 'relative flex w-full items-center justify-center overflow-hidden bg-black/20 text-base text-[var(--node-fg-secondary)]';
}

function getMetadataClassName(variant: NodeCardVariant): string {
  if (variant === 'row' || variant === 'summary') {
    return 'flex min-w-0 flex-1 items-center justify-between gap-1 px-2 py-1';
  }

  return 'flex min-w-0 items-center justify-between gap-1 px-1.5 py-1';
}

function getBadgeClassName(tone: CardBadge['tone']): string {
  switch (tone) {
    case 'success':
      return 'flex-shrink-0 rounded bg-emerald-900/40 px-1 text-[9px] text-emerald-300';
    case 'warning':
      return 'flex-shrink-0 rounded bg-amber-900/40 px-1 text-[9px] text-amber-300';
    case 'error':
      return 'flex-shrink-0 rounded bg-red-900/40 px-1 text-[9px] text-red-300';
    case 'info':
      return 'flex-shrink-0 rounded bg-blue-900/40 px-1 text-[9px] text-blue-300';
    default:
      return 'flex-shrink-0 rounded bg-black/20 px-1 text-[9px] text-[var(--node-fg-secondary)]';
  }
}

function getActionClassName(action: CardActionDescriptor): string {
  const base =
    'hidden min-h-4 items-center justify-center rounded bg-black/60 px-1 text-[9px] text-white group-hover:flex';
  return action.danger ? `${base} hover:bg-red-700` : `${base} hover:bg-black/80`;
}

function resolveActionLabel(action: CardActionDescriptor): string {
  switch (action.id) {
    case 'remove':
      return t('action.removeShort');
    case 'open-media-preview':
    case 'open-content-overlay':
      return t('action.openShort');
    case 'generate':
      return t('action.generateShort');
    case 'duplicate':
      return t('action.duplicateShort');
    case 'save-to-asset-library':
      return t('action.saveToAssetLibrary');
    case 'open-in-editor':
      return t('action.fileShort');
  }
}

function resolveActionTitle(action: CardActionDescriptor): string {
  return isI18nKey(action.label) ? t(action.label) : action.label;
}

function isI18nKey(label: string): boolean {
  return label.startsWith('action.') || label.startsWith('preset.');
}
