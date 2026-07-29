import { normalizeAgentInputTriggerName } from './agent-input-trigger';

export function normalizeSlashCommandName(command: string): string {
  return normalizeAgentInputTriggerName(command);
}
