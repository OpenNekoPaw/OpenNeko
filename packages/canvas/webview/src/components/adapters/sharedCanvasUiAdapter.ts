import React from 'react';
import { toCodiconClassName, type CodiconName } from '@neko/ui/icons';
import type { CanvasAddActionId } from '../../utils/canvasAddActions';

const ADD_ACTION_ICON_BY_ID: Readonly<Record<CanvasAddActionId, CodiconName>> = {
  text: 'edit',
  image: 'symbol-color',
  video: 'play',
  audio: 'symbol-ruler',
};

export function createCanvasAddActionIcon(
  actionId: CanvasAddActionId,
  color = 'var(--neko-fg-secondary)',
): React.ReactNode {
  return React.createElement('span', {
    'aria-hidden': 'true',
    className: `${toCodiconClassName(ADD_ACTION_ICON_BY_ID[actionId])} canvas-add-action-icon`,
    'data-canvas-add-action-icon': actionId,
    style: { color },
  });
}
