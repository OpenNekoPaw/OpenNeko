import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('OpenNeko TUI application boundary', () => {
  it('owns the terminal entry without importing retired package or host internals', () => {
    const source = readFileSync(resolve(__dirname, 'application.ts'), 'utf8');
    expect(source).toContain("from './tui/cli'");
    expect(source).not.toMatch(/packages\/neko-agent|@neko\/cli/u);
    expect(source).not.toMatch(/\b(?:react-dom|vscode)\b/u);
  });
});
