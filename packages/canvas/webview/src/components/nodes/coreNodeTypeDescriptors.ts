import type { NodeTypeDescriptorRegistry } from './nodeTypeDescriptor';

export function createCoreNodeTypeDescriptors(): NodeTypeDescriptorRegistry {
  return {
    markdown: {
      type: 'markdown',
      labelKey: 'node.markdown',
      icon: 'M',
      tagLabel: 'MD',
      tagColor: '#0891b2',
      defaultSize: { width: 320, height: 220 },
      presentation: 'foundational',
      fullscreenPresentation: 'text-document',
    },
    media: {
      type: 'media',
      labelKey: 'node.media',
      icon: 'Media',
      tagLabel: 'MEDIA',
      tagColor: '#2563eb',
      defaultSize: { width: 300, height: 220 },
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
      defaultSize: { width: 420, height: 300 },
      presentation: 'spatial-container',
    },
    job: {
      type: 'job',
      labelKey: 'node.job',
      icon: 'Job',
      tagLabel: 'JOB',
      tagColor: '#7c3aed',
      defaultSize: { width: 320, height: 190 },
      presentation: 'foundational',
    },
    file: {
      type: 'file',
      labelKey: 'node.file',
      icon: 'File',
      tagLabel: 'FILE',
      tagColor: '#475569',
      defaultSize: { width: 280, height: 180 },
      presentation: 'foundational',
    },
    'canvas-embed': {
      type: 'canvas-embed',
      labelKey: 'node.canvasEmbed',
      icon: 'Canvas',
      tagLabel: 'CANVAS',
      tagColor: '#0f766e',
      defaultSize: { width: 280, height: 200 },
      presentation: 'foundational',
    },
    generation: {
      type: 'generation',
      labelKey: 'node.generation',
      icon: 'AI',
      tagLabel: 'GEN',
      tagColor: '#0f766e',
      defaultSize: { width: 320, height: 420 },
      presentation: 'foundational',
    },
  };
}
