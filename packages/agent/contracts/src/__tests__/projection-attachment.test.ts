import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isSameProjectionAttachment } from '../projection-attachment';

describe('projection attachment identity', () => {
  it('treats attachment, tab, and conversation as one attachment identity', () => {
    const key = {
      attachmentId: 'attachment-1',
      tabId: 'tab-1',
      conversationId: 'conversation-1',
    };
    expect(isSameProjectionAttachment(key, { ...key })).toBe(true);
    expect(isSameProjectionAttachment(key, { ...key, tabId: 'tab-2' })).toBe(false);
    expect(isSameProjectionAttachment(key, { ...key, attachmentId: 'attachment-2' })).toBe(false);
  });

  it('keeps the Layer-0 contract free of host and renderer dependencies', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../projection-attachment.ts', import.meta.url)),
      'utf8',
    );
    const forbidden = [
      /from\s+['"]vscode['"]/,
      /from\s+['"]react['"]/,
      /@neko-agent\/extension/,
      /@neko-agent\/webview/,
      /@neko-agent\/cli-tui/,
    ];

    for (const pattern of forbidden) {
      expect(source).not.toMatch(pattern);
    }
  });
});
