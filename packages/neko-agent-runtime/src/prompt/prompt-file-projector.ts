import type { PromptPresetConfig, PromptSource } from '@neko/shared';
import * as path from 'node:path';
import {
  resolveAgentsFile,
  resolveNekoContentDir,
  type NekoContentSource,
} from '../workspace/neko-content-layout';

export interface PromptFileInfo {
  id: string;
  name: string;
  filePath: string;
  source: PromptSource;
  content: string;
}

export interface PromptFileScanResult {
  personal: PromptFileInfo[];
  project: PromptFileInfo[];
}

export interface AgentsFilePlan {
  ok: true;
  dirPath: string;
  filePath: string;
  template: string;
}

export interface PromptConfigFilePlan {
  ok: true;
  dirPath: string;
  filePath: string;
  template: string;
}

export interface AgentsFileLoadCandidate {
  source: NekoContentSource;
  filePath: string;
}

export interface AgentsFileFailurePlan {
  ok: false;
  error: string;
}

export const PROMPT_FILE_EXTENSION = '.md';
export const DEFAULT_NEW_PROMPT_NAME = 'New Prompt';

export const DEFAULT_AGENTS_FILE_CONTENT = `# Global Agent Instructions

<!-- 全局 Agent 指令 -->
<!-- 此文件的内容会作为环境层 overlay 注入到对话中，不会替代内置 system prompt。 -->
<!-- 请在这里放用户/项目偏好；不要在这里定义工具协议、权限规则或子包 schema。 -->

## 语言规范
- 对话使用中文
- 代码注释使用英文

## 代码风格
- 遵循项目现有代码风格
- 保持代码简洁清晰

## 工作方式
- 优先遵循当前项目的架构、测试和文档约束
- 修改前先理解已有实现和边界
- 缺少必要上下文时先说明风险或提出澄清

## 边界
- 本文件只描述用户/项目偏好
- 工具调用协议、资源授权、视觉证据规则和子包能力说明以运行时 system prompt、tool schema 和 capability catalog 为准
`;

export function buildPromptFileContent(name: string): string {
  return `# ${name}

<!-- 在此编写您的提示词内容 -->
<!-- Write your prompt content here -->

`;
}

export function buildPromptConfigFilePlan(input: {
  source: NekoContentSource;
  promptId?: string;
  homeDir: string;
  workspaceRoot?: string | null;
  unavailableError?: string;
}): PromptConfigFilePlan | AgentsFileFailurePlan {
  const dirPath = resolveNekoContentDir({
    source: input.source,
    subdir: 'prompts',
    homeDir: input.homeDir,
    workspaceRoot: input.workspaceRoot,
  });
  if (!dirPath) {
    return {
      ok: false,
      error: input.unavailableError ?? 'No workspace folder open for project prompts',
    };
  }

  const promptName = input.promptId || DEFAULT_NEW_PROMPT_NAME;
  const fileName = input.promptId ? generatePromptFileName(input.promptId) : 'new-prompt.md';

  return {
    ok: true,
    dirPath,
    filePath: path.join(dirPath, fileName),
    template: buildPromptFileContent(promptName),
  };
}

export function buildAgentsFilePlan(input: {
  source: NekoContentSource;
  homeDir: string;
  workspaceRoot?: string | null;
  unavailableError?: string;
}): AgentsFilePlan | AgentsFileFailurePlan {
  const filePath = resolveAgentsFile({
    source: input.source,
    homeDir: input.homeDir,
    workspaceRoot: input.workspaceRoot,
  });
  if (!filePath) {
    return {
      ok: false,
      error: input.unavailableError ?? 'No workspace folder open for project AGENTS.md',
    };
  }

  return {
    ok: true,
    dirPath: path.dirname(filePath),
    filePath,
    template: DEFAULT_AGENTS_FILE_CONTENT,
  };
}

export function buildAgentsFileLoadPlan(input: {
  homeDir: string;
  workspaceRoot?: string | null;
}): AgentsFileLoadCandidate[] {
  const candidates: AgentsFileLoadCandidate[] = [];
  const projectPath = resolveAgentsFile({
    source: 'project',
    homeDir: input.homeDir,
    workspaceRoot: input.workspaceRoot,
  });
  if (projectPath) {
    candidates.push({ source: 'project', filePath: projectPath });
  }

  const personalPath = resolveAgentsFile({ source: 'personal', homeDir: input.homeDir });
  if (personalPath) {
    candidates.push({ source: 'personal', filePath: personalPath });
  }

  return candidates;
}

export function shouldScanPromptFile(fileName: string): boolean {
  return fileName.endsWith(PROMPT_FILE_EXTENSION);
}

export function projectPromptFileInfo(input: {
  source: PromptSource;
  fileName: string;
  filePath: string;
  content: string;
}): PromptFileInfo {
  const name =
    extractPromptNameFromContent(input.content) ||
    stripPromptFileExtension(getPathBaseName(input.fileName));

  return {
    id: generatePromptFileId(input.source, input.fileName),
    name,
    filePath: input.filePath,
    source: input.source,
    content: input.content,
  };
}

export function ensurePromptFileExtension(fileName: string): string {
  return fileName.endsWith(PROMPT_FILE_EXTENSION)
    ? fileName
    : `${fileName}${PROMPT_FILE_EXTENSION}`;
}

export function generatePromptFileName(name: string): string {
  return ensurePromptFileExtension(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, ''),
  );
}

export function extractPromptNameFromContent(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

export function generatePromptFileId(source: PromptSource, fileName: string): string {
  return `${source}-prompt-${stripPromptFileExtension(getPathBaseName(fileName))}`;
}

export function promptFileInfoToConfig(info: PromptFileInfo): PromptPresetConfig {
  return {
    id: info.id,
    name: info.name,
    type: 'custom',
    description: '',
    systemPrompt: info.content,
    source: info.source,
    filePath: info.filePath,
    builtin: false,
    enabled: true,
  };
}

export function syncPromptFilesWithConfig(
  scanResult: PromptFileScanResult,
  existingPrompts: readonly PromptPresetConfig[],
): PromptPresetConfig[] {
  const existingIds = new Set(existingPrompts.map((prompt) => prompt.id));
  const existingFilePaths = new Set<string>();
  const existingSourceFileNames = new Set<string>();

  for (const prompt of existingPrompts) {
    if (!prompt.filePath) {
      continue;
    }
    existingFilePaths.add(prompt.filePath);
    existingSourceFileNames.add(
      `${prompt.source || 'personal'}:${getPathBaseName(prompt.filePath)}`,
    );
  }

  return [...scanResult.personal, ...scanResult.project]
    .filter((fileInfo) => {
      const sourceFileName = `${fileInfo.source}:${getPathBaseName(fileInfo.filePath)}`;
      return (
        !existingIds.has(fileInfo.id) &&
        !existingFilePaths.has(fileInfo.filePath) &&
        !existingSourceFileNames.has(sourceFileName)
      );
    })
    .map((fileInfo) => promptFileInfoToConfig(fileInfo));
}

function stripPromptFileExtension(fileName: string): string {
  return fileName.endsWith(PROMPT_FILE_EXTENSION)
    ? fileName.slice(0, -PROMPT_FILE_EXTENSION.length)
    : fileName;
}

function getPathBaseName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}
