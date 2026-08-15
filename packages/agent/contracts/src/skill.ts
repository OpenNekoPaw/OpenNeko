/** Host provenance for a discovered portable Agent Skill. */
export type SkillSource = 'builtin' | 'personal' | 'plugin' | 'project';

/** Canonical portable Skill locations. */
export const SKILL_DIRECTORIES = {
  project: '.agents/skills',
  personal: '~/.agents/skills',
} as const;

/** OpenNeko command documents are intentionally separate from Agent Skills. */
export const COMMAND_DIRECTORIES = {
  project: 'neko/commands',
  personal: '~/.neko/commands',
} as const;
