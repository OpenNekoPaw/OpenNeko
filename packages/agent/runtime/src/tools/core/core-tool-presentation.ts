import type { CoreFileAccessDecision } from './file-access-policy';

export type CoreFileOperation = 'read-file' | 'write-file' | 'list-directory' | 'search-path';

export function presentCoreFileAccessDenial(
  operation: CoreFileOperation,
  decision: Extract<CoreFileAccessDecision, { allowed: false }>,
  locale: unknown,
): string {
  const zh = isChinesePromptLocale(locale);
  const displayPath = decision.displayPath;
  switch (decision.reason) {
    case 'missing-authorized-root':
      return zh
        ? `无法${presentOperation(zh, operation)}“${displayPath}”：没有可用的已授权工作区根目录。`
        : `Cannot ${presentOperation(zh, operation)} "${displayPath}": no authorized workspace root is available.`;
    case 'invalid-workspace-relative-path':
      return zh
        ? `路径必须是规范化的 Workspace-relative 路径：${displayPath}`
        : `Path must be a normalized Workspace-relative path: ${displayPath}`;
    case 'forbidden-unmanaged-path':
      return zh
        ? `路径位于系统临时目录、Downloads 或 Desktop，拒绝访问：${displayPath}`
        : `Path is denied because it is in system temp, Downloads, or Desktop: ${displayPath}`;
    case 'outside-authorized-roots':
      return zh
        ? `路径不在${presentOperationRoot(zh, operation)}授权根目录内：${displayPath}`
        : `Path is outside authorized ${presentOperationRoot(zh, operation)} roots: ${displayPath}`;
    case 'ignored-workspace-path':
      if (decision.rule !== undefined) {
        return zh
          ? `路径被工作区 .gitignore 规则“${decision.rule}”忽略：${displayPath}`
          : `Path is ignored by workspace .gitignore rule "${decision.rule}": ${displayPath}`;
      }
      return zh
        ? `路径位于受管理的工作区运行时或缓存目录中，已被忽略：${displayPath}`
        : `Path is ignored because it is in a managed workspace runtime or cache directory: ${displayPath}`;
    case 'protected-project-document': {
      const owner = decision.protectedProjectOwner;
      if (!owner) throw new Error('Protected project denial requires an owning domain.');
      return zh
        ? `受保护的项目文档只能通过 ${owner} 领域能力访问，不能读取或写入原始文件：${displayPath}`
        : `Protected project document must use the ${owner} domain capability and cannot be read or written as a raw file: ${displayPath}`;
    }
  }
}

export function presentContentWriteDiagnostic(
  code: import('@neko/content').ContentIoDiagnosticCode,
  workspacePath: string,
  locale: unknown,
): string {
  const zh = isChinesePromptLocale(locale);
  switch (code) {
    case 'content-changed':
    case 'content-conflict':
      return zh
        ? `${code}：文件“${workspacePath}”已变化或已存在；请重新读取并使用返回的 freshness。`
        : `${code}: File "${workspacePath}" changed or already exists; read it again and use the returned freshness.`;
    case 'content-cancelled':
      return zh ? `${code}：文件写入已取消。` : `${code}: File write was cancelled.`;
    case 'content-too-large':
      return zh ? `${code}：写入内容超过允许大小。` : `${code}: Content exceeds the write limit.`;
    case 'content-missing':
      return zh
        ? `${code}：文件或授权目录不存在：${workspacePath}`
        : `${code}: File or authorized directory is missing: ${workspacePath}`;
    case 'content-unauthorized':
      return zh
        ? `${code}：文件写入未获授权：${workspacePath}`
        : `${code}: File write is not authorized: ${workspacePath}`;
    case 'content-write-failed':
      return zh
        ? `${code}：文件写入失败：${workspacePath}`
        : `${code}: File write failed: ${workspacePath}`;
    case 'content-allocation-failed':
    case 'content-projection-failed':
    case 'content-range-invalid':
    case 'content-read-failed':
    case 'content-unsupported':
      throw new Error(`Unexpected Workspace write diagnostic: ${code}`);
  }
}

export function presentInvalidToolArguments(toolName: string, locale: unknown): string {
  return isChinesePromptLocale(locale)
    ? `${toolName} 参数无效。`
    : `Invalid ${toolName} arguments.`;
}

export function presentReadFailure(
  code: 'not-found' | 'is-directory' | 'read-failed',
  value: string,
  locale: unknown,
): string {
  const zh = isChinesePromptLocale(locale);
  switch (code) {
    case 'not-found':
      return zh ? `未找到文件：${value}` : `File not found: ${value}`;
    case 'is-directory':
      return zh ? `路径是目录而不是文件：${value}` : `Path is a directory, not a file: ${value}`;
    case 'read-failed':
      return zh ? `读取文件失败：${value}` : `Failed to read file: ${value}`;
  }
}

export function presentReadTextBoundaryFailure(
  code: 'non-text' | 'too-large' | 'invalid-utf8' | 'contains-null',
  value: string,
  locale: unknown,
  contentClass?: string,
): string {
  const zh = isChinesePromptLocale(locale);
  switch (code) {
    case 'non-text':
      return zh
        ? `Read 只读取有界 UTF-8 文本；“${value}”属于 ${contentClass ?? '非文本'}，请使用对应内容或领域能力。`
        : `Read accepts only bounded UTF-8 text; "${value}" is ${contentClass ?? 'non-text'} content and requires its exact content or domain capability.`;
    case 'too-large':
      return zh
        ? `文本文件超过 Read 的 ${MAX_TEXT_READ_MIB} MiB 上限：${value}`
        : `Text file exceeds the ${MAX_TEXT_READ_MIB} MiB Read limit: ${value}`;
    case 'invalid-utf8':
      return zh
        ? `文件不是有效的 UTF-8 文本，Read 已拒绝：${value}`
        : `File is not valid UTF-8 text and was rejected by Read: ${value}`;
    case 'contains-null':
      return zh
        ? `文件包含 NUL 字节，不能作为文本读取：${value}`
        : `File contains NUL bytes and cannot be read as text: ${value}`;
  }
}

const MAX_TEXT_READ_MIB = 4;

export function presentWriteFailure(detail: string, locale: unknown): string {
  return isChinesePromptLocale(locale)
    ? `写入文件失败：${detail}`
    : `Failed to write file: ${detail}`;
}

export function projectPortableIoFailure(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { readonly code?: unknown }).code
      : undefined;
  if (typeof code === 'string' && /^[a-z0-9_-]+$/iu.test(code)) return code;
  if (error instanceof Error && /^[a-z0-9][a-z0-9_-]*$/iu.test(error.message)) {
    return error.message;
  }
  return 'unknown-io-error';
}

export function presentListDirectoryFailure(
  code: 'not-found' | 'not-directory' | 'list-failed' | 'cursor-invalid',
  value: string,
  locale: unknown,
): string {
  const zh = isChinesePromptLocale(locale);
  switch (code) {
    case 'not-found':
      return zh ? `未找到目录：${value}` : `Directory not found: ${value}`;
    case 'not-directory':
      return zh ? `路径不是目录：${value}` : `Path is not a directory: ${value}`;
    case 'list-failed':
      return zh ? `列出目录失败：${value}` : `Failed to list directory: ${value}`;
    case 'cursor-invalid':
      return zh
        ? `目录内容已变化或游标无效：${value}`
        : `Directory contents changed or the cursor is invalid: ${value}`;
  }
}

export function presentGrepFailure(
  code: 'invalid-pattern' | 'invalid-path-kind' | 'not-found' | 'search-failed',
  value: string,
  locale: unknown,
): string {
  const zh = isChinesePromptLocale(locale);
  switch (code) {
    case 'invalid-pattern':
      return zh ? `正则表达式无效：${value}` : `Invalid regex pattern: ${value}`;
    case 'invalid-path-kind':
      return zh ? `路径不是文件或目录：${value}` : `Path is not a file or directory: ${value}`;
    case 'not-found':
      return zh ? `未找到路径：${value}` : `Path not found: ${value}`;
    case 'search-failed':
      return zh ? `搜索失败：${value}` : `Search failed: ${value}`;
  }
}

export function presentMemoryWriteFailure(
  code: 'empty-key' | 'content-required' | 'proposal-failed',
  value: string | undefined,
  locale: unknown,
): string {
  const zh = isChinesePromptLocale(locale);
  switch (code) {
    case 'empty-key':
      return zh ? '`key` 不得为空。' : '`key` must not be empty.';
    case 'content-required':
      return zh
        ? '操作 `upsert` 必须提供 `content`。'
        : '`content` is required for action `upsert`.';
    case 'proposal-failed': {
      if (value === undefined) {
        throw new Error('Project memory proposal failure projection requires detail.');
      }
      return zh
        ? `提交项目记忆更新提案失败：${value}`
        : `Failed to propose project memory update: ${value}`;
    }
  }
}

export function presentProcessFailure(detail: string, locale: unknown): string {
  return isChinesePromptLocale(locale) ? `进程错误：${detail}` : `Process error: ${detail}`;
}

export function presentOutputTruncationWarning(locale: unknown): string {
  return isChinesePromptLocale(locale)
    ? '输出已截断（超过 100KB 限制）'
    : 'Output truncated (exceeded 100KB limit)';
}

export function presentOutputTruncationMarker(locale: unknown): string {
  return isChinesePromptLocale(locale) ? '...（输出已截断）' : '... (output truncated)';
}

export function presentLineTruncationMarker(locale: unknown): string {
  return isChinesePromptLocale(locale) ? '...（已截断）' : '... (truncated)';
}

function presentOperation(zh: boolean, operation: CoreFileOperation): string {
  if (zh) {
    switch (operation) {
      case 'read-file':
        return '读取文件';
      case 'write-file':
        return '写入文件';
      case 'list-directory':
        return '列出目录';
      case 'search-path':
        return '搜索路径';
    }
  }
  switch (operation) {
    case 'read-file':
      return 'read file';
    case 'write-file':
      return 'write file';
    case 'list-directory':
      return 'list directory';
    case 'search-path':
      return 'search path';
  }
}

function presentOperationRoot(zh: boolean, operation: CoreFileOperation): string {
  if (zh) {
    return operation === 'write-file' ? '写入' : '读取';
  }
  return operation === 'write-file' ? 'write' : 'read';
}

function isChinesePromptLocale(locale: unknown): boolean {
  return locale === 'zh-cn';
}
