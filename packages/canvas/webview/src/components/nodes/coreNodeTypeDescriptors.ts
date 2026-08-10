import { CANVAS_NODE_DEFAULT_SIZES } from '@neko/canvas-domain';
import type { NodeTypeDescriptorRegistry } from './nodeTypeDescriptor';

export function createCoreNodeTypeDescriptors(): NodeTypeDescriptorRegistry {
  return {
    markdown: {
      type: 'markdown',
      labelKey: 'node.markdown',
      icon: 'M',
      tagLabel: 'MD',
      tagColor: '#0891b2',
      defaultSize: CANVAS_NODE_DEFAULT_SIZES.markdown,
      presentation: 'foundational',
      fullscreenPresentation: 'text-document',
    },
    media: {
      type: 'media',
      labelKey: 'node.media',
      icon: 'Media',
      tagLabel: 'MEDIA',
      tagColor: '#2563eb',
      defaultSize: CANVAS_NODE_DEFAULT_SIZES.media,
      presentation: 'foundational',
      fullscreenPresentation: (node) =>
        node.type === 'media' && node.data.mediaType === 'image' ? 'image-viewer' : 'visual-stage',
    },
    group: {
      type: 'group',
      labelKey: 'node.group',
      icon: 'Group',
      tagLabel: 'GROUP',
      tagColor: '#64748b',
      defaultSize: CANVAS_NODE_DEFAULT_SIZES.group,
      presentation: 'spatial-container',
    },
    job: {
      type: 'job',
      labelKey: 'node.job',
      icon: 'Job',
      tagLabel: 'JOB',
      tagColor: '#7c3aed',
      defaultSize: CANVAS_NODE_DEFAULT_SIZES.job,
      presentation: 'foundational',
    },
    file: {
      type: 'file',
      labelKey: 'node.file',
      icon: 'File',
      tagLabel: 'FILE',
      tagColor: '#475569',
      defaultSize: CANVAS_NODE_DEFAULT_SIZES.file,
      presentation: 'foundational',
    },
    'canvas-embed': {
      type: 'canvas-embed',
      labelKey: 'node.canvasEmbed',
      icon: 'Canvas',
      tagLabel: 'CANVAS',
      tagColor: '#0f766e',
      defaultSize: CANVAS_NODE_DEFAULT_SIZES['canvas-embed'],
      presentation: 'foundational',
    },
    generation: {
      type: 'generation',
      labelKey: 'node.generation',
      icon: 'AI',
      tagLabel: 'GEN',
      tagColor: '#0f766e',
      defaultSize: CANVAS_NODE_DEFAULT_SIZES.generation,
      presentation: 'foundational',
    },
  };
}
