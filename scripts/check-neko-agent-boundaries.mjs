#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hostNeutralRoots = [
  'packages/agent/runtime/src',
  'packages/agent/contracts/src',
  'packages/ai/sdk/src',
];
const browserRoots = ['packages/agent/webview/src'];

export async function checkNekoAgentBoundaries(root = repositoryRoot) {
  const findings = [];
  const hostNeutralFiles = [];
  const browserFiles = [];
  for (const sourceRoot of hostNeutralRoots) {
    await collectProductionFiles(resolve(root, sourceRoot), hostNeutralFiles);
  }
  for (const sourceRoot of browserRoots) {
    await collectProductionFiles(resolve(root, sourceRoot), browserFiles);
  }

  for (const file of hostNeutralFiles) {
    const relativeFile = normalize(relative(root, file));
    const source = await readFile(file, 'utf8');
    for (const specifier of extractImportSpecifiers(source)) {
      if (
        specifier === 'electron' ||
        specifier === 'vscode' ||
        specifier.startsWith('apps/') ||
        specifier.includes('/apps/neko-desktop/')
      ) {
        findings.push(`${relativeFile}: host-neutral Agent code imports ${specifier}`);
      }
      if (specifier === 'react' || specifier.startsWith('react-dom')) {
        findings.push(`${relativeFile}: Agent runtime code must not own React presentation`);
      }
    }
  }

  for (const file of browserFiles) {
    const relativeFile = normalize(relative(root, file));
    const source = await readFile(file, 'utf8');
    for (const specifier of extractImportSpecifiers(source)) {
      if (specifier === 'electron' || specifier === 'vscode' || specifier.startsWith('node:')) {
        findings.push(`${relativeFile}: Agent Webview imports prohibited host API ${specifier}`);
      }
    }
    if (/\bacquireVsCodeApi\b/u.test(source)) {
      findings.push(`${relativeFile}: Agent Webview retains removed VS Code API acquisition`);
    }
  }

  const agentComposition = await readFile(
    resolve(root, 'packages/agent/runtime/src/application/agent-controller-composition.ts'),
    'utf8',
  );
  if (!agentComposition.includes("from '@neko/agent-runtime/runtime/host-controller'")) {
    findings.push(
      'Agent application composition must consume the public host-controller runtime contract.',
    );
  }
  const desktopBridge = await readFile(
    resolve(root, 'apps/neko-desktop/src/main/desktop-agent-bridge-runtime.ts'),
    'utf8',
  );
  if (!desktopBridge.includes("from '@neko/agent-runtime/application'")) {
    findings.push('Desktop Agent bridge must consume the package-owned application contract.');
  }
  for (const forbidden of [
    'PiConversationRuntime',
    'NodePiConversationAuthority',
    'ConfigManager',
    'buildAgentPluginRuntimeGeneration',
  ]) {
    if (desktopBridge.includes(forbidden)) {
      findings.push(`Desktop Agent bridge retains package-owned business runtime ${forbidden}`);
    }
  }

  return {
    status: findings.length === 0 ? 'passed' : 'failed',
    checkedFiles: hostNeutralFiles.length + browserFiles.length + 2,
    findings,
  };
}

async function collectProductionFiles(directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage', '__tests__'].includes(entry.name)) continue;
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await collectProductionFiles(file, files);
    } else if (
      entry.isFile() &&
      /\.[cm]?[jt]sx?$/u.test(entry.name) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry.name)
    ) {
      files.push(file);
    }
  }
}

function extractImportSpecifiers(source) {
  return [
    ...source.matchAll(
      /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gu,
    ),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu),
  ].map((match) => match[1]);
}

function normalize(value) {
  return value.replaceAll('\\', '/');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkNekoAgentBoundaries();
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'failed') {
    process.stderr.write(output);
    process.exitCode = 1;
  } else {
    process.stdout.write(output);
  }
}
