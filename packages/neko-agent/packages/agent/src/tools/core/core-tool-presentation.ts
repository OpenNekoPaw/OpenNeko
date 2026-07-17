import type { CoreFileAccessDecision } from './file-access-policy';

export type CoreFileOperation = 'read-file' | 'write-file' | 'list-directory' | 'search-path';

export function presentCoreFileAccessDenial(
  operation: CoreFileOperation,
  decision: Extract<CoreFileAccessDecision, { allowed: false }>,
  locale: unknown,
): string {
  const zh = isChinesePromptLocale(locale);
  switch (decision.reason) {
    case 'missing-authorized-root':
      return zh
        ? `无法${presentOperation(zh, operation)}“${decision.path}”：没有可用的已授权工作区根目录。`
        : `Cannot ${presentOperation(zh, operation)} "${decision.path}": no authorized workspace root is available.`;
    case 'relative-path-without-root':
      return zh
        ? `路径必须是绝对路径或工作区相对路径：${decision.path}`
        : `Path must be absolute or workspace-relative: ${decision.path}`;
    case 'forbidden-unmanaged-path':
      return zh
        ? `路径位于系统临时目录、Downloads 或 Desktop，拒绝访问：${decision.path}`
        : `Path is denied because it is in system temp, Downloads, or Desktop: ${decision.path}`;
    case 'outside-authorized-roots':
      return zh
        ? `路径不在${presentOperationRoot(zh, operation)}授权根目录内：${decision.path}`
        : `Path is outside authorized ${presentOperationRoot(zh, operation)} roots: ${decision.path}`;
    case 'ignored-workspace-path':
      if (decision.rule !== undefined) {
        return zh
          ? `路径被工作区 .gitignore 规则“${decision.rule}”忽略：${decision.path}`
          : `Path is ignored by workspace .gitignore rule "${decision.rule}": ${decision.path}`;
      }
      return zh
        ? `路径位于受管理的工作区运行时或缓存目录中，已被忽略：${decision.path}`
        : `Path is ignored because it is in a managed workspace runtime or cache directory: ${decision.path}`;
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

export function presentWriteFailure(detail: string, locale: unknown): string {
  return isChinesePromptLocale(locale)
    ? `写入文件失败：${detail}`
    : `Failed to write file: ${detail}`;
}

export function presentListDirectoryFailure(
  code: 'not-found' | 'not-directory' | 'list-failed',
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
