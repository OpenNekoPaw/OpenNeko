import type { SkillSummary } from '@/components/ChatView/InputArea/types';

export interface ProtocolSkillSummaryForUi {
  name: string;
  description: string;
  icon?: string;
  command?: string;
  source: 'builtin' | 'personal' | 'project';
  enabled: boolean;
}

function projectSkillsList<TSkill>(skills: readonly TSkill[] | undefined): TSkill[] {
  return Array.isArray(skills) ? [...skills] : [];
}

export function projectInputSkillSummaries(
  skills: readonly ProtocolSkillSummaryForUi[] | undefined,
): SkillSummary[] {
  return projectSkillsList(skills).map(projectInputSkillSummary);
}

function projectInputSkillSummary(skill: ProtocolSkillSummaryForUi): SkillSummary {
  return {
    id: skill.name,
    name: skill.name,
    description: skill.description,
    ...(skill.icon ? { icon: skill.icon } : {}),
    ...(skill.command ? { slashCommand: skill.command } : {}),
    tags: [],
    source: projectInputSkillSource(skill.source),
    enabled: skill.enabled,
  };
}

function projectInputSkillSource(
  source: ProtocolSkillSummaryForUi['source'],
): SkillSummary['source'] {
  switch (source) {
    case 'personal':
      return 'user';
    case 'builtin':
    case 'project':
      return source;
  }
}
