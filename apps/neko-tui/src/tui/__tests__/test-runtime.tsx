import React from 'react';
import { TuiApplicationRuntimeProvider } from '../runtime/tui-runtime-context';
import { sharedTuiTestRuntime } from './render-with-presentation';

export const testAgentStore = sharedTuiTestRuntime.conversation.stores.agent;
export const testConfigStore = sharedTuiTestRuntime.conversation.stores.config;
export const testConversationStore = sharedTuiTestRuntime.conversation.stores.conversation;
export const testUIStore = sharedTuiTestRuntime.conversation.stores.ui;

export function SharedTuiTestRuntimeProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <TuiApplicationRuntimeProvider runtime={sharedTuiTestRuntime.application}>
      {children}
    </TuiApplicationRuntimeProvider>
  );
}
