import { join, resolve } from 'node:path';

export const DESKTOP_BUILTIN_SKILL_RESOURCE_DIRECTORY = 'skills';

export interface ResolveDesktopBuiltinSkillRootInput {
  readonly appPath: string;
  readonly isPackaged: boolean;
  readonly resourcesPath: string;
}

export function resolveDesktopBuiltinSkillRoot(input: ResolveDesktopBuiltinSkillRootInput): string {
  return input.isPackaged
    ? join(input.resourcesPath, DESKTOP_BUILTIN_SKILL_RESOURCE_DIRECTORY)
    : resolveDesktopBuiltinSkillSourceRoot(input.appPath);
}

export function resolveDesktopBuiltinSkillSourceRoot(desktopAppPath: string): string {
  return resolve(desktopAppPath, '../../packages/skills/skills');
}
