import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Preview build output ownership', () => {
  it('lets the single application stage the Preview Webview directly', () => {
    const applicationRoot = path.resolve(__dirname, '../../../..');
    const applicationPackage = JSON.parse(
      readFileSync(path.join(applicationRoot, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    const stager = readFileSync(
      path.join(applicationRoot, 'scripts/stage-feature-resources.mjs'),
      'utf8',
    );

    expect(applicationPackage.scripts?.compile).toContain('stage-feature-resources.mjs --build');
    expect(stager).toContain(
      "['pnpm', ['--dir', 'packages/neko-preview-webview', 'run', 'build']]",
    );
    expect(stager).toContain("copies: [['packages/neko-preview-webview/dist', 'dist/webview']]");
    expect(stager).not.toContain('.vsix');
  });
});
