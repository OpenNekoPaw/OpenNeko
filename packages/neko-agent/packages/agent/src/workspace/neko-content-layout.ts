import * as path from 'node:path';

export const NEKO_CONTENT_DIR = '.neko' as const;
export const NEKO_AGENTS_FILE_NAME = 'AGENTS.md' as const;

export const NEKO_CONTENT_SUBDIRS = {
  prompts: 'prompts',
  skills: 'skills',
  commands: 'commands',
} as const;

export type NekoContentSubdir = keyof typeof NEKO_CONTENT_SUBDIRS;
export type NekoContentSource = 'personal' | 'project';

export function resolvePersonalNekoContentDir(homeDir: string, subdir: NekoContentSubdir): string {
  return path.join(homeDir, NEKO_CONTENT_DIR, NEKO_CONTENT_SUBDIRS[subdir]);
}

export function resolveProjectNekoContentDir(
  workspaceRoot: string | null | undefined,
  subdir: NekoContentSubdir,
): string | null {
  if (!workspaceRoot) return null;
  return path.join(workspaceRoot, NEKO_CONTENT_DIR, NEKO_CONTENT_SUBDIRS[subdir]);
}

export function resolveNekoContentDir(input: {
  readonly source: NekoContentSource;
  readonly subdir: NekoContentSubdir;
  readonly homeDir: string;
  readonly workspaceRoot?: string | null;
}): string | null {
  return input.source === 'personal'
    ? resolvePersonalNekoContentDir(input.homeDir, input.subdir)
    : resolveProjectNekoContentDir(input.workspaceRoot, input.subdir);
}

export function resolvePersonalAgentsFile(homeDir: string): string {
  return path.join(homeDir, NEKO_CONTENT_DIR, NEKO_AGENTS_FILE_NAME);
}

export function resolveProjectAgentsFile(workspaceRoot: string | null | undefined): string | null {
  if (!workspaceRoot) return null;
  return path.join(workspaceRoot, NEKO_CONTENT_DIR, NEKO_AGENTS_FILE_NAME);
}

export function resolveAgentsFile(input: {
  readonly source: NekoContentSource;
  readonly homeDir: string;
  readonly workspaceRoot?: string | null;
}): string | null {
  return input.source === 'personal'
    ? resolvePersonalAgentsFile(input.homeDir)
    : resolveProjectAgentsFile(input.workspaceRoot);
}
