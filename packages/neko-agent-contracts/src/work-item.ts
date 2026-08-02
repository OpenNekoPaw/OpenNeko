import type { ChildRunScope } from './agent-runtime-scope';

export type AgentWorkItemStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type AgentWorkItemStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgentWorkItemStep {
  id: string;
  name: string;
  status: AgentWorkItemStepStatus;
  startTime?: number;
  endTime?: number;
  message?: string;
}

export interface SubAgentWorkItem {
  scope: ChildRunScope;
  id: string;
  conversationId: string;
  kind: 'subagent';
  parentMessageId: string | null;
  parentToolCallId: string | null;
  title: string;
  summary?: string;
  status: AgentWorkItemStatus;
  progress: number;
  steps?: AgentWorkItemStep[];
  currentStepId?: string;
  error?: string;
  children?: string[];
  createdAt: string;
  updatedAt: string;
  subAgent: {
    parentAgentId: string;
    type?: string;
    runMode?: 'foreground' | 'background';
    modelTier?: string;
    response?: string;
  };
}

export type AgentWorkItem = SubAgentWorkItem;

export type AgentWorkItemStore = Map<string, Map<string, AgentWorkItem>>;

export type SubAgentWorkItemEventType =
  'spawned' | 'started' | 'progress' | 'completed' | 'failed' | 'cancelled';

export type SubAgentRuntimeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SubAgentWorkItemEvent {
  type: SubAgentWorkItemEventType;
  scope: ChildRunScope;
  subAgentId: string;
  parentAgentId: string;
  conversationId: string;
  data?: {
    status?: SubAgentRuntimeStatus;
    progress?: string;
    result?: {
      id: string;
      status: SubAgentRuntimeStatus;
      response?: string;
      error?: string;
      duration?: number;
      iterations?: number;
    };
    error?: string;
    description?: string;
    subagentType?: string;
    runMode?: 'foreground' | 'background';
    modelTier?: string;
    parentMessageId?: string;
    parentToolCallId?: string;
  };
  timestamp: number;
}
