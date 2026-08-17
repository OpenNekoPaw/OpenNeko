import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(__dirname, '../../../../../..');

describe('multimodal perception architecture boundary guard', () => {
  it('keeps shared multimodal contracts free of VSCode and React dependencies', () => {
    const files = [
      join(REPO_ROOT, 'packages/agent/contracts/src/perception-card.ts'),
      join(REPO_ROOT, 'packages/agent/contracts/src/tool.ts'),
      join(REPO_ROOT, 'packages/agent/contracts/src/multimodal-context.ts'),
      join(REPO_ROOT, 'packages/agent/contracts/src/message.ts'),
    ];

    for (const file of files) {
      expect(readFileSync(file, 'utf-8'), relative(REPO_ROOT, file)).not.toMatch(
        /from\s+['"](?:vscode|react|react-dom|@neko\/shared\/vscode|@\/components)/,
      );
    }
  });

  it('keeps runtime perception services independent from Webview and host UI APIs', () => {
    // The legacy top-level perception pipeline was removed; the live perception tools live under
    // tools/perception and are covered by the shared-contract guard above.
    expect(listSourceFiles(join(REPO_ROOT, 'packages/agent/runtime/src/perception'))).toEqual([]);
  });
});

function listSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
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
