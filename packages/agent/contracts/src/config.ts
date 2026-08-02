export type MCPServerCategory =
  'filesystem' | 'database' | 'api' | 'development' | 'productivity' | 'ai' | 'other';

export interface MCPToolInfo {
  name: string;
  description: string;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  description: string;
  category: MCPServerCategory;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  inheritProcessEnv?: boolean;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  builtin?: boolean;
  homepage?: string;
  tools?: MCPToolInfo[];
  requestTimeout?: number;
}

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
