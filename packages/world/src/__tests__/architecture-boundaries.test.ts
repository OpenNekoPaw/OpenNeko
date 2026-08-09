import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(__dirname, '../..');

describe('neko-world architecture boundaries', () => {
  it('keeps the Foundation host-neutral and independent from Chara and Agent implementations', () => {
    const files = listTypeScriptFiles(resolve(packageRoot, 'src')).filter(
      (file) => !file.endsWith('.test.ts'),
    );
    const forbidden = [
      /from ['"]electron/u,
      /from ['"]react/u,
      /from ['"]@neko\/chara/u,
      /from ['"]@neko\/agent/u,
      /from ['"][^'"]*\/node['"]/u,
      /browser-use|computer-use|play-use|external-game|VLA/u,
      /schemaVersion|contractVersion|formatVersion/u,
      /fallbackHandler|defaultHandler|tryNext/u,
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(source, `${relative(packageRoot, file)} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('exports only explicit host-neutral public subpaths', () => {
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
      exports: Readonly<Record<string, string>>;
    };
    expect(manifest.exports).toEqual({
      '.': './src/index.ts',
      './contracts': './src/contracts/index.ts',
      './core': './src/core/index.ts',
      './application': './src/application/index.ts',
      './testing': './src/testing/index.ts',
    });
    expect(existsSync(resolve(packageRoot, 'src/node'))).toBe(false);
    expect(existsSync(resolve(packageRoot, 'src/webview'))).toBe(false);
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
