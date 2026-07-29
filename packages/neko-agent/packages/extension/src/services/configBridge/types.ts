import type { AssistantConfigState } from '@neko/platform/config/assistant-config';
import type { AgentHostToWebviewMessage } from '@neko-agent/types';

/**
 * Function type for sending messages to a webview
 */
export type PostMessageFn = (message: AgentHostToWebviewMessage) => void;

export type WebviewConfigState = AssistantConfigState;
