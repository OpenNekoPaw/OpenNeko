import { useEffect, useState } from 'react';

type MessageAvatarRole = 'user' | 'assistant';
type MessageAvatarSize = 'sm' | 'md';

interface MessageAvatarProps {
  role: MessageAvatarRole;
  label?: string;
  imageUri?: string;
  size?: MessageAvatarSize;
  title?: string;
}

const sizeClassBySize: Record<MessageAvatarSize, string> = {
  sm: 'h-5 w-5 text-[8px]',
  md: 'h-7 w-7 text-[10px]',
};

const toneClassByRole: Record<MessageAvatarRole, string> = {
  user: 'border-[var(--agent-composer-send-border)] bg-[var(--agent-composer-send-bg)] text-[var(--agent-composer-send-fg)]',
  assistant:
    'border-[var(--agent-bubble-assistant-border)] bg-[var(--agent-bubble-assistant-bg)] text-[var(--agent-fg)]',
};

export function MessageAvatar({
  role,
  label = role === 'user' ? 'Me' : 'AI',
  imageUri,
  size = 'sm',
  title,
}: MessageAvatarProps) {
  const accessibleLabel = title ?? label;
  const [imageFailed, setImageFailed] = useState(false);
  const shouldRenderImage = Boolean(imageUri && !imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUri]);

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border font-semibold leading-none ${sizeClassBySize[size]} ${toneClassByRole[role]}`}
      title={accessibleLabel}
      aria-label={accessibleLabel}
    >
      {shouldRenderImage && imageUri ? (
        <img
          src={imageUri}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      ) : (
        projectAvatarLabel(label)
      )}
    </div>
  );
}

function projectAvatarLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return 'AI';

  const words = trimmed.split(/\s+/);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
  }

  return Array.from(trimmed).slice(0, 2).join('').toUpperCase();
}
