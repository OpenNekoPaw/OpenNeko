import type {
  ArtboardCanvasNode,
  CanvasEmbedCanvasNode,
  DocumentCanvasNode,
  GroupCanvasNode,
  ModelCanvasNode,
  ScriptCanvasNode,
  StoryboardCanvasNode,
} from '@neko/shared';
import { ArtboardNode } from '../../components/nodes/ArtboardNode';
import { CanvasEmbedNode } from '../../components/nodes/CanvasEmbedNode';
import { DocumentNode } from '../../components/nodes/DocumentNode';
import { GroupNode } from '../../components/nodes/GroupNode';
import { ModelNode } from '../../components/nodes/ModelNode';
import { ScriptNode } from '../../components/nodes/ScriptNode';
import { StoryboardNode } from '../../components/nodes/StoryboardNode';
import type { NodeRendererRegistry } from '../../components/nodes/nodeRendererTypes';

export function createStoryboardNodeRendererRegistry(): NodeRendererRegistry {
  return {
    storyboard: ({ node, ...commonProps }) => (
      <StoryboardNode key={node.id} node={node as StoryboardCanvasNode} {...commonProps} />
    ),
    artboard: ({ node, ...commonProps }) => (
      <ArtboardNode key={node.id} node={node as ArtboardCanvasNode} {...commonProps} />
    ),
    group: ({ node, allNodes, ...commonProps }) => (
      <GroupNode
        key={node.id}
        node={node as GroupCanvasNode}
        allNodes={allNodes}
        {...commonProps}
      />
    ),
    script: ({
      node,
      onScriptLoadScenes,
      scriptIndexState,
      onScriptOpen,
      onScriptNavigateToScene,
      ...commonProps
    }) => (
      <ScriptNode
        key={node.id}
        node={node as ScriptCanvasNode}
        {...commonProps}
        onLoadScenes={onScriptLoadScenes}
        indexState={scriptIndexState}
        onOpenScript={onScriptOpen}
        onNavigateToScene={onScriptNavigateToScene}
      />
    ),
    document: ({
      node,
      onDocumentOpen,
      onDocumentLoadText,
      documentTextProjection,
      ...commonProps
    }) => (
      <DocumentNode
        key={node.id}
        node={node as DocumentCanvasNode}
        {...commonProps}
        onOpenDocument={onDocumentOpen}
        onLoadText={onDocumentLoadText}
        textProjection={documentTextProjection}
      />
    ),
    'canvas-embed': ({ node, onCanvasEmbedOpen, ...commonProps }) => (
      <CanvasEmbedNode
        key={node.id}
        node={node as CanvasEmbedCanvasNode}
        {...commonProps}
        onOpenCanvas={onCanvasEmbedOpen}
      />
    ),
    model: ({ node, onModelCheckInstalled, ...commonProps }) => (
      <ModelNode
        key={node.id}
        node={node as ModelCanvasNode}
        {...commonProps}
        onCheckInstalled={onModelCheckInstalled}
      />
    ),
  };
}
