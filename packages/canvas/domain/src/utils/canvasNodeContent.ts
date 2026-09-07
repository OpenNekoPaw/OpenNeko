import { isContentLocator, type ContentLocator } from '@neko/content-domain';
import type { CanvasNode } from '../types/canvas';

export function readCanvasNodeContentLocators(node: CanvasNode): readonly ContentLocator[] {
  if (node.type === 'generation') return node.data.outputs.map((output) => output.locator);
  const locator = 'contentLocator' in node.data ? node.data.contentLocator : undefined;
  return isContentLocator(locator) ? [locator] : [];
}
