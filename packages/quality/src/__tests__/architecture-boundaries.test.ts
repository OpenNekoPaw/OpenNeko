import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as core from '../core/index';
import * as project from '../project/index';

const packageRoot = resolve(import.meta.dirname, '../..');

describe('@neko/quality architecture boundaries', () => {
  it('exposes core and project behavior through distinct public entries', () => {
    expect(core.createQualityGateRuntime).toBeTypeOf('function');
    expect(project.collectProjectQualityEvidence).toBeTypeOf('function');
  });

  it('does not expose a model execution subpath', () => {
    const manifest = readFileSync(resolve(packageRoot, 'package.json'), 'utf8');

    expect(manifest).not.toContain('"./model"');
  });

  it('depends only on explicit domain contracts', () => {
    const forbiddenImports = [
      '@neko/agent-runtime',
      '@neko-agent/',
      '@neko/platform',
      '@neko/entity-domain',
      '@neko/cut',
      '@neko/ai-sdk',
      'vscode',
      'react',
    ];
    const violations = sourceFiles(resolve(packageRoot, 'src')).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return forbiddenImports
        .filter((specifier) => source.includes(`from '${specifier}`))
        .map((specifier) => `${file}: ${specifier}`);
    });

    expect(violations).toEqual([]);
  });
});

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const absolute = resolve(root, entry);
    if (statSync(absolute).isDirectory()) return sourceFiles(absolute);
    return absolute.endsWith('.ts') ? [absolute] : [];
  });
}
