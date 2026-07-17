import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(packageRoot, 'src');
const approvedVSCodeTransportFiles = new Set(['messages/index.ts']);

const forbiddenHostNeutralPatterns = [
  {
    pattern: /window\.vscodeApi/u,
    replacement: 'use the injected AgentHostRuntimeAdapter facade',
  },
  {
    pattern: /acquireVsCodeApi/u,
    replacement: 'use @neko/shared/vscode only inside the VSCode transport adapter',
  },
  {
    pattern: /@neko\/shared\/vscode/u,
    replacement: 'delegate through messages/index.ts or an injected host adapter',
  },
  {
    pattern: /\bVSCodeMessages\b/u,
    replacement: 'use AgentHostMessages or useAgentHostRuntime',
  },
] as const;

describe('Agent Webview host runtime boundary', () => {
  it('keeps concrete VSCode transport usage inside the approved adapter facade', () => {
    const violations = listProductionSources(srcRoot).flatMap((filePath) => {
      const relativePath = relative(srcRoot, filePath);
      if (approvedVSCodeTransportFiles.has(relativePath)) {
        return [];
      }

      const source = readFileSync(filePath, 'utf8');
      return forbiddenHostNeutralPatterns
        .filter((forbidden) => forbidden.pattern.test(source))
        .map(
          (forbidden) => `${relativePath} matches ${forbidden.pattern}: ${forbidden.replacement}`,
        );
    });

    expect(violations).toEqual([]);
  });

  it('keeps the approved VSCode transport adapter behind the host-neutral facade', () => {
    const messagesSource = readFileSync(join(srcRoot, 'messages/index.ts'), 'utf8');

    expect(messagesSource).toContain('createVSCodeAgentHostRuntimeAdapter');
    expect(messagesSource).toContain('setAgentHostRuntimeAdapter');
    expect(messagesSource).not.toContain('VSCodeMessages');
  });
});

function listProductionSources(dirPath: string): readonly string[] {
  const result: string[] = [];
  for (const entry of readdirSync(dirPath)) {
    const entryPath = join(dirPath, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      if (entry === '__tests__') {
        continue;
      }
      result.push(...listProductionSources(entryPath));
      continue;
    }
    if (!isProductionSource(entryPath)) {
      continue;
    }
    result.push(entryPath);
  }
  return result;
}

function isProductionSource(filePath: string): boolean {
  const extension = extname(filePath);
  return (
    (extension === '.ts' || extension === '.tsx') &&
    !filePath.endsWith('.test.ts') &&
    !filePath.endsWith('.test.tsx')
  );
}
