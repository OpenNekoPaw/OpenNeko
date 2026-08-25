export type AgentReasoningPreset = 'fast' | 'balanced' | 'deep';
export type AgentVerbosityPreset = 'brief' | 'standard' | 'detailed';
export type AgentCreativityPreset = 'stable' | 'creative' | 'wild';
export type AgentReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type AgentTextVerbosity = 'low' | 'medium' | 'high';
export type AgentServiceTier = 'auto' | 'default' | 'fast' | 'flex' | 'priority';

export interface AgentLlmAdvancedParams {
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  readonly reasoningEffort?: AgentReasoningEffort;
  readonly thinkingBudget?: number;
  readonly verbosity?: AgentTextVerbosity;
  readonly serviceTier?: AgentServiceTier;
}

export interface AgentLlmConfig {
  readonly reasoningPreset?: AgentReasoningPreset;
  readonly verbosityPreset?: AgentVerbosityPreset;
  readonly creativityPreset?: AgentCreativityPreset;
  readonly advanced?: AgentLlmAdvancedParams;
}
