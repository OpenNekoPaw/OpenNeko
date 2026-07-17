import { readFieldBinding } from '@neko/shared';
import type { CanvasNode, FieldBinding } from '@neko/shared';

export interface BoundFieldValue {
  found: boolean;
  value: unknown;
}

export function readNodeBinding(node: CanvasNode, binding: FieldBinding): BoundFieldValue {
  return readFieldBinding(node.data, binding);
}
