import { useMemo, useState } from 'react';
import { TreeView, toCodiconClassName, type TreeViewItem } from '@neko/ui';
import { useTranslation } from '../../i18n/I18nContext';
import type { ModelPreviewNode } from '../threeRuntime';

export interface ModelScenePanelProps {
  readonly nodes: readonly ModelPreviewNode[];
  readonly selectedNodePath?: string;
  readonly disabled: boolean;
  readonly onSelectNode: (nodePath: string) => void;
}

export function ModelScenePanel({
  disabled,
  nodes,
  onSelectNode,
  selectedNodePath,
}: ModelScenePanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const items = useMemo(() => buildModelNodeTree(nodes, query), [nodes, query]);

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
          <h2>{t('preview.model.scene')}</h2>
        </div>
        <span className="model-preview__count" aria-label={`${nodes.length}`}>
          {nodes.length}
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
          placeholder={t('preview.model.searchNodes')}
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
          selectedIds={selectedNodePath ? [selectedNodePath] : []}
          showStaticStateIndicators={false}
          virtualization={{ enabled: true, threshold: 120, itemHeight: 26 }}
          onSelect={(nodePath) => onSelectNode(nodePath)}
        />
      ) : (
        <p className="model-preview__empty">{t('preview.model.noMatchingNodes')}</p>
      )}
    </aside>
  );
}

function buildModelNodeTree(
  nodes: readonly ModelPreviewNode[],
  query: string,
): readonly TreeViewItem[] {
  const byParent = new Map<string | undefined, ModelPreviewNode[]>();
  for (const node of nodes) {
    const separator = node.path.lastIndexOf('/');
    const parentPath = separator >= 0 ? node.path.slice(0, separator) : undefined;
    const children = byParent.get(parentPath) ?? [];
    children.push(node);
    byParent.set(parentPath, children);
  }
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const build = (node: ModelPreviewNode): TreeViewItem | undefined => {
    const children = (byParent.get(node.path) ?? [])
      .map(build)
      .filter((item): item is TreeViewItem => item !== undefined);
    const matches =
      normalizedQuery.length === 0 || node.label.toLocaleLowerCase().includes(normalizedQuery);
    if (!matches && children.length === 0) return undefined;
    return {
      id: node.path,
      label: node.label,
      icon: (
        <span
          className={toCodiconClassName(node.mesh ? 'symbol-misc' : 'symbol-namespace')}
          aria-hidden="true"
        />
      ),
      expanded: normalizedQuery.length > 0 || node.path === 'root',
      ...(children.length > 0 ? { children } : {}),
    };
  };
  return (byParent.get(undefined) ?? [])
    .map(build)
    .filter((item): item is TreeViewItem => item !== undefined);
}
