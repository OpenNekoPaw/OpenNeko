import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../../..');

describe('project cache/search architecture guards', () => {
  it('keeps Agent mention search behind the project search command', () => {
    const source = readRepoFile(
      'packages/neko-agent/packages/extension/src/services/projectMentionSearch.ts',
    );

    expect(source).toContain('PROJECT_SEARCH_QUERY_COMMAND');
    expect(source).not.toContain('resolveStorageLayout');
    expect(source).not.toContain('asset-graph.json');
    expect(source).not.toContain('search-index.json');
    expect(source).not.toContain('media-metadata.json');
  });

  it('registers semantic coverage through the host facade provider', () => {
    const source = readRepoFile('packages/neko-agent/packages/extension/src/index.ts');

    expect(source).toContain('createVSCodeSemanticCoverageProvider');
    expect(source).toContain('semanticCoverageProviders');
    expect(source).toContain('registerProjectSearchService');
  });

  it('keeps Webview mention UI free of cache file paths and filesystem APIs', () => {
    const source = readRepoFile(
      'packages/neko-agent/packages/webview/src/components/ChatView/InputArea/MentionMenu.tsx',
    );

    expect(source).not.toMatch(/from ['"]vscode['"]/);
    expect(source).not.toMatch(/from ['"]fs/);
    expect(source).not.toContain('.neko/.cache');
    expect(source).not.toContain('search-index.json');
  });
});

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}
