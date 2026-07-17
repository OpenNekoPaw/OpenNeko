import React from 'react';
import { Box } from 'ink';
import { cleanup } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTuiTestRuntime,
  renderWithPresentation,
  type TuiTestRuntime,
} from '../../__tests__/render-with-presentation';
import type { Message } from '../../types/state';
import { ChatView } from './ChatView';

let runtime: TuiTestRuntime;

beforeEach(() => {
  runtime = createTuiTestRuntime();
});

afterEach(() => cleanup());

describe('ChatView runtime viewport', () => {
  it('shows the live bottom by default and can scroll to older rows', async () => {
    runtime.conversation.stores.conversation.getState().replaceMessages(
      Array.from({ length: 5 }, (_, index): Message => ({
        id: `message-${index + 1}`,
        role: 'user',
        content: `message-${index + 1}`,
        toolCalls: [],
        todos: [],
        timestamp: index,
      })),
    );

    const view = renderWithPresentation(
      <Box height={4} flexDirection="column">
        <ChatView />
      </Box>,
      'en',
      runtime,
    );
    await expect.poll(() => view.lastFrame()).toContain('message-5');
    expect(view.lastFrame()).not.toContain('message-1');

    runtime.conversation.stores.ui.getState().scrollUp(4);
    await expect.poll(() => view.lastFrame()).toContain('message-3');
    expect(view.lastFrame()).not.toContain('message-5');

    runtime.conversation.stores.ui.getState().scrollToBottom();
    await expect.poll(() => view.lastFrame()).toContain('message-5');
  });
});
