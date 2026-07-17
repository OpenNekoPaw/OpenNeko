import type { NodeTypeDescriptorRegistry } from '../../components/nodes/nodeTypeDescriptor';

export function createNarrativeNodeTypeDescriptors(): NodeTypeDescriptorRegistry {
  return {
    'narrative-start': {
      type: 'narrative-start',
      labelKey: 'node.narrativeStart',
      icon: '▶',
      tagLabel: 'START',
      tagColor: '#22c55e',
      defaultSize: { width: 200, height: 100 },
      presentation: 'structured',
    },
    choice: {
      type: 'choice',
      labelKey: 'node.choice',
      icon: '◇',
      tagLabel: 'CHOICE',
      tagColor: '#f97316',
      defaultSize: { width: 220, height: 120 },
      presentation: 'structured',
    },
    merge: {
      type: 'merge',
      labelKey: 'node.merge',
      icon: '◆',
      tagLabel: 'MERGE',
      tagColor: '#22c55e',
      defaultSize: { width: 180, height: 96 },
      presentation: 'structured',
    },
    'narrative-scene': {
      type: 'narrative-scene',
      labelKey: 'node.narrativeScene',
      icon: '§',
      tagLabel: 'SCENE',
      tagColor: '#0ea5e9',
      defaultSize: { width: 260, height: 150 },
      presentation: 'structured',
    },
    'narrative-note': {
      type: 'narrative-note',
      labelKey: 'node.narrativeNote',
      icon: '¶',
      tagLabel: 'NOTE',
      tagColor: '#a855f7',
      defaultSize: { width: 220, height: 120 },
      presentation: 'structured',
    },
    'narrative-ending': {
      type: 'narrative-ending',
      labelKey: 'node.narrativeEnding',
      icon: '■',
      tagLabel: 'ENDING',
      tagColor: '#ef4444',
      defaultSize: { width: 220, height: 110 },
      presentation: 'structured',
    },
  };
}
