import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Preview build output ownership', () => {
  it('lets Turbo build the Webview once before the extension assembles it', () => {
    const previewRoot = path.resolve(__dirname, '../../../..');
    const repositoryRoot = path.resolve(previewRoot, '../..');
    const previewPackage = JSON.parse(
      readFileSync(path.join(previewRoot, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };
    const turboConfig = JSON.parse(
      readFileSync(path.join(repositoryRoot, 'turbo.json'), 'utf8'),
    ) as { tasks?: Record<string, { dependsOn?: string[] }> };

    expect(previewPackage.scripts?.build).toBe(
      'pnpm run compile:extension && pnpm run copy:webview',
    );
    expect(previewPackage.scripts?.compile).toContain('pnpm run compile:webview');
    expect(turboConfig.tasks?.['neko-preview#build']?.dependsOn).toContain(
      '@neko/preview-webview#build',
    );
  });
});
