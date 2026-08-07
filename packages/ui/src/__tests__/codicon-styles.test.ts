import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/icons/codicon.css', 'utf8');

describe('Codicon styles', () => {
  it('provides a canonical query-free font source for Desktop packaging', () => {
    expect(styles).toContain('@import "@vscode/codicons/dist/codicon.css";');
    expect(styles).toMatch(
      /@font-face\s*\{[^}]*font-family:\s*"openneko-codicon"[^}]*src:\s*url\("@vscode\/codicons\/dist\/codicon\.ttf"\)/u,
    );
    expect(styles).toMatch(
      /\.codicon\[class\*='codicon-'\]\s*\{[^}]*font-family:\s*"openneko-codicon"/u,
    );
    expect(styles).not.toContain('codicon.ttf?');
  });
});
