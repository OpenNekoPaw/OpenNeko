import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(__dirname, '../..');

describe('neko-chara architecture boundaries', () => {
  it('keeps core and application independent from Host, UI, and Agent implementations', () => {
    const files = [
      ...listTypeScriptFiles(resolve(packageRoot, 'src/core')),
      ...listTypeScriptFiles(resolve(packageRoot, 'src/application')),
    ];
    const forbidden = [
      /from ['"]vscode['"]/,
      /from ['"]react/,
      /from ['"]@neko-agent\/extension/,
      /from ['"]@neko\/agent(?:\/|['"])/,
      /from ['"]@neko\/platform/,
      /from ['"]@neko\/entity\/host-vscode/,
      /from ['"]@neko\/search\/host-vscode/,
      /from ['"]@neko\/content\/(?:node|document\/node)['"]/,
      /from ['"][^'"]*webview[^'"]*['"]/i,
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(source, `${relative(packageRoot, file)} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('keeps removed host adapters absent from package exports', () => {
    expect(existsSync(resolve(packageRoot, 'src/host-vscode'))).toBe(false);

    for (const file of ['package.json', 'src/index.ts']) {
      const source = readFileSync(resolve(packageRoot, file), 'utf8');
      expect(source, `${file} must not expose a removed host adapter`).not.toMatch(
        /host-vscode|from ['"]vscode['"]|@neko-agent\/extension/,
      );
    }
  });
});

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return listTypeScriptFiles(fullPath);
    return fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') ? [fullPath] : [];
  });
}
