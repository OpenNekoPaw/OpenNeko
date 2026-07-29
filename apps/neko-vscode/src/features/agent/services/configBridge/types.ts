import type { AssistantConfigState } from '@neko/platform/config/assistant-config';
import type { ExtensionToWebviewMessage } from '@neko-agent/types';

/**
 * Function type for sending messages to a webview
 */
export type PostMessageFn = (message: ExtensionToWebviewMessage) => void;

export type WebviewConfigState = AssistantConfigState;
