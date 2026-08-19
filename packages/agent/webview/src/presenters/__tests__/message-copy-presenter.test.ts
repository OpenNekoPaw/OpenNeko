import { describe, expect, it } from 'vitest';
import type { Message } from '@neko/agent-contracts';
import { projectMessageCopyText } from '../message-copy-presenter';

describe('message-copy-presenter', () => {
  it('copies plain visible message text', () => {
    expect(
      projectMessageCopyText(message({ role: 'user', content: '  Keep this prompt.  ' })),
    ).toBe('Keep this prompt.');
    expect(
      projectMessageCopyText(message({ role: 'assistant', content: 'Plain assistant answer.' })),
    ).toBe('Plain assistant answer.');
  });

  it('copies only final structured Markdown answers in display order', () => {
    expect(
      projectMessageCopyText(
        message({
          role: 'assistant',
          content: 'Hidden legacy content.',
          contentBlocks: [
            { id: 'thinking', type: 'thinking', timestamp: 1, thinking: 'Private reasoning.' },
            {
              id: 'tool',
              type: 'tool_call',
              timestamp: 2,
              toolCall: {
                id: 'tool-call',
                name: 'ReadDocument',
                arguments: { path: 'notes.md' },
                result: { success: true, data: 'Tool result.' },
              },
            },
            { id: 'answer-1', type: 'text', timestamp: 3, content: 'First paragraph.' },
            { id: 'answer-2', type: 'text', timestamp: 4, content: 'Second paragraph.' },
          ],
        }),
      ),
    ).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('does not copy hidden fallback content for a structured message without a text answer', () => {
    expect(
      projectMessageCopyText(
        message({
          role: 'assistant',
          content: 'Hidden legacy content.',
          contentBlocks: [
            { id: 'thinking', type: 'thinking', timestamp: 1, thinking: 'Only activity.' },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('copies the visible error text even when structured activity is present', () => {
    expect(
      projectMessageCopyText(
        message({
          role: 'assistant',
          content: 'Visible provider error.',
          isError: true,
          contentBlocks: [
            { id: 'thinking', type: 'thinking', timestamp: 1, thinking: 'Hidden activity.' },
          ],
        }),
      ),
    ).toBe('Visible provider error.');
  });

  it('returns null for whitespace-only plain content', () => {
    expect(projectMessageCopyText(message({ role: 'system', content: '   ' }))).toBeNull();
  });
});

function message(input: Pick<Message, 'role' | 'content'> & Partial<Message>): Message {
  return {
    id: 'message-1',
    timestamp: 1,
    ...input,
  };
}
