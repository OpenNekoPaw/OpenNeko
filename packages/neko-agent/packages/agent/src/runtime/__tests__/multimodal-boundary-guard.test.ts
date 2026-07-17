import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(__dirname, '../../../../../../..');

describe('multimodal perception architecture boundary guard', () => {
  it('keeps shared multimodal contracts free of VSCode and React dependencies', () => {
    const files = [
      join(REPO_ROOT, 'packages/neko-types/src/types/perception-card.ts'),
      join(REPO_ROOT, 'packages/neko-types/src/types/tool.ts'),
      join(REPO_ROOT, 'packages/neko-types/src/types/provider-card.ts'),
      join(REPO_ROOT, 'packages/neko-agent/packages/agent-types/src/message.ts'),
    ];

    for (const file of files) {
      expect(readFileSync(file, 'utf-8'), relative(REPO_ROOT, file)).not.toMatch(
        /from\s+['"](?:vscode|react|react-dom|@neko\/shared\/vscode|@\/components)/,
      );
    }
  });

  it('keeps runtime perception services independent from Webview and Extension APIs', () => {
    const files = [
      ...listSourceFiles(join(REPO_ROOT, 'packages/neko-agent/packages/agent/src/perception')),
      join(REPO_ROOT, 'packages/neko-agent/packages/agent/src/runtime/tool-result-backfill.ts'),
      join(
        REPO_ROOT,
        'packages/neko-agent/packages/agent/src/runtime/stream/agent-stream-state.ts',
      ),
    ];

    for (const file of files) {
      expect(readFileSync(file, 'utf-8'), relative(REPO_ROOT, file)).not.toMatch(
        /from\s+['"](?:vscode|react|react-dom|@\/|@neko\/shared\/vscode|.*webview.*|.*extension.*)['"]/i,
      );
    }
  });
});

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry !== '__tests__') {
        files.push(...listSourceFiles(path));
      }
      continue;
    }
    if (path.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}
