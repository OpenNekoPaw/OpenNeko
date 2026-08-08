#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  surface: 'apps/neko-desktop/src/renderer/DesktopCanvasSurface.tsx',
  hostRuntime: 'apps/neko-desktop/src/renderer/desktop-canvas-host-runtime.ts',
  workspace: 'packages/canvas/webview/src/components/playback/PlaybackWorkspace.tsx',
};

export async function checkCanvasPlaybackBoundary(root = repositoryRoot) {
  const sources = Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([key, file]) => [
        key,
        await readFile(resolve(root, file), 'utf8'),
      ]),
    ),
  );
  const findings = [];

  if (!hasCanvasPublicRootImport(sources.surface)) {
    findings.push(`${files.surface}: Desktop Canvas must mount the public Canvas Webview root.`);
  }
  requireAnchor(
    findings,
    'surface',
    sources.surface,
    'createElectronCanvasHostRuntime(identity)',
    'Desktop Canvas must inject an instance-scoped host runtime.',
  );
  requireAnchor(
    findings,
    'hostRuntime',
    sources.hostRuntime,
    'window.openNekoDesktop.canvas',
    'Canvas renderer operations must cross the typed preload boundary.',
  );
  requireAnchor(
    findings,
    'workspace',
    sources.workspace,
    'usePlaybackStore',
    'PlaybackWorkspace must consume the canonical Canvas playback store.',
  );

  for (const source of Object.values(sources)) {
    if (/\bacquireVsCodeApi\b|\bvscode\./u.test(source)) {
      findings.push('Canvas canonical path must not retain VS Code runtime access.');
      break;
    }
  }

  return { status: findings.length === 0 ? 'passed' : 'failed', findings };
}

function requireAnchor(findings, key, source, anchor, message) {
  if (!source.includes(anchor)) findings.push(`${files[key]}: ${message}`);
}

function hasCanvasPublicRootImport(source) {
  const sourceFile = ts.createSourceFile(
    files.surface,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let found = false;
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === '@neko/canvas-webview/root') ||
      (ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === '@neko/canvas-webview/root')
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkCanvasPlaybackBoundary();
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'failed') {
    process.stderr.write(output);
    process.exitCode = 1;
  } else {
    process.stdout.write(output);
  }
}
