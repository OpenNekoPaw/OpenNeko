import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = new URL('../../../../../', import.meta.url).pathname;

describe('viewport architecture boundaries', () => {
  it('keeps shared viewport protocol contracts free of React, DOM, VSCode, and Node imports', () => {
    const files = [
      'packages/neko-types/src/types/viewport-protocol.ts',
      'packages/neko-types/src/types/live-compositor.ts',
    ];

    for (const file of files) {
      const source = readFileSync(join(repoRoot, file), 'utf8');

      expect(source).not.toMatch(/from ['"]react(?:\/|['"])/);
      expect(source).not.toMatch(/from ['"]react-dom(?:\/|['"])/);
      expect(source).not.toMatch(/from ['"]vscode['"]/);
      expect(source).not.toMatch(/from ['"]node:/);
      expect(source).not.toMatch(/\bwindow\./);
      expect(source).not.toMatch(/\bdocument\./);
    }
  });

  it('keeps viewport protocol free of generated engine and editor package dependencies', () => {
    const source = readFileSync(
      join(repoRoot, 'packages/neko-types/src/types/viewport-protocol.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/from ['"]\.\.\/generated\//);
    expect(source).not.toMatch(/from ['"]@neko\/neko-client['"]/);
    expect(source).not.toMatch(/from ['"]@neko\/ui['"]/);
    expect(source).not.toMatch(/from ['"]@neko-(?:model|puppet|live)\//);
  });

  it('keeps editor webviews from importing VSCode extension host APIs directly', () => {
    const roots = [
      'packages/neko-model/packages/webview/src',
      'packages/neko-puppet/packages/webview/src',
      'packages/neko-live/packages/webview/src',
    ];
    const offenders = roots
      .flatMap((root) => sourceFiles(join(repoRoot, root)))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return /from ['"]vscode['"]|require\(['"]vscode['"]\)/.test(source);
      })
      .map((file) => relative(repoRoot, file));

    expect(offenders).toEqual([]);
  });

  it('keeps model, puppet, and live webview controllers isolated from each other', () => {
    const packageRoots = [
      ['model', 'packages/neko-model/packages/webview/src'],
      ['puppet', 'packages/neko-puppet/packages/webview/src'],
      ['live', 'packages/neko-live/packages/webview/src'],
    ] as const;

    const offenders: string[] = [];
    for (const [owner, root] of packageRoots) {
      for (const file of sourceFiles(join(repoRoot, root))) {
        const source = readFileSync(file, 'utf8');
        for (const [other] of packageRoots) {
          if (other === owner) continue;
          if (source.includes(`@neko-${other}/`) || source.includes(`packages/neko-${other}/`)) {
            offenders.push(relative(repoRoot, file));
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

function sourceFiles(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
      continue;
    }
    if (
      /\.(?:ts|tsx)$/.test(entry) &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.test.tsx')
    ) {
      files.push(path);
    }
  }
  return files;
}
