import React from 'react';
import { cleanup } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithPresentation } from '../../__tests__/render-with-presentation';
import type { Message } from '../../types/state';
import { MessageItem } from './MessageItem';

afterEach(() => cleanup());

describe('MessageItem reference presentation', () => {
  it('renders durable path references compactly without changing stored content', () => {
    const content =
      '@${A}/epub/animation/Blame/[Kmoe][BLAME！(新裝版)]卷01.epub 分析前10页，生成分镜表，发送canvas';
    const message: Message = {
      id: 'user-reference',
      role: 'user',
      content,
      toolCalls: [],
      todos: [],
      timestamp: 1,
    };

    const view = renderWithPresentation(<MessageItem message={message} />);

    expect(view.lastFrame()).toContain('@[Kmoe][BLAME！(新裝版)]卷01.epub');
    expect(view.lastFrame()).not.toContain('${A}/epub/animation/Blame/');
    expect(message.content).toBe(content);
  });
});
