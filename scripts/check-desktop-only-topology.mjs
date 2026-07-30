import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_SOURCE_PATTERNS = [
  { label: 'vscode import', pattern: /\bfrom\s+['"]vscode['"]|\brequire\(\s*['"]vscode['"]\s*\)/u },
  { label: 'VS Code Webview API', pattern: /\bacquireVsCodeApi\b/u },
];

const FORBIDDEN_ROOT_SCRIPT_PATTERN =
  /(?:^|:)(?:vscode|vsix)(?::|$)|\b(?:vscode|vsix|neko-tui|app-tui)\b/iu;

export function inspectDesktopOnlyTopology({
  appPackagePaths,
  nestedPackagePaths,
  productionSourceEntries,
  rootPackageJson,
}) {
  const violations = [];
  const normalizedApps = [...appPackagePaths].sort();
  if (normalizedApps.length !== 1 || normalizedApps[0] !== 'apps/neko-desktop/package.json') {
    violations.push(
      `Expected only apps/neko-desktop/package.json, found: ${normalizedApps.join(', ') || '<none>'}.`,
    );
  }

  for (const packagePath of [...nestedPackagePaths].sort()) {
    violations.push(`Nested workspace package is forbidden: ${packagePath}.`);
  }

  for (const entry of productionSourceEntries) {
    if (entry.path.includes('/host-vscode/')) {
      violations.push(`VS Code host adapter is forbidden: ${entry.path}.`);
    }
    for (const forbidden of FORBIDDEN_SOURCE_PATTERNS) {
      if (forbidden.pattern.test(entry.content)) {
        violations.push(`${forbidden.label} is forbidden: ${entry.path}.`);
      }
    }
  }

  for (const [name, command] of Object.entries(rootPackageJson.scripts ?? {})) {
    if (
      FORBIDDEN_ROOT_SCRIPT_PATTERN.test(name) ||
      (typeof command === 'string' && FORBIDDEN_ROOT_SCRIPT_PATTERN.test(command))
    ) {
      violations.push(`Removed-host root script is forbidden: ${name}.`);
    }
  }

  for (const section of ['dependencies', 'devDependencies']) {
    for (const dependency of Object.keys(rootPackageJson[section] ?? {})) {
      if (dependency === '@types/vscode' || dependency.startsWith('@vscode/')) {
        violations.push(`Removed-host root dependency is forbidden: ${dependency}.`);
      }
    }
  }

  return violations;
}

export async function inspectDesktopOnlyRepository(repositoryRoot) {
  const [appPackagePaths, nestedPackagePaths, productionSourceEntries, rootPackageJson] =
    await Promise.all([
      findAppPackages(repositoryRoot),
      findNestedPackages(repositoryRoot),
      readProductionSources(repositoryRoot),
      readJson(path.join(repositoryRoot, 'package.json')),
    ]);
  return inspectDesktopOnlyTopology({
    appPackagePaths,
    nestedPackagePaths,
    productionSourceEntries,
    rootPackageJson,
  });
}

async function findAppPackages(repositoryRoot) {
  const appsRoot = path.join(repositoryRoot, 'apps');
  const entries = await safeDirectoryEntries(appsRoot);
  const packagePaths = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relativePath = path.posix.join('apps', entry.name, 'package.json');
    if (await isFile(path.join(repositoryRoot, relativePath))) packagePaths.push(relativePath);
  }
  return packagePaths;
}

async function findNestedPackages(repositoryRoot) {
  const packageRoot = path.join(repositoryRoot, 'packages');
  const packageJsonPaths = await findFiles(packageRoot, (filePath) =>
    filePath.endsWith(`${path.sep}package.json`),
  );
  return packageJsonPaths
    .map((filePath) => toRepositoryPath(repositoryRoot, filePath))
    .filter((filePath) => {
      const segments = filePath.split('/');
      return segments.length > 3;
    });
}

async function readProductionSources(repositoryRoot) {
  const roots = ['apps', 'packages'].map((directory) => path.join(repositoryRoot, directory));
  const sourcePaths = (
    await Promise.all(
      roots.map((root) => findFiles(root, (filePath) => /\.(?:[cm]?[jt]sx?)$/u.test(filePath))),
    )
  ).flat();
  return Promise.all(
    sourcePaths.map(async (filePath) => ({
      path: toRepositoryPath(repositoryRoot, filePath),
      content: await readFile(filePath, 'utf8'),
    })),
  );
}

async function findFiles(root, matches) {
  const files = [];
  const entries = await safeDirectoryEntries(root);
  for (const entry of entries) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === 'coverage' ||
      entry.name === 'reports'
    ) {
      continue;
    }
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFiles(entryPath, matches)));
    } else if (entry.isFile() && matches(entryPath)) {
      files.push(entryPath);
    }
  }
  return files;
}

async function safeDirectoryEntries(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) return [];
    throw error;
  }
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (isMissingPathError(error)) return false;
    throw error;
  }
}

function isMissingPathError(error) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function toRepositoryPath(repositoryRoot, filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join('/');
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  const repositoryRoot = path.resolve(process.argv[2] ?? process.cwd());
  const violations = await inspectDesktopOnlyRepository(repositoryRoot);
  if (violations.length > 0) {
    process.stderr.write(`${violations.join('\n')}\n`);
    process.exitCode = 1;
  }
}
