#!/usr/bin/env node

import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hostNeutralRoots = [
  'packages/agent/runtime/src',
  'packages/agent/contracts/src',
  'packages/ai/sdk/src',
];
const browserRoots = ['packages/agent/webview/src'];
const forbiddenDesktopAgentExecutionTokens = Object.freeze([
  ['@deepseek-ai/cordis', 'embedded Cordis'],
  ['@deepseek-ai/dsh-sdk-client', 'DSH TypeScript SDK'],
  ['DeepSeekHarness', 'DSH SDK client'],
  ['deepseek_harness', 'DSH Python SDK'],
  ['ELECTRON_RUN_AS_NODE', 'Electron RunAsNode'],
  ['process.execPath', 'Electron executable as Node'],
  ['ctx.agents', 'embedded DSH Agent runtime'],
  ['@mariozechner/pi-', 'Pi runtime dependency'],
]);

export function validateDesktopAgentExecutionSurface(input) {
  const findings = [];
  for (const [path, source] of Object.entries(input.sources ?? {})) {
    for (const [token, label] of forbiddenDesktopAgentExecutionTokens) {
      if (source.includes(token)) {
        findings.push(`${path}: Desktop Agent production path contains ${label}`);
      }
    }
    if (/\b(?:agentLaunch|confirmTool|agentAutomation)\b/u.test(source)) {
      findings.push(`${path}: Desktop Agent production path contains a retired direct runtime bridge`);
    }
  }
  for (const [path, manifest] of Object.entries(input.manifests ?? {})) {
    const dependencies = { ...manifest.dependencies, ...manifest.optionalDependencies };
    for (const dependency of Object.keys(dependencies)) {
      if (
        dependency === '@deepseek-ai/cordis' ||
        dependency === '@deepseek-ai/dsh-sdk-client' ||
        dependency.startsWith('@mariozechner/pi-')
      ) {
        findings.push(`${path}: Desktop Agent production manifest contains ${dependency}`);
      }
    }
  }
  return findings;
}

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

  const acpClient = await readFile(
    resolve(root, 'packages/agent/runtime/src/acp/dsh-acp-application-client.ts'),
    'utf8',
  );
  if (!acpClient.includes("from '@agentclientprotocol/sdk'")) {
    findings.push(
      'Host-neutral Agent runtime must consume the official ACP SDK at its protocol boundary.',
    );
  }
  if (/from ['"](?:electron|node:child_process)['"]/u.test(acpClient)) {
    findings.push('Host-neutral ACP application client imports a Desktop process API.');
  }

  const desktopSupervisor = await readFile(
    resolve(root, 'apps/neko-desktop/src/main/desktop-dsh-subprocess-supervisor.ts'),
    'utf8',
  );
  if (!desktopSupervisor.includes("from '@neko/agent-runtime/acp'")) {
    findings.push('Desktop DSH supervisor must consume the package-owned ACP byte transport.');
  }
  if (desktopSupervisor.includes('@agentclientprotocol/sdk')) {
    findings.push('Desktop DSH supervisor must not own ACP protocol policy.');
  }
  const desktopSessionHost = await readFile(
    resolve(root, 'apps/neko-desktop/src/main/desktop-dsh-session-host.ts'),
    'utf8',
  );
  if (!desktopSessionHost.includes("from '@neko/agent-runtime/application'")) {
    findings.push('Desktop DSH Session host must consume the package-owned application contract.');
  }
  if (!desktopSessionHost.includes("from '@neko/agent-runtime/acp'")) {
    findings.push('Desktop DSH Session host must consume the package-owned ACP projection.');
  }

  const desktopAgentFiles = [];
  await collectProductionFiles(resolve(root, 'apps/neko-desktop/src'), desktopAgentFiles);
  const desktopAgentSources = Object.fromEntries(
    await Promise.all(
      desktopAgentFiles
        .filter((file) => /(?:^|\/)desktop-(?:agent|dsh)-|DesktopAgentSurface/u.test(normalize(file)))
        .map(async (file) => [normalize(relative(root, file)), await readFile(file, 'utf8')]),
    ),
  );
  findings.push(
    ...validateDesktopAgentExecutionSurface({
      sources: desktopAgentSources,
      manifests: {
        'apps/neko-desktop/package.json': JSON.parse(
          await readFile(resolve(root, 'apps/neko-desktop/package.json'), 'utf8'),
        ),
      },
    }),
  );

  const desktopPreload = await readFile(
    resolve(root, 'apps/neko-desktop/src/preload/index.ts'),
    'utf8',
  );
  const desktopRenderer = await readFile(
    resolve(root, 'apps/neko-desktop/src/renderer/DesktopAgentSurface.tsx'),
    'utf8',
  );
  for (const [surface, source] of [
    ['Desktop preload', desktopPreload],
    ['Desktop Agent surface', desktopRenderer],
  ]) {
    if (!source.includes('dshSessions') || !source.includes('dshPermissions')) {
      findings.push(`${surface} must consume the canonical DSH Session and Permission bridges.`);
    }
    for (const forbidden of ['DESKTOP_AGENT_CHANNELS', 'agentLaunch', 'assistantResources']) {
      if (source.includes(forbidden)) {
        findings.push(`${surface} retains retired Agent bridge surface ${forbidden}.`);
      }
    }
  }

  findings.push(...(await findRetiredAgentPathFindings(root)));

  const agentContractsIndex = await readFile(
    resolve(root, 'packages/agent/contracts/src/index.ts'),
    'utf8',
  );
  for (const retiredExport of ["'./mcp'", "'./pi'", "'./plugin-runtime'", "'./skill-host'"]) {
    if (agentContractsIndex.includes(retiredExport)) {
      findings.push(`packages/agent/contracts/src/index.ts: retains ${retiredExport}`);
    }
  }

  return {
    status: findings.length === 0 ? 'passed' : 'failed',
    checkedFiles: hostNeutralFiles.length + browserFiles.length + 5,
    findings,
  };
}

export async function findRetiredAgentPathFindings(root) {
  const findings = [];
  for (const retiredPath of [
    'apps/neko-desktop/src/main/desktop-agent-bridge-runtime.ts',
    'apps/neko-desktop/src/main/desktop-workspace-board-delivery.ts',
    'apps/neko-desktop/src/shared/agent-contract.ts',
    'apps/neko-desktop/src/shared/agent-automation-contract.ts',
    'packages/agent/contracts/src/mcp.ts',
    'packages/agent/contracts/src/agent-turn-timeline.ts',
    'packages/agent/contracts/src/conversation-projection.ts',
    'packages/agent/runtime/src/runtime/session/conversation-run-registry.ts',
    'packages/agent/runtime/src/runtime/session/execution-ownership.ts',
    'packages/agent/runtime/src/runtime/turn/creator-visible-artifact-collector.ts',
    'packages/agent/runtime/src/extensions/plugin-runtime.ts',
    'packages/agent/runtime/src/pi/skill-host.ts',
  ]) {
    if (await pathExists(resolve(root, retiredPath))) {
      findings.push(`${retiredPath}: retired Agent path must remain deleted.`);
    }
  }
  for (const retiredDirectory of [
    'packages/agent/runtime/src/pi',
    'packages/agent/runtime/src/mcp',
    'packages/agent/runtime/src/extensions',
    'packages/agent/runtime/src/runtime/projection',
  ]) {
    if (await directoryContainsFiles(resolve(root, retiredDirectory))) {
      findings.push(`${retiredDirectory}: retired Agent directory must remain empty.`);
    }
  }
  return findings;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function directoryContainsFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isFile()) return true;
    if (entry.isDirectory() && (await directoryContainsFiles(resolve(directory, entry.name)))) {
      return true;
    }
  }
  return false;
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
