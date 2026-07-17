import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(__dirname, '../../../../../');
const BOUNDARY_SOURCE_ROOTS = [
  'packages/neko-canvas/packages/extension/src',
  'packages/neko-canvas/packages/webview/src',
  'packages/neko-agent/packages/extension/src',
  'packages/neko-agent/packages/platform/src',
  'packages/neko-agent/packages/webview/src',
  'packages/neko-agent/packages/agent/src',
  'packages/neko-agent/packages/agent-types/src',
  'packages/neko-agent/packages/ai-sdk/src',
];
const PROHIBITED_PATTERNS = [
  /panorama-image\/PanoramicViewer/,
  /src\/panorama-image/,
  /PanoramicViewer/,
  /from ['"][^'"]*neko-preview[^'"]*packages\/webview/,
  /from ['"][^'"]*neko-preview[^'"]*providers\/Panoramic/,
];

describe('panoramic preview boundary', () => {
  it('keeps Canvas and Agent from importing or mounting the panoramic WebGL viewer', () => {
    const offenders: string[] = [];

    for (const root of BOUNDARY_SOURCE_ROOTS) {
      for (const filePath of collectSourceFiles(join(REPO_ROOT, root))) {
        const content = readFileSync(filePath, 'utf8');
        if (PROHIBITED_PATTERNS.some((pattern) => pattern.test(content))) {
          offenders.push(relative(REPO_ROOT, filePath));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const result: string[] = [];

  for (const entry of entries) {
    if (entry === 'dist' || entry === 'node_modules') continue;
    const filePath = join(dir, entry);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      result.push(...collectSourceFiles(filePath));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      result.push(filePath);
    }
  }

  return result;
}
