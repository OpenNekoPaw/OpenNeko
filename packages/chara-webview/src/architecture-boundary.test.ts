import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = import.meta.dirname;

describe('Character Webview architecture boundary', () => {
  it('keeps the browser product surface on injected public contracts', () => {
    const forbidden = ['electron', 'node:', '@neko/agent-runtime', '@neko/world/application'];
    const violations = walkTypeScript(sourceRoot).flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      return forbidden
        .filter((specifier) => containsModuleSpecifier(content, specifier))
        .map((specifier) => `${path.basename(file)} -> ${specifier}`);
    });

    expect(violations).toEqual([]);
    expect(readFileSync(path.join(sourceRoot, 'root.tsx'), 'utf8')).not.toContain(
      'window.openNekoDesktop',
    );
  });

  it('keeps version and portable views free of Workspace, controller and raw file authority', () => {
    const presentationSources = [
      'character-version-workspace.tsx',
      'character-portable-package-surface.tsx',
      'character-management-detail.tsx',
    ].map((file) => readFileSync(path.join(sourceRoot, file), 'utf8'));

    for (const source of presentationSources) {
      expect(source).not.toMatch(/window\.openNekoDesktop|archiveBytes|workspaceGrantId/u);
      expect(source).not.toMatch(/file:\/\/|\/Users\/|[A-Z]:\\/u);
    }
    expect(presentationSources[1]).not.toMatch(/workspaceId|windowId|controller/u);

    const style = readFileSync(path.join(sourceRoot, 'style.css'), 'utf8');
    expect(style).toContain('@container (max-width: 620px)');
    expect(style).toContain('@container (max-width: 420px)');
    expect(style).toContain('@container (max-width: 760px)');
    const detail = style.match(/\.character-management-detail\s*\{(?<body>[\s\S]*?)\n\}/u);
    expect(detail?.groups?.body).toMatch(/border\s*:\s*0/u);
    expect(detail?.groups?.body).toMatch(/border-radius\s*:\s*0/u);
    expect(detail?.groups?.body).toMatch(/overflow\s*:\s*visible/u);
    expect(style).toMatch(/\.character-management--detail\s*\{[^}]*overflow-y\s*:\s*auto/u);
  });
});

function walkTypeScript(directory: string): string[] {
  return readdirSync(directory)
    .flatMap((entry) => {
      const file = path.join(directory, entry);
      return statSync(file).isDirectory() ? walkTypeScript(file) : [file];
    })
    .filter(
      (file) =>
        (file.endsWith('.ts') || file.endsWith('.tsx')) &&
        !file.endsWith('architecture-boundary.test.ts'),
    );
}

function containsModuleSpecifier(content: string, specifier: string): boolean {
  return [
    `from '${specifier}`,
    `from "${specifier}`,
    `import '${specifier}`,
    `import "${specifier}`,
  ].some((token) => content.includes(token));
}
