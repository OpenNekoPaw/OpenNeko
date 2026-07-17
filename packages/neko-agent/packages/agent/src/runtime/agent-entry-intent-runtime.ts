import type { AgentContextPayload, AgentContextType } from '@neko/shared';

export interface BuildAgentCreationMessageInput {
  readonly intent: string;
  readonly sourceFilePath?: string;
}

export type AgentPromptCommandKind = 'generate-image' | 'generate-video';
export type AgentScriptCommandKind = 'generate' | 'optimize' | 'generate-image' | 'generate-video';

export interface BuildAgentPromptCommandMessageInput {
  readonly kind: AgentPromptCommandKind;
  readonly prompt: string;
}

export interface BuildAgentScriptCommandMessageInput {
  readonly kind: AgentScriptCommandKind;
  readonly text: string;
}

export interface BuildAgentFileContextPayloadInput {
  readonly filePath: string;
  readonly relativePath: string;
  readonly intent?: string;
  readonly id?: string;
  readonly label?: string;
  readonly typeOverride?: AgentContextType;
  readonly now?: () => number;
}

export const AGENT_DOCUMENT_CONTEXT_INTENTS = {
  summarizeDocument: '请总结这个文档的要点：',
  chatWithDocument: '我想讨论一下这个文档：',
  analyzeImage: '请分析这张图片：',
  extractImageText: '请提取这张图片中的文字（OCR）：',
  analyzeVideo: '请分析这个视频：',
  generateSubtitles: '请为这个视频生成字幕：',
} as const;

export const AGENT_RETRY_CREATION_MESSAGE = 'Retry the failed scenes from my last creation run';

const CREATION_INTENT_BY_EXTENSION: Readonly<Record<string, string>> = {
  fountain: 'Convert this screenplay to video',
  nks: 'Convert this screenplay to video',
  pdf: 'Create a video from this document',
  docx: 'Create a video from this document',
  doc: 'Create a video from this document',
  md: 'Create a video from this text',
  txt: 'Create a video from this text',
};

const IMAGE_FILE_EXTENSION_RE = /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i;

export function buildAgentCreationMessage(input: BuildAgentCreationMessageInput): string {
  return input.sourceFilePath
    ? `${input.intent}. Source file: ${input.sourceFilePath}`
    : input.intent;
}

export function buildAgentPromptCommandMessage(input: BuildAgentPromptCommandMessageInput): string {
  return input.kind === 'generate-image'
    ? `Generate an image: ${input.prompt}`
    : `Generate a video: ${input.prompt}`;
}

export function buildAgentScriptCommandMessage(input: BuildAgentScriptCommandMessageInput): string {
  switch (input.kind) {
    case 'generate':
      return `Generate a script based on: ${input.text}`;
    case 'optimize':
      return `Optimize this script: ${input.text}`;
    case 'generate-image':
      return `Generate images for this script: ${input.text}`;
    case 'generate-video':
      return `Generate a video from this script: ${input.text}`;
  }
}

export function buildAgentRetryCreationMessage(): string {
  return AGENT_RETRY_CREATION_MESSAGE;
}

export function inferAgentCreationIntentFromFilePath(filePath: string): string {
  return (
    CREATION_INTENT_BY_EXTENSION[getFileExtension(filePath)] ?? 'Create a video from this file'
  );
}

export function inferAgentFileContextType(
  filePath: string,
  typeOverride?: AgentContextType,
): AgentContextType {
  return typeOverride ?? (IMAGE_FILE_EXTENSION_RE.test(filePath) ? 'image' : 'file');
}

export function createAgentFileContextPayloadId(
  filePath: string,
  options: { readonly now?: () => number } = {},
): string {
  return `file:${filePath}:${options.now?.() ?? Date.now()}`;
}

export function buildAgentFileContextPayload(
  input: BuildAgentFileContextPayloadInput,
): AgentContextPayload {
  const label = input.label ?? getPathBaseName(input.filePath);
  return {
    type: inferAgentFileContextType(input.filePath, input.typeOverride),
    id: input.id ?? createAgentFileContextPayloadId(input.filePath, { now: input.now }),
    label,
    summary: `File: ${input.relativePath}`,
    data: { filePath: input.filePath, relativePath: input.relativePath },
    ...(input.intent ? { intent: input.intent } : {}),
  };
}

function getFileExtension(filePath: string): string {
  const fileName = getPathBaseName(filePath);
  const separatorIndex = fileName.lastIndexOf('.');
  return separatorIndex > 0 ? fileName.slice(separatorIndex + 1).toLowerCase() : '';
}

function getPathBaseName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1) || filePath;
}
