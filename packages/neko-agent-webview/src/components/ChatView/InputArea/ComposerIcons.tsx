import type { SessionMode } from '@neko-agent/types';
import type { IconProps } from '@neko/shared/icons';
import { CameraIcon, PlayIcon, VolumeIcon } from '@neko/shared/icons';
import type { GenCategory } from './types';

type ComposerIconProps = Pick<IconProps, 'className' | 'size' | 'strokeWidth'>;

function AgentWorkflowIcon({ className, size = 14, strokeWidth = 1.8 }: ComposerIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v3" />
      <path d="M7 7.5h10" />
      <rect x="5" y="7.5" width="14" height="10" rx="3" />
      <path d="M9 12h.01" />
      <path d="M15 12h.01" />
      <path d="M10 16h4" />
      <path d="M4 12H2" />
      <path d="M22 12h-2" />
    </svg>
  );
}

function MediaImageIcon(props: ComposerIconProps) {
  return (
    <CameraIcon
      size={props.size ?? 14}
      strokeWidth={props.strokeWidth ?? 1.8}
      className={props.className}
    />
  );
}

function MediaVideoIcon(props: ComposerIconProps) {
  return (
    <PlayIcon
      size={props.size ?? 14}
      strokeWidth={props.strokeWidth ?? 1.8}
      className={props.className}
    />
  );
}

function MediaAudioIcon(props: ComposerIconProps) {
  return (
    <VolumeIcon
      size={props.size ?? 14}
      strokeWidth={props.strokeWidth ?? 1.8}
      className={props.className}
    />
  );
}

export function MediaCategoryIcon({
  category,
  ...props
}: ComposerIconProps & { category: GenCategory }) {
  if (category === 'image') {
    return <MediaImageIcon {...props} />;
  }
  if (category === 'video') {
    return <MediaVideoIcon {...props} />;
  }
  return <MediaAudioIcon {...props} />;
}

export function SessionModeIcon({ mode, ...props }: ComposerIconProps & { mode: SessionMode }) {
  if (mode === 'agent') {
    return <AgentWorkflowIcon {...props} />;
  }
  if (mode === 'image' || mode === 'video' || mode === 'audio') {
    return <MediaCategoryIcon category={mode} {...props} />;
  }
  return null;
}
