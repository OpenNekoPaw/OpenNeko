export const CUT_AGENT_SKILL_NAMES = ['video', 'subtitle'] as const;

export type CutAgentSkillName = (typeof CUT_AGENT_SKILL_NAMES)[number];

export interface CutAgentSkillInvocation {
  readonly skillName: CutAgentSkillName;
  readonly intent: string;
  readonly skill: {
    readonly name: 'NekoCut';
    readonly description: 'NekoCut timeline AI workflow';
  };
}

export function buildCutAgentSkillInvocation(
  skillName: string,
  intent: string,
): CutAgentSkillInvocation {
  if (!isCutAgentSkillName(skillName)) {
    throw new Error(`unsupported-cut-agent-skill: ${skillName}`);
  }
  if (intent.trim().length === 0) {
    throw new Error('invalid-cut-agent-intent: intent must not be empty');
  }

  return {
    skillName,
    intent,
    skill: {
      name: 'NekoCut',
      description: 'NekoCut timeline AI workflow',
    },
  };
}

function isCutAgentSkillName(value: string): value is CutAgentSkillName {
  return CUT_AGENT_SKILL_NAMES.some((candidate) => candidate === value);
}
