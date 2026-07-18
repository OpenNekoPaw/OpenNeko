import type { CanvasNode } from '@neko/shared';
import { t } from '../../i18n';
import { resolveResourceRefDisplayName } from '../../utils/resourceDisplayName';
import { readResourceRef } from './node-card';

const NODE_TYPE_I18N_KEY: Partial<Record<string, string>> = {
  annotation: 'node.note',
  scene: 'node.sceneGroup',
  text: 'node.newText',
  'canvas-embed': 'node.canvasEmbed',
};

export function resolveNodeDisplayTitle(node: CanvasNode): string {
  const explicitTitle = resolveExplicitNodeTitle(node);
  if (explicitTitle) {
    return explicitTitle;
  }
  const resourceRef = readResourceRef(node);
  if (resourceRef) {
    return resolveResourceRefDisplayName(resourceRef);
  }
  if (node.preview?.title) {
    return extractFilename(node.preview.title);
  }
  const key = NODE_TYPE_I18N_KEY[node.type] ?? `node.${node.type}`;
  return t(key) || node.id;
}

function resolveExplicitNodeTitle(node: CanvasNode): string | undefined {
  if (node.type !== 'text' && node.type !== 'media' && node.type !== 'document') return undefined;
  const title = node.data.title?.trim();
  if (title) return title;
  if (node.type !== 'text') return undefined;
  const sourceName = node.data.provenance?.['sourceName'];
  return typeof sourceName === 'string' && sourceName.trim().length > 0
    ? sourceName.trim()
    : undefined;
}

function extractFilename(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
}
