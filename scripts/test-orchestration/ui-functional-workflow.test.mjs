import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('VS Code functional workflow boundary', () => {
  it('does not replace built-in Extension Debug with a workflow-owned code launch', async () => {
    const workflowRoot = join(repoRoot, '.github/workflows');
    const workflowNames = (await readdir(workflowRoot))
      .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));
    const workflowText = (await Promise.all(
      workflowNames.map((name) => readFile(join(workflowRoot, name), 'utf8')),
    )).join('\n');

    assert.doesNotMatch(workflowText, /NEKO_VSCODE_COMMAND/u);
    assert.doesNotMatch(workflowText, /pnpm test:webview:functional/u);
    assert.doesNotMatch(workflowText, /update\.code\.visualstudio\.com/u);
  });
});
