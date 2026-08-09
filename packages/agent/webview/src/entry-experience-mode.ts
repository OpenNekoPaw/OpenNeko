export const AGENT_ENTRY_EXPERIENCE_MODES = [
  'assistant',
  'workspace',
  'character',
  'world',
] as const;

export type AgentEntryExperienceMode = (typeof AGENT_ENTRY_EXPERIENCE_MODES)[number];

export function isAgentEntryExperienceMode(value: unknown): value is AgentEntryExperienceMode {
  return AGENT_ENTRY_EXPERIENCE_MODES.some((mode) => mode === value);
}
