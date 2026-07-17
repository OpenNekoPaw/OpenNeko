import { useMemo, useCallback } from 'react';
import type { ContainerSection, DocumentArchiveResourceRef, ResourceRef } from '@neko/shared';
import { NodeHeader } from './NodeHeader';
import type { NodeHeaderBadge } from './NodeHeader';
import { ContainerRenderer } from './ContainerRenderer';
import type { NodeContentRenderContext } from './types';
import { createBuiltInNodeTypeDescriptors } from '../nodes/nodeTypeDescriptors';
import { useCanvasStore } from '../../stores/canvasStore';
import { getGlobalVSCodeApi } from '../../utils/vscode';
import { t } from '../../i18n';
import { resolveCanvasStatusLabel } from '../../i18n/canvasValueLabels';
import { ContainerActionBar, readDocumentResourceRef, readResourceRef } from './node-card';
import { resolveResourceRefDisplayName } from '../../utils/resourceDisplayName';

export interface NodeShellProps {
  section: ContainerSection;
  context: NodeContentRenderContext;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function NodeShell({ section, context, isCollapsed, onToggleCollapse }: NodeShellProps) {
  const descriptors = useMemo(() => createBuiltInNodeTypeDescriptors(), []);
  const openContentOverlay = useCanvasStore((s) => s.openContentOverlay);

  const { node } = context;
  const descriptor = context.nodeTypeDescriptors?.[node.type] ?? descriptors[node.type];
  const presentation = descriptor?.presentation ?? 'structured';
  const contentChrome =
    presentation === 'foundational' && context.layout.surface === 'canvas'
      ? 'full-bleed'
      : 'contained';
  const preview = node.preview;

  const tagLabel = descriptor?.tagLabel ?? node.type.toUpperCase();
  const tagColor = descriptor?.tagColor ?? '#6b7280';
  const title = resolveNodeTitle(node, preview?.title);
  const badges = resolveNodeHeaderBadges(node, (preview?.badges ?? []) as NodeHeaderBadge[]);

  const assetInfo = useMemo(() => getNodeAssetInfo(node), [node]);

  const handleOpenPreview = useCallback(() => {
    if (!assetInfo) return;
    const vscode = getGlobalVSCodeApi();
    vscode?.postMessage({
      type: 'openMediaPreview',
      assetPath: assetInfo.assetPath,
      mediaType: assetInfo.mediaType,
      ...(assetInfo.documentResourceRef
        ? { documentResourceRef: assetInfo.documentResourceRef }
        : {}),
      ...(assetInfo.resourceRef ? { resourceRef: assetInfo.resourceRef } : {}),
    });
  }, [assetInfo]);

  const { controlSections, contentSections } = useMemo(() => {
    const rootSections = section.sections ?? [];
    return {
      controlSections: rootSections.filter(isControlSection),
      contentSections: rootSections.filter((s) => !isControlSection(s)),
    };
  }, [section.sections]);

  const bodyClassName = 'flex min-h-0 min-w-0 flex-1 flex-col overflow-auto';

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col"
      data-node-density={context.layout.density}
      data-node-overflow={context.layout.overflow}
      data-node-shell-presentation={presentation}
      data-node-content-chrome={contentChrome}
    >
      <NodeHeader
        tagLabel={tagLabel}
        tagColor={tagColor}
        title={title}
        badges={badges}
        collapsible={true}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        onOpenPreview={assetInfo ? handleOpenPreview : undefined}
        onExpand={presentation === 'foundational' ? undefined : () => openContentOverlay(node.id)}
        presentation={presentation}
      />
      {!isCollapsed && (
        <div className={bodyClassName} data-node-drag-block="true">
          {presentation === 'structured' && (
            <ContainerActionBar
              node={node}
              allNodes={context.allNodes}
              selectedNodeIds={context.selectedNodeIds}
              isSelected={context.isSelected}
            />
          )}
          {controlSections.length > 0 && (
            <div style={{ borderBottom: '1px solid var(--node-divider)' }}>
              {controlSections.map((s) => (
                <ContainerRenderer
                  key={s.id}
                  section={s}
                  context={{ ...context, contentChrome, depth: context.depth + 1 }}
                />
              ))}
            </div>
          )}
          <ContainerRenderer
            section={{
              ...section,
              sections: contentSections.length > 0 ? contentSections : undefined,
            }}
            context={{ ...context, contentChrome }}
          />
        </div>
      )}
    </div>
  );
}

function isControlSection(section: ContainerSection): boolean {
  return section.visibleWhen === 'selected' && section.layout === 'row';
}

function resolveNodeHeaderBadges(
  node: NodeShellProps['context']['node'],
  previewBadges: NodeHeaderBadge[],
): NodeHeaderBadge[] {
  switch (node.type) {
    case 'shot':
      return localizeShotGenerationBadges(node, previewBadges);
    case 'scene':
      return [
        {
          label: t('scene.shotCountCompact', { count: node.container?.childIds.length ?? 0 }),
          tone: 'info',
        },
      ];
    case 'gallery':
      return [
        {
          label: t('gallery.viewCountCompact', { count: node.container?.childIds.length ?? 0 }),
          tone: 'info',
        },
      ];
    default:
      return previewBadges;
  }
}

function localizeShotGenerationBadges(
  node: NodeShellProps['context']['node'],
  previewBadges: NodeHeaderBadge[],
): NodeHeaderBadge[] {
  const generationStatus = readShotGenerationStatus(node);
  if (!generationStatus) return previewBadges;
  return previewBadges.map((badge) =>
    badge.label === generationStatus
      ? { ...badge, label: resolveCanvasStatusLabel(generationStatus) }
      : badge,
  );
}

function readShotGenerationStatus(node: NodeShellProps['context']['node']): string | undefined {
  const data = node.data as Record<string, unknown> | undefined;
  const value = data?.['generationStatus'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

interface NodeAssetInfo {
  assetPath: string;
  mediaType?: string;
  documentResourceRef?: DocumentArchiveResourceRef;
  resourceRef?: ResourceRef;
}

function getNodeAssetInfo(node: NodeShellProps['context']['node']): NodeAssetInfo | undefined {
  const data = node.data as Record<string, unknown> | undefined;
  if (!data) return undefined;

  const assetPath = data['runtimeAssetPath'] ?? data['assetPath'];
  if (typeof assetPath === 'string' && assetPath) {
    const mediaType = data['mediaType'];
    const documentResourceRef = readDocumentResourceRef(node);
    const resourceRef = readResourceRef(node);
    return {
      assetPath,
      mediaType: typeof mediaType === 'string' ? mediaType : undefined,
      ...(documentResourceRef ? { documentResourceRef } : {}),
      ...(resourceRef ? { resourceRef } : {}),
    };
  }

  return undefined;
}

const NODE_TYPE_I18N_KEY: Partial<Record<string, string>> = {
  annotation: 'node.note',
  scene: 'node.sceneGroup',
  text: 'node.newText',
  'canvas-embed': 'node.canvasEmbed',
};

function resolveNodeTitle(
  node: NodeShellProps['context']['node'],
  previewTitle: string | undefined,
): string {
  const resourceRef = readResourceRef(node);
  if (resourceRef) {
    return resolveResourceRefDisplayName(resourceRef);
  }
  if (previewTitle) {
    return extractFilename(previewTitle);
  }
  const key = NODE_TYPE_I18N_KEY[node.type] ?? `node.${node.type}`;
  return t(key) || node.id;
}

function extractFilename(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
}
