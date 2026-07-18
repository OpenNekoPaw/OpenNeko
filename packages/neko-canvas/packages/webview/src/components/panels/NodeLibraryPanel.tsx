import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasNodeType, CanvasSubsystemManifest } from '@neko/shared';
import { TreeView } from '@neko/ui/creative';
import { toCodiconClassName } from '@neko/ui/icons';
import { t } from '../../i18n';
import { writeNodeLibraryDragPayload } from '../../utils/nodeLibraryDrag';
import {
  getNodeLibraryCreationPolicy,
  isNodeLibraryFileBoundType,
  isNodeLibraryVisibleCreateType,
} from '../../utils/nodeLibraryPolicy';
import type { NodeTypeDescriptorRegistry } from '../nodes/nodeTypeDescriptor';
import {
  createCanvasNodeLibraryIcon,
  mapCanvasNodeLibraryGroupToTreeItems,
} from '../adapters/sharedCanvasUiAdapter';

export interface NodeLibraryPanelProps {
  coreDescriptors: NodeTypeDescriptorRegistry;
  subsystemManifests: readonly CanvasSubsystemManifest[];
  nodeTypeDescriptors?: NodeTypeDescriptorRegistry;
  activeSubsystemIds?: readonly string[];
  onCreateNode: (type: CanvasNodeType) => void;
  onPickNodeSource?: (type: CanvasNodeType) => void;
  onLoadSubsystem?: (subsystemId: CanvasSubsystemManifest['id']) => void;
}

export interface NodeLibraryGroup {
  id: string;
  label: string;
  nodeTypes: readonly CanvasNodeType[];
  presentation: 'node-entries' | 'source-actions';
  subsystemId?: CanvasSubsystemManifest['id'];
}

const FILE_REFERENCE_GROUP_ID = 'file-references';
const NODE_LIBRARY_ITEM_HEIGHT = 28;

export function NodeLibraryPanel({
  coreDescriptors,
  subsystemManifests,
  nodeTypeDescriptors = {},
  activeSubsystemIds = [],
  onCreateNode,
  onPickNodeSource,
  onLoadSubsystem,
}: NodeLibraryPanelProps) {
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(['core', 'storyboard', FILE_REFERENCE_GROUP_ID]),
  );
  const requestedSubsystemIdsRef = useRef<Set<CanvasSubsystemManifest['id']>>(new Set());

  const groups = useMemo(
    () => createNodeLibraryGroups(coreDescriptors, subsystemManifests),
    [coreDescriptors, subsystemManifests],
  );

  const descriptors = useMemo(
    () => ({ ...coreDescriptors, ...nodeTypeDescriptors }),
    [coreDescriptors, nodeTypeDescriptors],
  );

  const requestSubsystemLoad = useCallback(
    (subsystemId: CanvasSubsystemManifest['id']) => {
      requestSubsystemLoadOnce(requestedSubsystemIdsRef.current, subsystemId, onLoadSubsystem);
    },
    [onLoadSubsystem],
  );

  useEffect(() => {
    for (const group of groups) {
      if (group.subsystemId && expandedGroupIds.has(group.id)) {
        requestSubsystemLoad(group.subsystemId);
      }
    }
  }, [expandedGroupIds, groups, requestSubsystemLoad]);

  return (
    <div className="canvas-node-library-panel flex h-full w-full min-w-0 flex-col overflow-hidden">
      <div className="canvas-node-library-header flex h-9 items-center px-3 text-xs font-semibold">
        {t('library.title')}
      </div>
      <div className="canvas-node-library-scroll flex-1 overflow-y-auto">
        {groups.map((group) => {
          const isExpanded = expandedGroupIds.has(group.id);
          const treeItems =
            group.presentation === 'node-entries'
              ? mapCanvasNodeLibraryGroupToTreeItems({ descriptors, group })
              : [];
          const groupActive =
            group.subsystemId === undefined || activeSubsystemIds.includes(group.subsystemId);
          const groupState = group.subsystemId ? (groupActive ? 'active' : 'available') : 'core';
          return (
            <section
              key={group.id}
              className="canvas-node-library-section"
              data-node-library-group-id={group.id}
              data-node-library-section-state={groupState}
            >
              <button
                type="button"
                aria-expanded={isExpanded}
                className="canvas-node-library-group flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--vscode-focusBorder)]"
                data-node-library-group-expanded={isExpanded ? 'true' : 'false'}
                style={{
                  color: 'var(--toolbar-fg)',
                }}
                onClick={() => {
                  setExpandedGroupIds((current) => {
                    const next = new Set(current);
                    if (next.has(group.id)) {
                      next.delete(group.id);
                    } else {
                      next.add(group.id);
                      if (group.subsystemId) {
                        requestSubsystemLoad(group.subsystemId);
                      }
                    }
                    return next;
                  });
                }}
              >
                <span
                  aria-hidden="true"
                  className={toCodiconClassName(isExpanded ? 'chevron-down' : 'chevron-right')}
                />
                <span className="canvas-node-library-section-title min-w-0 flex-1 truncate">
                  {group.label}
                </span>
                <span
                  className="canvas-node-library-count"
                  aria-label={`${group.nodeTypes.length}`}
                >
                  {group.nodeTypes.length}
                </span>
                {group.subsystemId && (
                  <span
                    className="canvas-node-library-subsystem-badge"
                    data-node-library-subsystem-state={groupActive ? 'active' : 'available'}
                  >
                    {groupActive ? t('library.active') : t('library.available')}
                  </span>
                )}
              </button>

              {isExpanded && (
                <div className="canvas-node-library-items">
                  {group.presentation === 'node-entries' ? (
                    <TreeView
                      className="border-0 bg-transparent"
                      height={Math.min(
                        320,
                        Math.max(
                          NODE_LIBRARY_ITEM_HEIGHT,
                          treeItems.length * NODE_LIBRARY_ITEM_HEIGHT,
                        ),
                      )}
                      items={treeItems}
                      label={group.label}
                      showStaticStateIndicators={false}
                      virtualization={{ itemHeight: NODE_LIBRARY_ITEM_HEIGHT, threshold: 200 }}
                      onDragStart={(id, event) => {
                        const nodeType = id as CanvasNodeType;
                        const creationPolicy = getNodeLibraryCreationPolicy(nodeType);
                        if (group.subsystemId) {
                          requestSubsystemLoad(group.subsystemId);
                        }
                        if (!creationPolicy.canDragToCreate || !event.dataTransfer) {
                          event.preventDefault();
                          return;
                        }
                        writeNodeLibraryDragPayload(event.dataTransfer, nodeType);
                      }}
                      onSelect={(id) => {
                        const nodeType = id as CanvasNodeType;
                        const creationPolicy = getNodeLibraryCreationPolicy(nodeType);
                        if (group.subsystemId) {
                          requestSubsystemLoad(group.subsystemId);
                        }
                        if (creationPolicy.kind === 'create') {
                          onCreateNode(nodeType);
                          return;
                        }
                        if (creationPolicy.requiresSourceAdd) {
                          onPickNodeSource?.(nodeType);
                        }
                      }}
                    />
                  ) : (
                    <div className="canvas-node-library-source-actions">
                      {group.nodeTypes.map((nodeType) => {
                        const descriptor = descriptors[nodeType];
                        const nodeLabel = resolveNodeLibraryLabel(nodeType, descriptor);
                        const actionLabel = t('library.action.create', { node: nodeLabel });
                        const pickerLabel = t('library.action.pickFile', { node: nodeLabel });
                        return (
                          <button
                            key={nodeType}
                            type="button"
                            className="canvas-node-library-source-action"
                            data-node-library-source-action={nodeType}
                            aria-label={pickerLabel}
                            title={pickerLabel}
                            disabled={!onPickNodeSource}
                            onClick={() => onPickNodeSource?.(nodeType)}
                          >
                            {createCanvasNodeLibraryIcon(nodeType, descriptor?.tagColor)}
                            <span className="min-w-0 flex-1 truncate">{actionLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function createNodeLibraryGroups(
  coreDescriptors: NodeTypeDescriptorRegistry,
  subsystemManifests: readonly CanvasSubsystemManifest[],
): readonly NodeLibraryGroup[] {
  const coreNodeTypes = Object.keys(coreDescriptors) as CanvasNodeType[];
  const fileReferenceNodeTypes: CanvasNodeType[] = [];
  const fileReferenceNodeTypeSet = new Set<CanvasNodeType>();

  const collectVisibleNodeTypes = (nodeTypes: readonly CanvasNodeType[]): CanvasNodeType[] =>
    nodeTypes.filter((nodeType) => {
      if (isNodeLibraryFileBoundType(nodeType)) {
        if (!fileReferenceNodeTypeSet.has(nodeType)) {
          fileReferenceNodeTypeSet.add(nodeType);
          fileReferenceNodeTypes.push(nodeType);
        }
        return false;
      }
      return isNodeLibraryVisibleCreateType(nodeType);
    });

  const groups: NodeLibraryGroup[] = [];
  const coreVisibleNodeTypes = collectVisibleNodeTypes(coreNodeTypes);
  if (coreVisibleNodeTypes.length > 0) {
    groups.push({
      id: 'core',
      label: t('library.basic'),
      nodeTypes: coreVisibleNodeTypes,
      presentation: 'node-entries',
    });
  }

  for (const manifest of subsystemManifests) {
    const visibleNodeTypes = collectVisibleNodeTypes(manifest.triggerNodeTypes);
    if (visibleNodeTypes.length === 0) {
      continue;
    }
    groups.push({
      id: manifest.id,
      label: t(`library.group.${manifest.id}`),
      nodeTypes: visibleNodeTypes,
      presentation: 'node-entries',
      subsystemId: manifest.id,
    });
  }

  if (fileReferenceNodeTypes.length > 0) {
    groups.push({
      id: FILE_REFERENCE_GROUP_ID,
      label: t('library.group.fileReferences'),
      nodeTypes: fileReferenceNodeTypes,
      presentation: 'source-actions',
    });
  }

  return groups;
}

const NODE_TYPE_LABEL_KEY_FALLBACK: Partial<Record<CanvasNodeType, string>> = {
  annotation: 'node.note',
  text: 'toolbar.text',
  scene: 'node.sceneGroup',
  'canvas-embed': 'node.canvasEmbed',
  'narrative-start': 'node.narrativeStart',
  'narrative-scene': 'node.narrativeScene',
  'narrative-note': 'node.narrativeNote',
  'narrative-ending': 'node.narrativeEnding',
  'representation-slot': 'node.representationSlot',
  'generated-asset': 'node.generatedAsset',
};

export function resolveNodeLibraryLabel(
  nodeType: CanvasNodeType,
  descriptor?: NodeTypeDescriptorRegistry[CanvasNodeType],
): string {
  const key = descriptor?.labelKey ?? NODE_TYPE_LABEL_KEY_FALLBACK[nodeType] ?? `node.${nodeType}`;
  const label = t(key);
  return label === key ? nodeType : label;
}

export function requestSubsystemLoadOnce(
  requestedSubsystemIds: Set<CanvasSubsystemManifest['id']>,
  subsystemId: CanvasSubsystemManifest['id'],
  onLoadSubsystem?: (subsystemId: CanvasSubsystemManifest['id']) => void,
): boolean {
  if (requestedSubsystemIds.has(subsystemId)) {
    return false;
  }
  requestedSubsystemIds.add(subsystemId);
  onLoadSubsystem?.(subsystemId);
  return true;
}
