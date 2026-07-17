export const IMAGE_GENERATION_TOOLS = [
  'generate_image',
  'image_generation',
  'create_image',
  'text_to_image',
] as const;

export const VIDEO_GENERATION_TOOLS = [
  'generate_video',
  'video_generation',
  'create_video',
  'text_to_video',
] as const;

export const AUDIO_GENERATION_TOOLS = [
  'generate_audio',
  'audio_generation',
  'create_audio',
  'text_to_audio',
  'text_to_speech',
] as const;

export const FILE_TOOLS = [
  'read_file',
  'write_file',
  'edit_file',
  'create_file',
  'delete_file',
  'view_file',
  'open_file',
  'str_replace_editor',
  'str_replace_based_edit_tool',
] as const;

export const SHELL_TOOLS = ['bash', 'execute_command', 'run_command', 'shell', 'terminal'] as const;

export const SEARCH_TOOLS = [
  'grep',
  'search_files',
  'search',
  'web_search',
  'find_files',
  'glob',
] as const;

export function getToolSummary(
  toolName: string,
  args: Record<string, unknown>,
  maxLen = 40,
): string {
  const name = toolName.toLowerCase();

  if (isOneOf(name, FILE_TOOLS)) {
    const filePath = readFirstString(args, ['path', 'file_path', 'filePath', 'file', 'filename']);
    const fileName = filePath?.split('/').pop() || filePath;
    return truncate(fileName ?? toolName, maxLen);
  }

  if (isOneOf(name, SHELL_TOOLS)) {
    return truncate(readFirstString(args, ['command', 'cmd', 'script']) ?? toolName, maxLen);
  }

  if (isOneOf(name, SEARCH_TOOLS)) {
    const pattern = readFirstString(args, ['pattern', 'query', 'q', 'keyword', 'search']);
    const inPath = readFirstString(args, ['path', 'directory', 'dir']);
    if (pattern && inPath) return truncate(`"${pattern}" in ${inPath}`, maxLen);
    if (pattern) return truncate(`"${pattern}"`, maxLen);
    return truncate(toolName, maxLen);
  }

  const url = readString(args, 'url');
  if (url) {
    try {
      const parsed = new URL(url);
      return truncate(parsed.hostname + parsed.pathname.slice(0, 20), maxLen);
    } catch {
      return truncate(url, maxLen);
    }
  }

  return truncate(firstStringValue(args) ?? '', maxLen);
}

function readFirstString(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = readString(obj, key);
    if (value) return value;
  }
  return undefined;
}

function readString(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = obj?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function firstStringValue(obj: Record<string, unknown>): string | undefined {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value.length > 0 && key !== 'id') return value;
  }
  return undefined;
}

function truncate(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  if (maxLen <= 3) return value.slice(0, maxLen);
  return `${value.slice(0, maxLen - 3)}...`;
}

function isOneOf<T extends readonly string[]>(value: string, values: T): boolean {
  return values.includes(value as T[number]);
}
