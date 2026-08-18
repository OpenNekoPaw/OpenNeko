import { useTranslation } from '@neko/ui/i18n/react';

export function DesktopAssistantPreviewSurface({
  conversationId,
}: {
  readonly assistantSpaceId: string;
  readonly conversationId: string;
  readonly previewSessionId: string;
  readonly scratchArtifactId: string;
  readonly windowId: string;
}): JSX.Element {
  const { locale } = useTranslation();
  return (
    <div className="desktop-assistant-preview-unavailable" role="status">
      <strong>
        {locale === 'zh-cn' ? '助手预览尚未接入 DSH' : 'Assistant Preview is not connected to DSH'}
      </strong>
      <p>
        {locale === 'zh-cn'
          ? `Conversation ${conversationId} 的资源预览需要新的 DSH Host Tool。`
          : `Conversation ${conversationId} requires the new DSH Host Tool for resource preview.`}
      </p>
    </div>
  );
}
