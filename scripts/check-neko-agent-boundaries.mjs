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
const retiredAgentArtifactMarkers = Object.freeze([
  ['@mariozechner/pi-', 'Pi runtime dependency'],
  ['@neko/agent-runtime/pi', 'Pi runtime import'],
  ['agentLaunch', 'retired Agent launch bridge'],
  ['confirmTool', 'retired Tool confirmation bridge'],
  ['agentAutomation', 'retired Agent automation bridge'],
  ['AgentDraftSubmitInput', 'retired Draft submit contract'],
  ['parseAgentDraftSubmitInput', 'retired Draft submit parser'],
  ['draft-bind', 'retired Draft binding step'],
  ['draft-submit', 'retired Draft submit step'],
  ['draft-rejection', 'retired Draft rejection assertion'],
  ['draft.binding.update', 'retired Draft binding operation'],
  ['draft.input.submit', 'retired Draft submit operation'],
  ['send-queued-now', 'retired send-now operation'],
  ['queue-state', 'retired queue assertion'],
  ['pi-runtime', 'retired Pi Evaluation assertion'],
  ['projectionEvents', 'retired projection event facts'],
  ['messageQueue', 'retired OpenNeko queue facts'],
]);
const retiredAgentEvaluationMarkers = Object.freeze([
  ...retiredAgentArtifactMarkers,
  ['Pi ', 'retired Pi authority'],
]);
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
      findings.push(
        `${path}: Desktop Agent production path contains a retired direct runtime bridge`,
      );
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

export function validateRetiredAgentArtifactSources(
  sources,
  markers = retiredAgentArtifactMarkers,
) {
  const findings = [];
  for (const [path, source] of Object.entries(sources)) {
    for (const [marker, label] of markers) {
      if (source.includes(marker)) {
        findings.push(`${path}: contains ${label} marker '${marker}'`);
      }
    }
  }
  return findings;
}

export async function checkNekoAgentBoundaries(root = repositoryRoot, options = {}) {
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
        .filter((file) =>
          /(?:^|\/)desktop-(?:agent|dsh)-|DesktopAgentSurface/u.test(normalize(file)),
        )
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

  const evaluation = await findRetiredAgentEvaluationFindings(root);
  findings.push(...evaluation.findings);

  const agentContractsIndex = await readFile(
    resolve(root, 'packages/agent/contracts/src/index.ts'),
    'utf8',
  );
  for (const retiredExport of ["'./mcp'", "'./pi'", "'./plugin-runtime'", "'./skill-host'"]) {
    if (agentContractsIndex.includes(retiredExport)) {
      findings.push(`packages/agent/contracts/src/index.ts: retains ${retiredExport}`);
    }
  }

  let builtOutputCount = 0;
  if (options.includeBuiltOutput === true) {
    const builtOutput = await findRetiredAgentBuiltOutputFindings(root);
    builtOutputCount = builtOutput.checkedFiles;
    findings.push(...builtOutput.findings);
  }

  return {
    status: findings.length === 0 ? 'passed' : 'failed',
    checkedFiles:
      hostNeutralFiles.length +
      browserFiles.length +
      evaluation.checkedFiles +
      builtOutputCount +
      5,
    findings,
  };
}

export async function findRetiredAgentEvaluationFindings(root) {
  const files = [];
  await collectEvaluationContractFiles(resolve(root, 'scripts/agent-eval'), files);
  const sources = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [normalize(relative(root, file)), await readFile(file, 'utf8')]),
    ),
  );
  return {
    checkedFiles: files.length,
    findings: validateRetiredAgentArtifactSources(sources, retiredAgentEvaluationMarkers),
  };
}

export async function findRetiredAgentBuiltOutputFindings(root) {
  const sources = {};
  for (const directory of ['apps/neko-desktop/.vite/build', 'apps/neko-desktop/dist/assets']) {
    const files = [];
    await collectBuiltJavaScriptFiles(resolve(root, directory), files);
    for (const file of files) {
      sources[normalize(relative(root, file))] = await readFile(file, 'utf8');
    }
  }

  const asarPaths = [];
  await collectFilesNamed(resolve(root, 'apps/neko-desktop/out'), 'app.asar', asarPaths);
  if (asarPaths.length > 0) {
    const { extractFile, listPackage } = await import('@electron/asar');
    for (const asarPath of asarPaths) {
      const entries = listPackage(asarPath).filter(
        (entry) =>
          /\/\.vite\/build\/(?:main|preload)\.cjs$/u.test(entry) ||
          /\/\.vite\/renderer\/main_window\/assets\/(?:main-root|root)-[^/]+\.js$/u.test(entry),
      );
      for (const entry of entries) {
        sources[`${normalize(relative(root, asarPath))}${entry}`] = extractFile(
          asarPath,
          entry.replace(/^\//u, ''),
        ).toString('utf8');
      }
    }
  }

  return {
    checkedFiles: Object.keys(sources).length,
    findings: validateRetiredAgentArtifactSources(sources),
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
    'packages/agent/contracts/src/external-research.ts',
    'packages/agent/contracts/src/agent-capability-diagnostics.ts',
    'packages/agent/contracts/src/agent-capability-lifecycle.ts',
    'packages/agent/contracts/src/agent-capability.ts',
    'packages/agent/contracts/src/agent-draft-submit.ts',
    'packages/agent/contracts/src/agent-turn-timeline.ts',
    'packages/agent/contracts/src/capability.ts',
    'packages/agent/contracts/src/conversation-projection.ts',
    'packages/agent/contracts/src/domain-routing.ts',
    'packages/agent/contracts/src/perception-tool.ts',
    'packages/agent/contracts/src/plugin-command-contract.ts',
    'packages/agent/contracts/src/plugin-slash-command.ts',
    'packages/agent/contracts/src/portable-skill.ts',
    'packages/agent/contracts/src/prompt-fragment.ts',
    'packages/agent/contracts/src/reference-contributor.ts',
    'packages/agent/contracts/src/resource-display-projection.ts',
    'packages/agent/contracts/src/skill.ts',
    'packages/agent/runtime/src/runtime/session/conversation-run-registry.ts',
    'packages/agent/runtime/src/runtime/session/execution-ownership.ts',
    'packages/agent/runtime/src/runtime/turn/creator-visible-artifact-collector.ts',
    'packages/agent/runtime/src/extensions/plugin-runtime.ts',
    'packages/agent/runtime/src/pi/skill-host.ts',
    'packages/host/src/settings/mcp-server-config.ts',
    'packages/host/src/settings/types/config.ts',
  ]) {
    if (await pathExists(resolve(root, retiredPath))) {
      findings.push(`${retiredPath}: retired Agent path must remain deleted.`);
    }
  }
  for (const retiredDirectory of [
    'apps/neko-desktop/resources/extensions/plugins',
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

async function collectEvaluationContractFiles(directory, files) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (['node_modules', 'reports', 'shared-fixtures'].includes(entry.name)) continue;
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await collectEvaluationContractFiles(file, files);
    } else if (
      entry.isFile() &&
      (/\.json$/u.test(entry.name) || /\.mjs$/u.test(entry.name)) &&
      !/\.test\.mjs$/u.test(entry.name)
    ) {
      files.push(file);
    }
  }
}

async function collectBuiltJavaScriptFiles(directory, files) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await collectBuiltJavaScriptFiles(file, files);
    } else if (entry.isFile() && /\.(?:cjs|js)$/u.test(entry.name)) {
      files.push(file);
    }
  }
}

async function collectFilesNamed(directory, name, files) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFilesNamed(file, name, files);
    } else if (entry.isFile() && entry.name === name) {
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
  const result = await checkNekoAgentBoundaries(repositoryRoot, {
    includeBuiltOutput: process.argv.includes('--include-built-output'),
  });
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'failed') {
    process.stderr.write(output);
    process.exitCode = 1;
  } else {
    process.stdout.write(output);
  }
}
