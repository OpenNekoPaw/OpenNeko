import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(__dirname, '../..');

describe('neko-search architecture boundaries', () => {
  it('keeps core free of VSCode and feature package imports', () => {
    const files = [
      ...listTypeScriptFiles(resolve(packageRoot, 'src/core')),
      ...listTypeScriptFiles(resolve(packageRoot, 'src/providers')),
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, relative(packageRoot, file)).not.toMatch(/from ['"]vscode['"]/);
      expect(source, relative(packageRoot, file)).not.toMatch(/from ['"]@neko\/agent/);
      expect(source, relative(packageRoot, file)).not.toMatch(/from ['"]@neko-agent\//);
      expect(source, relative(packageRoot, file)).not.toMatch(/from ['"]neko-story/);
      expect(source, relative(packageRoot, file)).not.toMatch(/from ['"]neko-assets/);
      expect(source, relative(packageRoot, file)).not.toMatch(/from ['"]neko-dashboard/);
      expect(source, relative(packageRoot, file)).not.toMatch(/from ['"]react/);
    }
  });

  it('keeps Agent mention projection from parsing cache files directly', () => {
    const source = readFileSync(
      resolve(packageRoot, '../neko-agent/packages/extension/src/services/projectMentionSearch.ts'),
      'utf8',
    );

    expect(source).toContain('PROJECT_SEARCH_QUERY_COMMAND');
    expect(source).not.toContain('resolveStorageLayout');
    expect(source).not.toContain('asset-graph.json');
    expect(source).not.toContain('search-index.json');
    expect(source).not.toContain('media-metadata.json');
  });

  it('keeps Agent and Webview consumers behind the semantic coverage facade', () => {
    const consumerRoots = [
      resolve(packageRoot, '../neko-agent/packages/agent/src'),
      resolve(packageRoot, '../neko-agent/packages/extension/src'),
      resolve(packageRoot, '../neko-agent/packages/webview/src'),
    ];
    const files = consumerRoots.flatMap((root) => listTypeScriptFiles(root));

    for (const file of files) {
      const source = stripTypeScriptComments(readFileSync(file, 'utf8'));
      expect(source, relative(packageRoot, file)).not.toContain('.neko/semantic-index');
      expect(source, relative(packageRoot, file)).not.toMatch(/semantic.*\.neko\/\.cache/i);
      expect(source, relative(packageRoot, file)).not.toMatch(
        /semantic.*(sqlite|vector-store|fts-index)/i,
      );
    }
  });
});

function listTypeScriptFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(entryPath);
    return entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

function stripTypeScriptComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}
