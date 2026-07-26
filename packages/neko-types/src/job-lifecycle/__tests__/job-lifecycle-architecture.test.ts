import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '../../..');
const sourceRoot = resolve(packageRoot, 'src/job-lifecycle');

describe('Domain Job lifecycle package boundary', () => {
  it('uses an explicit public subpath without widening the shared main entry', () => {
    const manifest = readFileSync(resolve(packageRoot, 'package.json'), 'utf8');
    const mainEntry = readFileSync(resolve(packageRoot, 'src/index.ts'), 'utf8');

    expect(manifest).toContain('"./job-lifecycle": "./src/job-lifecycle/index.ts"');
    expect(mainEntry).not.toMatch(/job-lifecycle/);
  });

  it('does not provide a central manager or generic domain execution contract', () => {
    const productionSource = readdirSync(sourceRoot)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => readFileSync(resolve(sourceRoot, file), 'utf8'))
      .join('\n');

    expect(productionSource).not.toMatch(/GenericJobManager|JobHandlerRegistry/);
    expect(productionSource).not.toMatch(/\bpayload\b|\bresult\b/);
    expect(existsSync(resolve(sourceRoot, 'job-manager.ts'))).toBe(false);
  });

  it('stays independent from Agent, VS Code, React and domain packages', () => {
    const productionSource = readdirSync(sourceRoot)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => readFileSync(resolve(sourceRoot, file), 'utf8'))
      .join('\n');

    expect(productionSource).not.toMatch(
      /from ['"](?:@neko\/agent|@neko\/platform|@neko\/asset|vscode|react)/,
    );
    expect(productionSource).not.toMatch(/packages\/(?:neko-agent|neko-cut|neko-assets)/);
  });
});
