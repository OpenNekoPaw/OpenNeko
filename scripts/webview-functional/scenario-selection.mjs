import { appendFile, readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRepoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GLOBAL_FUNCTIONAL_INPUTS = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
]);
const scenarioDiscoveryCache = new Map();
const workspaceDiscoveryCache = new Map();

export async function selectFunctionalScenarios(changedFiles, options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const tier = options.tier ?? 'p0';
  const host = options.host ?? 'vscode';
  const normalizedFiles = changedFiles.map(normalizePath).filter(Boolean);
  const scenarios = await getScenarios(repoRoot);
  const matchingScenarios = scenarios.filter(
    (entry) => entry.scenario.tier === tier && entry.scenario.host === host,
  );

  if (normalizedFiles.some(isGlobalFunctionalInput)) {
    return matchingScenarios.map((entry) => entry.path);
  }

  const workspaces = await getWorkspaces(repoRoot);
  const workspaceByName = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
  const changedWorkspaceNames = new Set(
    normalizedFiles.flatMap((file) => {
      const owner = workspaces
        .filter((workspace) => file === workspace.path || file.startsWith(`${workspace.path}/`))
        .sort((left, right) => right.path.length - left.path.length)[0];
      return owner ? [owner.name] : [];
    }),
  );

  return matchingScenarios
    .filter((entry) => {
      const roots = resolveScenarioWorkspaceNames(entry.scenario, workspaces);
      const dependencyClosure = collectWorkspaceDependencyClosure(roots, workspaceByName);
      return [...changedWorkspaceNames].some((name) => dependencyClosure.has(name));
    })
    .map((entry) => entry.path);
}

function isGlobalFunctionalInput(file) {
  return (
    GLOBAL_FUNCTIONAL_INPUTS.has(file) ||
    file.startsWith('.github/workflows/') ||
    file.startsWith('scripts/webview-functional/') ||
    file.startsWith('quality/functional-')
  );
}

function resolveScenarioWorkspaceNames(scenario, workspaces) {
  const roots = new Set();
  for (const extension of scenario.extensions ?? []) {
    const ownedWorkspaces = workspaces.filter(
      (candidate) =>
        candidate.path === extension.developmentPath ||
        candidate.path.startsWith(`${extension.developmentPath}/`),
    );
    if (ownedWorkspaces.length === 0) {
      throw new Error(
        `Scenario ${scenario.id} references unknown development workspace ${extension.developmentPath}`,
      );
    }
    for (const workspace of ownedWorkspaces) roots.add(workspace.name);
  }
  const owner = workspaces.find((workspace) => workspace.name === scenario.ownerPackage);
  if (owner) roots.add(owner.name);
  return roots;
}

function collectWorkspaceDependencyClosure(rootNames, workspaceByName) {
  const visited = new Set();
  const pending = [...rootNames];
  while (pending.length > 0) {
    const name = pending.pop();
    if (!name || visited.has(name)) continue;
    visited.add(name);
    const workspace = workspaceByName.get(name);
    if (!workspace) continue;
    for (const dependencyName of workspace.dependencies) {
      if (workspaceByName.has(dependencyName)) pending.push(dependencyName);
    }
  }
  return visited;
}

function getScenarios(repoRoot) {
  if (!scenarioDiscoveryCache.has(repoRoot)) {
    scenarioDiscoveryCache.set(
      repoRoot,
      discoverScenarios(resolve(repoRoot, 'scripts/webview-functional/scenarios'), repoRoot),
    );
  }
  return scenarioDiscoveryCache.get(repoRoot);
}

function getWorkspaces(repoRoot) {
  if (!workspaceDiscoveryCache.has(repoRoot)) {
    workspaceDiscoveryCache.set(
      repoRoot,
      Promise.all([
        discoverWorkspaces(resolve(repoRoot, 'apps'), repoRoot),
        discoverWorkspaces(resolve(repoRoot, 'packages'), repoRoot),
      ]).then((workspaceGroups) => workspaceGroups.flat()),
    );
  }
  return workspaceDiscoveryCache.get(repoRoot);
}

async function discoverScenarios(root, repoRoot) {
  const entries = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      entries.push(...(await discoverScenarios(path, repoRoot)));
    } else if (entry.isFile() && entry.name.endsWith('.scenario.json')) {
      entries.push({
        path: normalizePath(relative(repoRoot, path)),
        scenario: JSON.parse(await readFile(path, 'utf8')),
      });
    }
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

async function discoverWorkspaces(root, repoRoot, depth = 0) {
  if (depth > 4) return [];
  const entries = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const path = join(root, entry.name);
    if (entry.isFile() && entry.name === 'package.json') {
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      const dependencyRecords = [
        manifest.dependencies,
        manifest.devDependencies,
        manifest.optionalDependencies,
        manifest.peerDependencies,
      ];
      entries.push({
        name: manifest.name,
        path: normalizePath(relative(repoRoot, dirname(path))),
        dependencies: new Set(dependencyRecords.flatMap((record) => Object.keys(record ?? {}))),
      });
    } else if (entry.isDirectory()) {
      entries.push(...(await discoverWorkspaces(path, repoRoot, depth + 1)));
    }
  }
  return entries;
}

function normalizePath(path) {
  return path.trim().replaceAll('\\', '/');
}

async function main() {
  const files = (await readStdin()).split(/\r?\n/u).filter(Boolean);
  const scenarios = await selectFunctionalScenarios(files);
  const outputIndex = process.argv.indexOf('--github-output');
  if (outputIndex >= 0) {
    const outputPath = process.argv[outputIndex + 1];
    if (!outputPath) throw new Error('--github-output requires a path');
    await appendFile(
      outputPath,
      `functional_scenarios=${JSON.stringify(scenarios)}\nfunctional=${scenarios.length > 0}\n`,
      'utf8',
    );
    return;
  }
  process.stdout.write(`${JSON.stringify({ scenarios }, null, 2)}\n`);
}

function readStdin() {
  return new Promise((resolvePromise, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => resolvePromise(input));
    process.stdin.on('error', reject);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
