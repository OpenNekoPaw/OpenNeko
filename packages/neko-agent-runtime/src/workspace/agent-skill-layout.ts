import * as path from 'node:path';
import type { CreateSkillTarget } from '@neko/shared';

export const AGENT_SKILL_ROOT_DIR = '.agents' as const;
export const AGENT_SKILL_SUBDIR = 'skills' as const;

export function resolvePersonalAgentSkillsDir(homeDir: string): string {
  return path.join(homeDir, AGENT_SKILL_ROOT_DIR, AGENT_SKILL_SUBDIR);
}

export function resolveProjectAgentSkillsDir(
  workspaceRoot: string | null | undefined,
): string | null {
  return workspaceRoot ? path.join(workspaceRoot, AGENT_SKILL_ROOT_DIR, AGENT_SKILL_SUBDIR) : null;
}

export function resolveAgentSkillsDir(input: {
  readonly source: CreateSkillTarget;
  readonly homeDir: string;
  readonly workspaceRoot?: string | null;
}): string | null {
  return input.source === 'personal'
    ? resolvePersonalAgentSkillsDir(input.homeDir)
    : resolveProjectAgentSkillsDir(input.workspaceRoot);
}
