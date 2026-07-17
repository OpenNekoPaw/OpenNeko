#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = process.cwd();
const webviewRoots = findWebviewRoots(join(repoRoot, 'packages'));
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const nodeBuiltinModules = new Set([
  'assert',
  'buffer',
  'child_process',
  'crypto',
  'events',
  'fs',
  'http',
  'https',
  'net',
  'os',
  'path',
  'process',
  'stream',
  'url',
  'util',
  'zlib',
]);
const forbiddenBridgePatterns = [
  {
    rule: 'webview-no-direct-acquire-vscode-api',
    pattern: /\bacquireVsCodeApi\b/,
    message:
      'Production Webview source must not reference acquireVsCodeApi() directly. Use @neko/shared/vscode directly or a package-local typed facade that delegates to it.',
  },
  {
    rule: 'webview-no-global-vscode-api-shim',
    pattern: /__vscode_api__|__vscodeApi/,
    message:
      'Production Webview source must not use legacy global VS Code API shims. Import @neko/shared/vscode or an owning package typed facade instead.',
  },
  {
    rule: 'webview-no-window-vscode-bridge',
    pattern: /\bwindow\s*\.\s*vscode(?:Api)?\b/,
    message:
      'Production Webview source must not read window.vscode or window.vscodeApi directly. Route transport through @neko/shared/vscode or a typed facade.',
  },
  {
    rule: 'webview-no-package-local-mock-bridge-fallback',
    pattern:
      /\[mock postMessage\]|VSCode Webview API not available, using mock|acquireVsCodeApi not available, using mock/,
    message:
      'Production Webview source must not implement package-local mock postMessage fallback. Shared bridge no-op behavior and shared test utilities own non-VS Code behavior.',
  },
];
const forbiddenFoundationPatterns = [
  {
    rule: 'webview-no-production-console',
    pattern: /\bconsole\s*\.\s*(?:log|error|warn|info|debug)\s*\(/,
    message:
      'Production Webview source must not use direct console.* diagnostics. Use the package logger facade or @neko/shared logger registry.',
  },
  {
    rule: 'webview-no-local-i18n-service-bootstrap',
    pattern: /\bnew\s+I18nService\s*\(/,
    message:
      'Production Webview source must not bootstrap I18nService locally. Use createWebviewI18n from @neko/shared/i18n/webview.',
  },
  {
    rule: 'webview-no-local-locale-detection-bootstrap',
    pattern: /\bdetectWebviewLocale\s*\(/,
    message:
      'Production Webview source must not call detectWebviewLocale directly during package bootstrap. Use createWebviewI18n from @neko/shared/i18n/webview.',
  },
  {
    rule: 'webview-no-local-console-logger-bootstrap',
    pattern: /\bnew\s+ConsoleLogger\s*\(/,
    message:
      'Production Webview source must not create ConsoleLogger roots locally. Use createWebviewLoggerRegistry or a documented package logger facade.',
  },
];
const forbiddenPathRules = [
  {
    rule: 'webview-no-package-local-editable-target-helper',
    matches: (rel) => /\/utils\/editable-target\.[tj]sx?$/.test(rel),
    message:
      'Production Webview source must not keep package-local editable-target helpers. Use isEditableTarget/hasEditableActiveElement from @neko/ui/keyboard.',
  },
];
const forbiddenImportSpecifiers = [
  {
    rule: 'webview-no-obsolete-agent-keyboard-reporter-import',
    matches: (specifier) =>
      specifier.includes('useWebviewKeyboardReporting') &&
      !specifier.startsWith('./useWebviewKeyboardReporting'),
    message:
      'Production Webview source must not import obsolete package-local keyboard reporters across modules. Use @neko/ui/keyboard primitives or a local wrapper that delegates to them.',
  },
];

const findings = [];

for (const root of webviewRoots) {
  for (const file of walk(root)) {
    if (!isProductionSource(file)) continue;
    const content = readFileSync(file, 'utf8');
    const rel = relative(repoRoot, file);

    for (const check of forbiddenPathRules) {
      if (check.matches(rel)) {
        findings.push({
          rule: check.rule,
          file: rel,
          message: check.message,
        });
      }
    }

    for (const check of forbiddenBridgePatterns) {
      if (check.pattern.test(content)) {
        findings.push({
          rule: check.rule,
          file: rel,
          message: check.message,
        });
      }
    }

    for (const check of forbiddenFoundationPatterns) {
      if (check.pattern.test(stripComments(content))) {
        findings.push({
          rule: check.rule,
          file: rel,
          message: check.message,
        });
      }
    }

    for (const specifier of readImportSpecifiers(content)) {
      for (const check of forbiddenImportSpecifiers) {
        if (check.matches(specifier)) {
          findings.push({
            rule: check.rule,
            file: rel,
            message: check.message,
          });
        }
      }

      if (specifier === 'vscode') {
        findings.push({
          rule: 'webview-no-vscode-import',
          file: rel,
          message:
            'Webview source runs in the browser sandbox and must not import vscode. Request host capabilities through typed postMessage or @neko/shared/vscode.',
        });
      }

      const bareSpecifier = specifier.replace(/^node:/, '');
      if (specifier.startsWith('node:') || nodeBuiltinModules.has(bareSpecifier)) {
        findings.push({
          rule: 'webview-no-node-import',
          file: rel,
          message:
            'Webview source must not import Node modules. Move filesystem/workspace work to the Extension Host and call it through a typed message facade.',
        });
      }

      if (pointsToExtensionImplementation(specifier)) {
        findings.push({
          rule: 'webview-no-extension-implementation-import',
          file: rel,
          message:
            'Webview source must not import Extension implementation modules. Share contracts through @neko/shared, @neko/proto, or package-local typed message facades.',
        });
      }
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(
    `${JSON.stringify(
      {
        status: 'failed',
        checkedRoots: webviewRoots.map((root) => relative(repoRoot, root)),
        findings,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: 'passed',
      checkedRoots: webviewRoots.map((root) => relative(repoRoot, root)),
    },
    null,
    2,
  )}\n`,
);

function findWebviewRoots(packagesRoot) {
  const roots = [];
  for (const packageName of readdirSync(packagesRoot)) {
    const sourceRoot = join(packagesRoot, packageName, 'packages', 'webview', 'src');
    if (existsDirectory(sourceRoot)) {
      roots.push(sourceRoot);
    }
  }
  return roots;
}

function existsDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function* walk(path) {
  const stats = statSync(path);
  if (stats.isFile()) {
    if (sourceExtensions.has(readExtension(path))) {
      yield path;
    }
    return;
  }

  for (const entry of readdirSync(path)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
    yield* walk(join(path, entry));
  }
}

function readExtension(path) {
  const match = path.match(/(\.[^.]+)$/);
  return match?.[1] ?? '';
}

function isProductionSource(path) {
  return (
    !/\.d\.ts$/.test(path) &&
    !/\.(test|spec)\.[tj]sx?$/.test(path) &&
    !path.includes('/__tests__/') &&
    !path.includes('/test-utils/')
  );
}

function readImportSpecifiers(content) {
  const specifiers = [];
  const importExportPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const requirePattern = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const pattern of [importExportPattern, dynamicImportPattern, requirePattern]) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) {
        specifiers.push(match[1]);
      }
    }
  }
  return specifiers;
}

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function pointsToExtensionImplementation(specifier) {
  return (
    /(^|\/)packages\/extension(\/|$)/.test(specifier) ||
    /(^|\/)extension\/src(\/|$)/.test(specifier) ||
    /^@neko-[^/]+\/extension(\/|$)/.test(specifier)
  );
}
