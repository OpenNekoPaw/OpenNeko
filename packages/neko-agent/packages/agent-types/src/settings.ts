/**
 * Settings Types — Extension-layer settings (AIAssistantSettings + defaults)
 */

export type ShellExecutionMode = 'plan' | 'ask' | 'auto';

export interface AIAssistantSettings {
  selectedProviderId: string | null;
  selectedModelId: string | null;
  customSystemPrompt: string;
  autoExecuteTools: boolean;
  streamResponses: boolean;
  showToolCalls: boolean;
  temperature: number;
  maxTokens: number;
  executionMode: ShellExecutionMode;
}

export const DEFAULT_SETTINGS: AIAssistantSettings = {
  selectedProviderId: null,
  selectedModelId: null,
  customSystemPrompt: '',
  autoExecuteTools: true,
  streamResponses: true,
  showToolCalls: true,
  temperature: 0.7,
  maxTokens: 8192,
  executionMode: 'ask',
};
