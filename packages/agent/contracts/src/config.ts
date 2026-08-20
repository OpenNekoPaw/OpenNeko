export type PromptPresetType =
  | 'chat'
  | 'coder'
  | 'screenwriter'
  | 'storyboard'
  | 'image'
  | 'video'
  | 'audio'
  | 'plan'
  | 'custom';

export type PromptSource = 'builtin' | 'personal' | 'project';

export interface PromptPresetConfig {
  id: string;
  name: string;
  nameKey?: string;
  type: PromptPresetType;
  description: string;
  descriptionKey?: string;
  systemPrompt: string;
  icon?: string;
  autoExecuteTools?: boolean;
  streamResponses?: boolean;
  showToolCalls?: boolean;
  temperature?: number;
  maxTokens?: number;
  preferredProvider?: string;
  preferredModel?: string;
  enabled: boolean;
  builtin?: boolean;
  source?: PromptSource;
  filePath?: string;
  internal?: boolean;
}
