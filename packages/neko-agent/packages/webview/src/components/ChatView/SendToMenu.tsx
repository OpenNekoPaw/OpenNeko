/**
 * SendToMenu - Cross-plugin transfer action buttons (ADR-5 P0)
 *
 * Renders contextual action buttons based on which neko-suite plugins
 * are installed. The webview receives plugin availability via
 * `pluginsAvailable` message at initialization.
 *
 * All transfers use GeneratedAsset JSON — no binary data is sent.
 */

import { memo, useCallback } from 'react';
import { AgentHostMessages } from '@/messages';
import { ArrowRightIcon, FileIcon, LayersIcon, ScissorsIcon, UploadIcon } from '@neko/shared/icons';
import { useTranslation } from '@/i18n/I18nContext';
import type {
  PluginTransferAssetRef,
  PluginTransferMediaType,
  PluginTransferPayload,
  PluginTransferProvenance,
  PluginTransferTarget,
  PluginTransferTargetRef,
  PluginsAvailable as SharedPluginsAvailable,
  RequestCanvasAuthoringHandoffWebviewMessage,
} from '@neko-agent/types';
import type { CanvasMarkdownCapabilityTarget, CanvasMarkdownResourceRef } from '@neko/shared';
import { isRuntimeOnlyCanvasMarkdownResourceValue } from '@neko/shared';
import { projectPluginTransferMenu } from '../../presenters/plugin-transfer-presenter';
import type { CanvasMarkdownHandoffRequest } from '@/presenters/canvas-markdown-handoff-presenter';

/** Which plugins are installed */
export type PluginsAvailable = SharedPluginsAvailable;

export type SendToTarget = PluginTransferTarget;

export type CanvasAuthoringHandoffRequest = Omit<
  RequestCanvasAuthoringHandoffWebviewMessage,
  'type' | 'requestId' | 'conversationId'
>;

interface SendToMenuProps {
  /** Asset path on disk (absolute) */
  assetPath?: string;
  /** Multiple asset paths on disk. */
  assetPaths?: readonly string[];
  /** Fully typed asset refs, used when names or mixed media metadata are available. */
  assets?: readonly PluginTransferAssetRef[];
  /** Structured transfer payload. Overrides assetPath / assetPaths / assets when provided. */
  payload?: PluginTransferPayload;
  /** General Canvas authoring handoff context. Sent as an Agent turn. */
  canvasAuthoringHandoff?: CanvasAuthoringHandoffRequest;
  /** Canvas Markdown handoff context. Sent as an Agent turn so the Agent can choose Canvas tools. */
  canvasMarkdownHandoff?: CanvasMarkdownHandoffRequest;
  /** Conversation scope for Agent-led Canvas Markdown handoff. */
  conversationId?: string | null;
  /** Optional target allow-list for composite UIs that split structured and flat transfers. */
  allowedTargets?: readonly PluginTransferTarget[];
  /** Media type hint for determining valid targets */
  mediaType: PluginTransferMediaType;
  /** Detected installed plugins */
  plugins: PluginsAvailable;
  /** Hide the leading "Send to" text for compact contexts such as thumbnails. */
  hidePrefixLabel?: boolean;
  /** Override the leading action phrase for explicit draft-only flows. */
  labelOverride?: string;
  /** Hide Explorer from contexts that already have a primary view/reveal affordance. */
  hideExplorerTarget?: boolean;
  /** Show an explicit direct import/add-source action for Canvas asset transfer. */
  showDirectCanvasImport?: boolean;
  className?: string;
}

function SendToMenuComponent({
  assetPath,
  assetPaths,
  assets,
  payload,
  canvasAuthoringHandoff,
  canvasMarkdownHandoff,
  conversationId,
  allowedTargets,
  mediaType,
  plugins,
  hidePrefixLabel = false,
  labelOverride,
  hideExplorerTarget = false,
  showDirectCanvasImport = false,
  className,
}: SendToMenuProps) {
  const { t } = useTranslation();
  const prefixLabel = labelOverride ?? t('chat.transfer.sendTo');

  const handleSendTo = useCallback(
    (target: SendToTarget) => {
      if (target === 'canvas') {
        if (!conversationId) return;
        const transferPayload = buildPluginTransferPayload({
          assetPath,
          assetPaths,
          assets,
          mediaType,
          payload,
        });
        const authoringHandoff = canvasMarkdownHandoff
          ? projectCanvasAuthoringHandoffFromMarkdown(canvasMarkdownHandoff)
          : (canvasAuthoringHandoff ?? projectCanvasAuthoringHandoffFromTransfer(transferPayload));
        if (!authoringHandoff) return;
        AgentHostMessages.requestCanvasAuthoringHandoff({
          conversationId,
          requestId: createCanvasAuthoringHandoffRequestId(),
          ...authoringHandoff,
        });
        return;
      }
      const transferPayload = buildPluginTransferPayload({
        assetPath,
        assetPaths,
        assets,
        mediaType,
        payload,
      });
      if (!transferPayload) return;
      AgentHostMessages.sendToPlugin(target, transferPayload);
    },
    [
      assetPath,
      assetPaths,
      assets,
      canvasMarkdownHandoff,
      canvasAuthoringHandoff,
      conversationId,
      mediaType,
      payload,
    ],
  );
  const handleDirectCanvasImport = useCallback(() => {
    const transferPayload = buildPluginTransferPayload({
      assetPath,
      assetPaths,
      assets,
      mediaType,
      payload,
    });
    if (!transferPayload) return;
    AgentHostMessages.sendToPlugin('canvas', transferPayload);
  }, [assetPath, assetPaths, assets, mediaType, payload]);

  const projection = projectPluginTransferMenu({
    mediaType,
    plugins,
    ...(payload?.kind === 'cutStoryboard' ? { structuredKind: 'cutStoryboard' } : {}),
  });
  const targets = allowedTargets
    ? projection.targets.filter((target) => allowedTargets.includes(target.id))
    : projection.targets;
  const hasCanvasAuthoringHandoffSource = Boolean(
    canvasAuthoringHandoff ||
    canvasMarkdownHandoff ||
    assetPath ||
    assetPaths?.length ||
    assets?.length ||
    payload,
  );
  const capabilityTargets = targets.filter(
    (target) =>
      target.id !== 'canvas' || (Boolean(conversationId) && hasCanvasAuthoringHandoffSource),
  );
  const visibleTargets = hideExplorerTarget
    ? capabilityTargets.filter((target) => target.id !== 'explorer')
    : capabilityTargets;
  const directCanvasImportPayload =
    showDirectCanvasImport && plugins.canvas
      ? buildPluginTransferPayload({ assetPath, assetPaths, assets, mediaType, payload })
      : null;

  if (visibleTargets.length === 0 && !directCanvasImportPayload) return null;

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-1.5 ${className ?? ''}`}>
      {!hidePrefixLabel && (
        <span className="shrink-0 text-[10px] text-[var(--vscode-descriptionForeground)]">
          {prefixLabel}
        </span>
      )}
      {visibleTargets.map((target) => (
        <button
          key={target.id}
          onClick={() => handleSendTo(target.id)}
          className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded border border-[var(--agent-input-border)]
            bg-[var(--agent-surface)] px-2 text-[11px] font-medium text-[var(--agent-fg)]
            transition-colors hover:border-[var(--agent-accent)] hover:bg-[var(--agent-hover)]
            focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--agent-accent)]"
          title={t('chat.transfer.sendToTarget', { target: target.label })}
        >
          {getTargetIcon(target.id)}
          <span>{target.label}</span>
          <ArrowRightIcon className="h-3 w-3 opacity-70" />
        </button>
      ))}
      {directCanvasImportPayload && (
        <button
          type="button"
          onClick={handleDirectCanvasImport}
          className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded border border-[var(--agent-input-border)]
            bg-[var(--agent-surface)] px-2 text-[11px] font-medium text-[var(--agent-fg)]
            transition-colors hover:border-[var(--agent-accent)] hover:bg-[var(--agent-hover)]
            focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[var(--agent-accent)]"
          title={t('chat.transfer.importToCanvasTitle')}
        >
          <UploadIcon className="h-3.5 w-3.5" />
          <span>{t('chat.transfer.importToCanvas')}</span>
        </button>
      )}
    </div>
  );
}

function createCanvasAuthoringHandoffRequestId(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `canvas-authoring-handoff:${random}`;
}

type CanvasAuthoringHandoffRequestPayload = Parameters<
  typeof AgentHostMessages.requestCanvasAuthoringHandoff
>[0];

type CanvasAuthoringHandoffRequestBody = Omit<
  CanvasAuthoringHandoffRequestPayload,
  'conversationId' | 'requestId'
>;

function projectCanvasAuthoringHandoffFromMarkdown(
  handoff: CanvasMarkdownHandoffRequest,
): CanvasAuthoringHandoffRequestBody {
  return {
    sourceKind: 'markdown',
    content: handoff.markdown,
    ...(handoff.sourceFormat ? { sourceFormat: handoff.sourceFormat } : {}),
    ...(handoff.title ? { title: handoff.title } : {}),
    ...(handoff.resources ? { resources: handoff.resources } : {}),
    ...(handoff.stableRefs ? { stableRefs: handoff.stableRefs } : {}),
    ...(handoff.diagnostics ? { diagnostics: handoff.diagnostics } : {}),
    ...(handoff.promptSpans ? { promptSpans: handoff.promptSpans } : {}),
    ...(handoff.target ? { target: handoff.target } : {}),
    ...(handoff.provenance ? { provenance: handoff.provenance } : {}),
    ...(handoff.userIntent ? { userIntent: handoff.userIntent } : {}),
    targetHints: {
      ...(handoff.sourceFormat ? { sourceFormat: handoff.sourceFormat } : {}),
      ...(handoff.declaredIntentHint ? { declaredIntentHint: handoff.declaredIntentHint } : {}),
      ...(handoff.declaredProfileHint ? { declaredProfileHint: handoff.declaredProfileHint } : {}),
    },
  };
}

function projectCanvasAuthoringHandoffFromTransfer(
  payload: PluginTransferPayload | null,
): CanvasAuthoringHandoffRequestBody | null {
  if (!payload) return null;
  const resources = projectCanvasAuthoringResources(payload);
  if (resources.length === 0) return null;
  const title = projectCanvasAuthoringTransferTitle(payload);
  const target = projectCanvasAuthoringTarget(payload.target);
  const provenance = projectCanvasAuthoringProvenance(payload);
  return {
    sourceKind: 'resource-backed-content',
    content: projectCanvasAuthoringTransferContent(payload, title),
    title,
    resources,
    ...(target ? { target } : {}),
    ...(provenance ? { provenance } : {}),
    userIntent: 'Send this resource-backed content to Canvas through Agent tool selection.',
  };
}

function projectCanvasAuthoringResources(
  payload: PluginTransferPayload,
): readonly CanvasMarkdownResourceRef[] {
  if (payload.kind === 'singleAsset') return projectCanvasAuthoringAssetResource(payload.asset);
  if (payload.kind === 'assetBatch') {
    return payload.assets.flatMap((asset) => projectCanvasAuthoringAssetResource(asset));
  }
  return [];
}

function projectCanvasAuthoringAssetResource(
  asset: PluginTransferAssetRef,
): readonly CanvasMarkdownResourceRef[] {
  const sourcePath = asset.path && isStableCanvasSourcePath(asset.path) ? asset.path : undefined;
  const resource: CanvasMarkdownResourceRef = {
    ...(asset.name ? { label: asset.name } : {}),
    ...((asset.name ?? sourcePath) ? { token: asset.name ?? sourcePath } : {}),
    role: 'source',
    ...(sourcePath ? { sourcePath } : {}),
    ...(asset.resourceRef ? { resourceRef: asset.resourceRef } : {}),
    ...(asset.documentResourceRef ? { documentResourceRef: asset.documentResourceRef } : {}),
  };
  return resource.sourcePath || resource.resourceRef || resource.documentResourceRef
    ? [resource]
    : [];
}

function isStableCanvasSourcePath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) return false;
  if (isRuntimeOnlyCanvasMarkdownResourceValue(trimmed)) return false;
  if (/^(?:\/|[A-Za-z]:[\\/])/.test(trimmed)) return false;
  return true;
}

function projectCanvasAuthoringTransferTitle(payload: PluginTransferPayload): string {
  if (payload.kind === 'singleAsset') {
    return payload.asset.name ?? 'Canvas Resource';
  }
  if (payload.kind === 'assetBatch') return 'Canvas Resource Batch';
  return 'Canvas Resource Content';
}

function projectCanvasAuthoringTransferContent(
  payload: PluginTransferPayload,
  title: string,
): string {
  if (payload.kind === 'singleAsset') {
    return `Resource-backed content: ${title}`;
  }
  if (payload.kind === 'assetBatch') {
    return `Resource-backed content batch: ${payload.assets.length} assets`;
  }
  return `Resource-backed content: ${title}`;
}

function projectCanvasAuthoringTarget(
  target: PluginTransferTargetRef | undefined,
): CanvasMarkdownCapabilityTarget | undefined {
  if (!target) return undefined;
  const { plugin: _plugin, ...rest } = target;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function projectCanvasAuthoringProvenance(
  payload: PluginTransferPayload,
): PluginTransferProvenance | undefined {
  return 'provenance' in payload ? payload.provenance : undefined;
}

function buildPluginTransferPayload(input: {
  assetPath?: string;
  assetPaths?: readonly string[];
  assets?: readonly PluginTransferAssetRef[];
  mediaType: PluginTransferMediaType;
  payload?: PluginTransferPayload;
}): PluginTransferPayload | null {
  if (input.payload) return input.payload;

  const assets: readonly PluginTransferAssetRef[] =
    input.assets ??
    input.assetPaths?.map((path) => ({
      path,
      mediaType: input.mediaType,
    })) ??
    (input.assetPath
      ? [
          {
            path: input.assetPath,
            mediaType: input.mediaType,
          },
        ]
      : []);

  const validAssets = assets.filter(hasPluginTransferAssetIdentity);
  if (validAssets.length === 0) return null;
  if (validAssets.length === 1 && validAssets[0]) {
    return { kind: 'singleAsset', asset: validAssets[0] };
  }
  return { kind: 'assetBatch', assets: validAssets };
}

function hasPluginTransferAssetIdentity(asset: PluginTransferAssetRef): boolean {
  return Boolean(asset.path || asset.documentResourceRef || asset.resourceRef);
}

function getTargetIcon(target: SendToTarget): React.ReactNode {
  if (target === 'canvas') return <LayersIcon className="h-3.5 w-3.5" />;
  if (target === 'cut') return <ScissorsIcon className="h-3.5 w-3.5" />;
  if (target === 'explorer') return <FileIcon className="h-3.5 w-3.5" />;
  return <UploadIcon className="h-3.5 w-3.5" />;
}

export const SendToMenu = memo(SendToMenuComponent);
