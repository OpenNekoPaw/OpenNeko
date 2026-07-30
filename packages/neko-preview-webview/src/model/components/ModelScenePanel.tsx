import { useMemo, useState } from 'react';
import {
  TreeView,
  toCodiconClassName,
  type CodiconName,
  type TreeViewAction,
  type TreeViewItem,
} from '@neko/ui';
import type { ModelPreviewStagingState } from '@neko/shared';
import { useTranslation } from '../../i18n/I18nContext';
import {
  modelSceneSelectionId,
  parseModelSceneSelection,
  type ModelSceneSelection,
} from '../modelSceneSelection';
import type { ModelPreviewNode } from '../threeRuntime';

export type ModelCameraRowAction = 'edit' | 'duplicate' | 'view' | 'remove';

export interface ModelScenePanelProps {
  readonly nodes: readonly ModelPreviewNode[];
  readonly staging?: ModelPreviewStagingState;
  readonly selection: ModelSceneSelection;
  readonly disabled: boolean;
  readonly onSelectionChange: (selection: ModelSceneSelection) => void;
  readonly onCameraAction: (cameraId: string, action: ModelCameraRowAction) => void;
}

export function ModelScenePanel({
  disabled,
  nodes,
  onCameraAction,
  onSelectionChange,
  selection,
  staging,
}: ModelScenePanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const items = useMemo(
    () => buildModelSceneTree(nodes, staging, query, t),
    [nodes, query, staging, t],
  );

  return (
    <aside
      className="model-preview__scene-panel"
      data-testid="model-preview-scene-panel"
      aria-label={t('preview.model.scene')}
    >
      <header className="model-preview__panel-header">
        <div className="model-preview__panel-title">
          <span
            className={`model-preview__panel-icon ${toCodiconClassName('symbol-structure')}`}
            aria-hidden="true"
          />
          <h2>{t('preview.model.hierarchy')}</h2>
        </div>
        <span
          className="model-preview__count"
          aria-label={`${nodes.length + (staging?.cameraPresets.length ?? 0) + (staging?.lightRig.lights.length ?? 0) + 1}`}
        >
          {nodes.length +
            (staging?.cameraPresets.length ?? 0) +
            (staging?.lightRig.lights.length ?? 0) +
            1}
        </span>
      </header>
      <div className="model-preview__search">
        <span className={toCodiconClassName('search')} aria-hidden="true" />
        <label className="model-preview__sr-only" htmlFor="model-preview-node-search">
          {t('preview.model.searchNodes')}
        </label>
        <input
          id="model-preview-node-search"
          aria-label={t('preview.model.searchNodes')}
          disabled={disabled}
          placeholder={t('preview.model.searchHierarchy')}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {query.length > 0 ? (
          <button
            className="model-preview__search-clear"
            type="button"
            aria-label={t('preview.model.clearSearch')}
            disabled={disabled}
            onClick={() => setQuery('')}
          >
            <span className={toCodiconClassName('close')} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {items.length > 0 ? (
        <TreeView
          className="model-preview__tree"
          items={items}
          label={t('preview.model.nodeHierarchy')}
          selectedIds={[modelSceneSelectionId(selection)]}
          showStaticStateIndicators={false}
          virtualization={{ enabled: true, threshold: 120, itemHeight: 30 }}
          onAction={(id, actionId) => {
            const target = parseModelSceneSelection(id);
            if (target?.kind === 'camera' && isCameraRowAction(actionId)) {
              onCameraAction(target.cameraId, actionId);
            }
          }}
          onSelect={(id) => {
            const nextSelection = parseModelSceneSelection(id);
            if (nextSelection) onSelectionChange(nextSelection);
          }}
        />
      ) : (
        <p className="model-preview__empty">{t('preview.model.noMatchingNodes')}</p>
      )}
    </aside>
  );
}

function buildModelSceneTree(
  nodes: readonly ModelPreviewNode[],
  staging: ModelPreviewStagingState | undefined,
  query: string,
  t: ReturnType<typeof useTranslation>['t'],
): readonly TreeViewItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (label: string): boolean =>
    normalizedQuery.length === 0 || label.toLocaleLowerCase().includes(normalizedQuery);
  const cameraItems = (staging?.cameraPresets ?? [])
    .filter((camera) => matches(camera.label))
    .map((camera): TreeViewItem => ({
      id: modelSceneSelectionId({ kind: 'camera', cameraId: camera.id }),
      label: camera.label,
      description:
        camera.id === staging?.activeCameraId ? t('preview.model.cameraActive') : undefined,
      icon: icon('device-camera'),
      actions: cameraActions(staging?.cameraPresets.length === 1, t),
    }));
  const characterItems = buildCharacterItems(nodes, normalizedQuery);
  const lightItems = (staging?.lightRig.lights ?? [])
    .map((light, index) => ({ light, label: lightLabel(light.id, index, t) }))
    .filter(({ label }) => matches(label))
    .map(({ light, label }): TreeViewItem => ({
      id: modelSceneSelectionId({ kind: 'light', lightId: light.id }),
      label,
      icon: icon('lightbulb'),
    }));
  const sceneLabel = t('preview.model.sceneSettings');
  const items: TreeViewItem[] = [];
  if (matches(sceneLabel)) {
    items.push({
      id: modelSceneSelectionId({ kind: 'scene' }),
      label: sceneLabel,
      icon: icon('symbol-namespace'),
    });
  }
  if (cameraItems.length > 0 || normalizedQuery.length === 0) {
    items.push({
      id: 'model-group:cameras',
      label: t('preview.model.cameras'),
      description: `${staging?.cameraPresets.length ?? 0}`,
      icon: icon('device-camera'),
      expanded: true,
      children: cameraItems,
    });
  }
  if (lightItems.length > 0 || normalizedQuery.length === 0) {
    items.push({
      id: 'model-group:lights',
      label: t('preview.model.lights'),
      description: `${staging?.lightRig.lights.length ?? 0}`,
      icon: icon('lightbulb'),
      expanded: true,
      children: lightItems,
    });
  }
  if (characterItems.length > 0 || normalizedQuery.length === 0) {
    items.push({
      id: 'model-group:characters',
      label: t('preview.model.characters'),
      description: `${characterItems.length}`,
      icon: icon('person'),
      expanded: true,
      children: characterItems,
    });
  }
  return items;
}

function lightLabel(
  lightId: string,
  index: number,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  if (lightId === 'key' || lightId === 'fill' || lightId === 'rim') {
    return t(`preview.model.light.${lightId}`);
  }
  return t('preview.model.light.custom', { index: index + 1 });
}

function buildCharacterItems(
  nodes: readonly ModelPreviewNode[],
  normalizedQuery: string,
): readonly TreeViewItem[] {
  const byParent = new Map<string | undefined, ModelPreviewNode[]>();
  for (const node of nodes) {
    const separator = node.path.lastIndexOf('/');
    const parentPath = separator >= 0 ? node.path.slice(0, separator) : undefined;
    const children = byParent.get(parentPath) ?? [];
    children.push(node);
    byParent.set(parentPath, children);
  }
  const build = (node: ModelPreviewNode): TreeViewItem | undefined => {
    const children = (byParent.get(node.path) ?? [])
      .map(build)
      .filter((item): item is TreeViewItem => item !== undefined);
    const matches =
      normalizedQuery.length === 0 || node.label.toLocaleLowerCase().includes(normalizedQuery);
    if (!matches && children.length === 0) return undefined;
    return {
      id: modelSceneSelectionId({ kind: 'node', nodePath: node.path }),
      label: node.label,
      icon: icon(node.mesh ? 'symbol-misc' : 'person'),
      expanded: normalizedQuery.length > 0,
      ...(children.length > 0 ? { children } : {}),
    };
  };
  const syntheticRoot = nodes.find((node) => node.path === 'root');
  const roots = syntheticRoot
    ? (byParent.get('root') ?? [syntheticRoot])
    : (byParent.get(undefined) ?? []);
  return roots.map(build).filter((item): item is TreeViewItem => item !== undefined);
}

function cameraActions(
  onlyCamera: boolean,
  t: ReturnType<typeof useTranslation>['t'],
): readonly TreeViewAction[] {
  return [
    { id: 'edit', label: t('preview.model.cameraEdit'), icon: icon('edit') },
    { id: 'duplicate', label: t('preview.model.cameraDuplicate'), icon: icon('copy') },
    { id: 'view', label: t('preview.model.cameraViewThrough'), icon: icon('eye') },
    {
      id: 'remove',
      label: t('preview.model.cameraRemove'),
      icon: icon('trash'),
      disabled: onlyCamera,
      danger: true,
    },
  ];
}

function icon(name: CodiconName): React.JSX.Element {
  return <span className={toCodiconClassName(name)} aria-hidden="true" />;
}

function isCameraRowAction(value: string): value is ModelCameraRowAction {
  return value === 'edit' || value === 'duplicate' || value === 'view' || value === 'remove';
}
