import { CanvasEmbedNode } from './CanvasEmbedNode';
import { FileNode, JobNode, MarkdownNode, MediaNode } from './CanonicalContentNodes';
import { GroupNode } from './GroupNode';
import type { NodeRendererRegistry } from './nodeRendererTypes';

export function createCoreNodeRendererRegistry(): NodeRendererRegistry {
  return {
    markdown: (context) => {
      if (context.node.type !== 'markdown') {
        throw new Error(`Markdown renderer received node type "${context.node.type}".`);
      }
      return <MarkdownNode key={context.node.id} {...context} node={context.node} />;
    },
    media: (context) => {
      if (context.node.type !== 'media') {
        throw new Error(`Media renderer received node type "${context.node.type}".`);
      }
      return <MediaNode key={context.node.id} {...context} node={context.node} />;
    },
    group: ({ node, allNodes, ...commonProps }) => {
      if (node.type !== 'group') {
        throw new Error(`Core Group renderer received node type "${node.type}".`);
      }
      return <GroupNode key={node.id} node={node} allNodes={allNodes} {...commonProps} />;
    },
    job: (context) => {
      if (context.node.type !== 'job') {
        throw new Error(`Job renderer received node type "${context.node.type}".`);
      }
      return <JobNode key={context.node.id} {...context} node={context.node} />;
    },
    file: (context) => {
      if (context.node.type !== 'file') {
        throw new Error(`File renderer received node type "${context.node.type}".`);
      }
      return (
        <FileNode
          key={context.node.id}
          {...context}
          node={context.node}
          onOpen={context.onDocumentOpen}
        />
      );
    },
    'canvas-embed': (context) => {
      if (context.node.type !== 'canvas-embed') {
        throw new Error(`CanvasEmbed renderer received node type "${context.node.type}".`);
      }
      return (
        <CanvasEmbedNode
          key={context.node.id}
          {...context}
          node={context.node}
          onOpenCanvas={context.onCanvasEmbedOpen}
        />
      );
    },
  };
}
