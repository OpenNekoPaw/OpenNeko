import { isDocumentFile, type MessageAttachment } from '@neko/shared';

export type AgentRuntimePromptLocale = 'en' | 'zh';

export interface AgentBase64ImageAttachment {
  readonly type: 'base64';
  readonly media_type: string;
  readonly data: string;
}

export interface AgentProcessedAttachments {
  readonly textContent: string;
  readonly imageAttachments: AgentBase64ImageAttachment[];
}

export interface AgentAttachmentProjectionError {
  readonly attachment: MessageAttachment;
  readonly operation: 'read-image' | 'read-file';
  readonly error: unknown;
}

export interface AgentAttachmentProjectionDeps {
  readonly readTextFile: (path: string) => Promise<string>;
  readonly readImageFileAsBase64: (path: string) => Promise<AgentBase64ImageAttachment | null>;
  readonly locale?: AgentRuntimePromptLocale | string;
  readonly onError?: (error: AgentAttachmentProjectionError) => void;
}

const DATA_URL_BASE64_RE = /^data:([^;]+);base64,(.+)$/;
const FILE_REFERENCE_RE = /\[File: [^\]]+\]\n(.+)/g;

export function parseBase64DataUrl(dataUrl: string): AgentBase64ImageAttachment | null {
  const match = dataUrl.match(DATA_URL_BASE64_RE);
  const mediaType = match?.[1];
  const data = match?.[2];
  if (!mediaType || !data) {
    return null;
  }
  return {
    type: 'base64',
    media_type: mediaType,
    data,
  };
}

export function normalizeAgentRuntimePromptLocale(
  locale?: AgentRuntimePromptLocale | string,
): AgentRuntimePromptLocale {
  return locale?.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function formatFileAttachmentContent(
  name: string,
  content: string,
  locale?: AgentRuntimePromptLocale | string,
): string {
  const labels = getAttachmentLabels(locale);
  return `\n\n### ${labels.file}: ${name}\n\`\`\`\n${content}\n\`\`\``;
}

export function formatUnreadableFileAttachment(
  name: string,
  locale?: AgentRuntimePromptLocale | string,
): string {
  const labels = getAttachmentLabels(locale);
  return `\n\n### ${labels.file}: ${name}\n(${labels.failedToReadFile})`;
}

export function formatMediaAttachmentReference(
  attachment: Pick<MessageAttachment, 'type' | 'name' | 'path'>,
  locale?: AgentRuntimePromptLocale | string,
): string {
  const labels = getAttachmentLabels(locale);
  let text = `\n\n[${labels.attached} ${formatAttachmentType(attachment.type, locale)}: ${attachment.name}]`;
  if (attachment.path) {
    text += ` (${labels.path}: ${attachment.path})`;
  }
  return text;
}

export function formatDocumentAttachmentReference(
  name: string,
  path: string,
  locale?: AgentRuntimePromptLocale | string,
): string {
  const labels = getAttachmentLabels(locale);
  return `\n\n[${labels.attached} ${labels.document}: ${name}] (${labels.path}: ${path})\n${formatReadDocumentInstruction(path, locale)}`;
}

export function extractFileReferencePaths(message: string): string[] {
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  FILE_REFERENCE_RE.lastIndex = 0;
  while ((match = FILE_REFERENCE_RE.exec(message)) !== null) {
    const filePath = match[1]?.trim();
    if (filePath) {
      paths.push(filePath);
    }
  }
  return paths;
}

export async function projectAgentMessageAttachments(
  attachments: readonly MessageAttachment[] | undefined,
  deps: AgentAttachmentProjectionDeps,
): Promise<AgentProcessedAttachments> {
  const imageAttachments: AgentBase64ImageAttachment[] = [];
  let textContent = '';

  if (!attachments || attachments.length === 0) {
    return { textContent, imageAttachments };
  }

  for (const attachment of attachments) {
    switch (attachment.type) {
      case 'image': {
        if (attachment.preview) {
          const preview = parseBase64DataUrl(attachment.preview);
          if (preview) {
            imageAttachments.push(preview);
          }
          break;
        }

        if (!attachment.path) {
          break;
        }

        try {
          const base64Data = await deps.readImageFileAsBase64(attachment.path);
          if (base64Data) {
            imageAttachments.push(base64Data);
          }
        } catch (error) {
          deps.onError?.({ attachment, operation: 'read-image', error });
        }
        break;
      }

      case 'file': {
        if (!attachment.path) {
          break;
        }

        if (isDocumentFile(attachment.path)) {
          textContent += formatDocumentAttachmentReference(
            attachment.name,
            attachment.path,
            deps.locale,
          );
          break;
        }

        try {
          const content = await deps.readTextFile(attachment.path);
          textContent += formatFileAttachmentContent(attachment.name, content, deps.locale);
        } catch (error) {
          deps.onError?.({ attachment, operation: 'read-file', error });
          textContent += formatUnreadableFileAttachment(attachment.name, deps.locale);
        }
        break;
      }

      case 'video':
      case 'audio':
        textContent += formatMediaAttachmentReference(attachment, deps.locale);
        break;
    }
  }

  return { textContent, imageAttachments };
}

export function formatReadDocumentInstruction(
  path: string,
  locale?: AgentRuntimePromptLocale | string,
): string {
  if (normalizeAgentRuntimePromptLocale(locale) === 'zh') {
    return `分析该文档前，先调用 ReadDocument，参数使用 source={"kind":"file","path":"${path}"}。不要把整本文档直接内联到聊天上下文。`;
  }
  return `Use ReadDocument with source={"kind":"file","path":"${path}"} before analyzing this document. Do not inline the whole document as chat context.`;
}

function getAttachmentLabels(locale?: AgentRuntimePromptLocale | string): {
  readonly attached: string;
  readonly document: string;
  readonly file: string;
  readonly path: string;
  readonly failedToReadFile: string;
} {
  if (normalizeAgentRuntimePromptLocale(locale) === 'zh') {
    return {
      attached: '已附加',
      document: '文档',
      file: '文件',
      path: '路径',
      failedToReadFile: '读取文件失败',
    };
  }
  return {
    attached: 'Attached',
    document: 'document',
    file: 'File',
    path: 'path',
    failedToReadFile: 'Failed to read file',
  };
}

function formatAttachmentType(
  type: MessageAttachment['type'],
  locale?: AgentRuntimePromptLocale | string,
): string {
  if (normalizeAgentRuntimePromptLocale(locale) !== 'zh') return type;
  switch (type) {
    case 'image':
      return '图片';
    case 'video':
      return '视频';
    case 'audio':
      return '音频';
    case 'file':
      return '文件';
  }
}
