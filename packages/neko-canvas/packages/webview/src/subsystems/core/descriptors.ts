import type { NodeTypeDescriptorRegistry } from '../../components/nodes/nodeTypeDescriptor';

export function createCoreNodeTypeDescriptors(): NodeTypeDescriptorRegistry {
  return {
    media: {
      type: 'media',
      labelKey: 'node.media',
      icon: '\u{1F5BC}\u{FE0F}',
      tagLabel: 'MEDIA',
      tagColor: '#3b82f6',
      defaultSize: { width: 280, height: 200 },
      presentation: 'foundational',
      fullscreenPresentation: (node) =>
        node.type === 'media' && node.data.mediaType === 'image' ? 'image-viewer' : 'visual-stage',
    },
    annotation: {
      type: 'annotation',
      labelKey: 'toolbar.annotation',
      icon: '\u{1F4DD}',
      tagLabel: 'NOTE',
      tagColor: '#eab308',
      defaultSize: { width: 200, height: 100 },
      presentation: 'foundational',
      fullscreenPresentation: 'text-document',
    },
    group: {
      type: 'group',
      labelKey: 'node.group',
      icon: '\u{1F4C1}',
      tagLabel: 'GROUP',
      tagColor: '#6b7280',
      defaultSize: { width: 320, height: 220 },
      presentation: 'spatial-container',
    },
    text: {
      type: 'text',
      labelKey: 'toolbar.text',
      icon: '\u{1F524}',
      tagLabel: 'TEXT',
      tagColor: '#06b6d4',
      defaultSize: { width: 260, height: 120 },
      presentation: 'foundational',
      fullscreenPresentation: 'text-document',
    },
  };
}
