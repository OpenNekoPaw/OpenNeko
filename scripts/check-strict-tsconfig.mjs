#!/usr/bin/env node

import { createRequire } from 'node:module';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function validateStrictCompilerOptions(label, options) {
  const findings = [];
  if (options.strict !== true) findings.push(`${label}: compilerOptions.strict must be true`);
  if (options.noUncheckedIndexedAccess !== true) {
    findings.push(`${label}: compilerOptions.noUncheckedIndexedAccess must be true`);
  }
  if (options.noImplicitOverride !== true) {
    findings.push(`${label}: compilerOptions.noImplicitOverride must be true`);
  }
  return findings;
}

export async function inspectStrictTsconfigs(root = repositoryRoot) {
  const catalog = JSON.parse(await readFile(path.join(root, 'quality/package-roles.json'), 'utf8'));
  const targets = [{ owner: 'Desktop application', config: 'apps/neko-desktop/tsconfig.json' }];
  const findings = [];

  for (const entry of catalog.packages) {
    if (entry.roles.includes('content-only')) continue;
    const sourceRoot = path.join(root, entry.path, 'src');
    if (!(await hasTypeScriptSource(sourceRoot))) continue;
    const config = await findPackageTsconfig(root, entry.path);
    if (!config) {
      findings.push(`${entry.path}: TypeScript source package has no package-owned tsconfig`);
      continue;
    }
    targets.push({ owner: entry.name, config });
  }

  for (const target of targets) {
    const absolute = path.join(root, target.config);
    const readResult = ts.readConfigFile(absolute, ts.sys.readFile);
    if (readResult.error) {
      findings.push(`${target.config}: ${formatDiagnostic(readResult.error)}`);
      continue;
    }
    const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, path.dirname(absolute));
    for (const diagnostic of parsed.errors) {
      findings.push(`${target.config}: ${formatDiagnostic(diagnostic)}`);
    }
    findings.push(
      ...validateStrictCompilerOptions(`${target.config} (${target.owner})`, parsed.options),
    );
  }

  return {
    status: findings.length === 0 ? 'passed' : 'failed',
    checkedConfigs: targets.map((target) => target.config),
    findings,
  };
}

async function findPackageTsconfig(root, packagePath) {
  const packageRoot = path.join(root, packagePath);
  if (await isFile(path.join(packageRoot, 'tsconfig.json'))) return `${packagePath}/tsconfig.json`;
  const alternatives = (await readdir(packageRoot))
    .filter((name) => /^tsconfig\.(?!node\b).+\.json$/u.test(name))
    .sort();
  if (alternatives.length === 1) return `${packagePath}/${alternatives[0]}`;
  return undefined;
}

async function hasTypeScriptSource(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && (await hasTypeScriptSource(path.join(directory, entry.name)))) {
      return true;
    }
    if (entry.isFile() && /\.[cm]?tsx?$/u.test(entry.name)) return true;
  }
  return false;
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function formatDiagnostic(diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await inspectStrictTsconfigs();
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (result.status === 'failed') {
    process.stderr.write(output);
    process.exitCode = 1;
  } else {
    process.stdout.write(output);
  }
}
