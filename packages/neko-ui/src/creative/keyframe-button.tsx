import type React from 'react';
import type { ReactNode } from 'react';
import { toCodiconClassName } from '../icons/codicon';
import { IconButton, Tooltip } from '../primitives';
import type { KeyframeControlProps } from './keyframe-types';

export interface KeyframeButtonProps extends KeyframeControlProps {
  readonly icon?: ReactNode;
}

export function KeyframeButton({
  animatable,
  disabled,
  hasKeyframes,
  icon,
  isAtKeyframe,
  label = 'Toggle keyframe',
  onToggleKeyframe,
  propertyId,
}: KeyframeButtonProps): React.ReactElement {
  const isDisabled = disabled || !animatable;

  const button = (
    <IconButton
      aria-pressed={isAtKeyframe}
      data-has-keyframes={hasKeyframes ? 'true' : 'false'}
      disabled={isDisabled}
      icon={icon ?? <span aria-hidden="true" className={toCodiconClassName('add')} />}
      label={label}
      onClick={() => {
        if (!isDisabled) {
          onToggleKeyframe?.(propertyId);
        }
      }}
      size="xs"
      variant={isAtKeyframe ? 'default' : 'ghost'}
    />
  );

  return <Tooltip content={label}>{button}</Tooltip>;
}
