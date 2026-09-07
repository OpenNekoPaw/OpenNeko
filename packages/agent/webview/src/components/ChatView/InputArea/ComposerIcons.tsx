import type { SessionMode } from '@neko/agent-contracts';
import type { IconProps } from '@neko/ui/icons';
import { CameraIcon, PlayIcon, VolumeIcon } from '@neko/ui/icons';
import type { MediaModelCategory } from './types';

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

function MediaMusicIcon({ className, size = 14, strokeWidth = 1.8 }: ComposerIconProps) {
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
      <path d="M9 18V5l10-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="16" cy="16" r="3" />
    </svg>
  );
}

export function MediaCategoryIcon({
  category,
  ...props
}: ComposerIconProps & { category: MediaModelCategory }) {
  if (category === 'image') {
    return <MediaImageIcon {...props} />;
  }
  if (category === 'video') {
    return <MediaVideoIcon {...props} />;
  }
  if (category === 'music') {
    return <MediaMusicIcon {...props} />;
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
