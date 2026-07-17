import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface DefaultCliInvocation {
  readonly positionalWorkDir?: string;
  readonly prompt?: string;
}

export function resolveDefaultCliInvocation(
  promptParts: readonly string[],
  options: {
    readonly isDirectory?: (value: string) => boolean;
  } = {},
): DefaultCliInvocation {
  const parts = promptParts.filter((part) => part.trim().length > 0);
  if (parts.length === 0) {
    return {};
  }

  const first = parts[0];
  if (first && (options.isDirectory ?? isExistingDirectoryArgument)(first)) {
    return {
      positionalWorkDir: first,
      ...(parts.length > 1 ? { prompt: joinPromptParts(parts.slice(1)) } : {}),
    };
  }

  return { prompt: joinPromptParts(parts) };
}

export function joinPromptParts(parts: readonly string[] | undefined): string | undefined {
  const prompt = (parts ?? []).join(' ').trim();
  return prompt.length > 0 ? prompt : undefined;
}

function isExistingDirectoryArgument(value: string): boolean {
  try {
    return fs.statSync(path.resolve(expandHomeDir(value))).isDirectory();
  } catch {
    return false;
  }
}

function expandHomeDir(value: string): string {
  if (value === '~') {
    return os.homedir();
  }
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}
