import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(__dirname, 'index.css'), 'utf8');

describe('Agent text selection presentation', () => {
  it('uses the shared editor selection theme for transcript and composer text', () => {
    const selectionRule = styles.match(/\.dsh-agent-view ::selection\s*\{(?<body>[^}]*)\}/u);

    expect(selectionRule?.groups?.body).toContain('--neko-editor-selectionBackground');
    expect(selectionRule?.groups?.body).toContain('--neko-editor-selectionForeground');
  });
});
