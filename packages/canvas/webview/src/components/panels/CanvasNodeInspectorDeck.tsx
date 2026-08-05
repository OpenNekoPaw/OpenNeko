import type { CanvasNode } from '@neko/canvas-domain';
import { RetainedSurfaceDeck } from '@neko/ui/workbench';
import type { ReactElement } from 'react';
import type { CanvasNodeChildCatalog } from '../../node-lifecycle';
import { PropertyPanel, type PropertyPanelProps } from './PropertyPanel';

export interface CanvasNodeInspectorDeckProps extends Pick<
  PropertyPanelProps,
  'onDeleteNode' | 'onToggleLock' | 'onUpdateNode' | 'onUpdateNodeData' | 'onUpdatePorts'
> {
  readonly catalog: CanvasNodeChildCatalog;
  readonly nodes: readonly CanvasNode[];
}

export function CanvasNodeInspectorDeck({
  catalog,
  nodes,
  onDeleteNode,
  onToggleLock,
  onUpdateNode,
  onUpdateNodeData,
  onUpdatePorts,
}: CanvasNodeInspectorDeckProps): ReactElement {
  return (
    <RetainedSurfaceDeck
      items={catalog.children.filter((child) => child.kind === 'inspector')}
      activeId={catalog.activeInspectorId}
      getId={(child) => child.childId}
      getLifecycle={(child) => child.lifecycle}
      itemIdentityAttribute="data-canvas-node-child-instance"
      renderItem={(child) => {
        if (child.kind !== 'inspector') {
          throw new Error(`Canvas child '${child.childId}' is not an inspector.`);
        }
        const node = nodes.find((candidate) => candidate.id === child.nodeId);
        if (!node) throw new Error(`Canvas inspector node '${child.nodeId}' is unavailable.`);
        return (
          <PropertyPanel
            selectedNodes={[node]}
            onUpdateNode={onUpdateNode}
            onUpdateNodeData={onUpdateNodeData}
            onUpdatePorts={onUpdatePorts}
            onDeleteNode={onDeleteNode}
            onToggleLock={onToggleLock}
          />
        );
      }}
    />
  );
}
