#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScenario, runScenario } from './scenario-runtime.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const options = parseArgs(process.argv.slice(2));
const scenarioPaths =
  options.scenarios.length > 0
    ? options.scenarios
    : await discoverScenarios(join(repoRoot, 'scripts/webview-functional/scenarios'));

if (scenarioPaths.length === 0) {
  throw new Error('No functional scenarios were selected');
}

const scenarios = [];
for (const path of scenarioPaths) {
  const scenario = await loadScenario(path, repoRoot);
  if (options.tiers.length > 0 && !options.tiers.includes(scenario.tier)) continue;
  if (options.owners.length > 0 && !options.owners.includes(scenario.ownerPackage)) continue;
  scenarios.push({ path, scenario });
}

if (scenarios.length === 0) {
  throw new Error('Scenario filters selected no cases');
}

if (options.dryRun) {
  process.stdout.write(
    `${JSON.stringify({ ok: true, mode: 'dry-run', scenarios: scenarios.map(({ path, scenario }) => ({ path, id: scenario.id, host: scenario.host, tier: scenario.tier })) }, null, 2)}\n`,
  );
  process.exit(0);
}

let failed = false;
for (const { scenario } of scenarios) {
  const result = await runScenario(scenario, {
    repoRoot,
    outputRoot: options.outputRoot,
    expectedVSCodeVersion: options.expectedVSCodeVersion,
    testWorkspaceRoot: resolve(
      repoRoot,
      options.testWorkspace ?? 'scripts/webview-functional/neko-test',
    ),
    debugPort: options.debugPort,
    controllerFile: options.controllerFile,
    startupTimeoutMs: options.startupTimeoutMs,
  });
  process.stdout.write(
    `${JSON.stringify({ scenarioId: scenario.id, status: result.report.status, resultPath: relative(repoRoot, result.resultPath) }, null, 2)}\n`,
  );
  failed ||= result.report.status !== 'pass';
}
process.exitCode = failed ? 1 : 0;

function parseArgs(args) {
  const parsed = {
    scenarios: [],
    tiers: [],
    owners: [],
    dryRun: false,
    outputRoot: undefined,
    expectedVSCodeVersion: undefined,
    testWorkspace: undefined,
    debugPort: undefined,
    controllerFile: undefined,
    startupTimeoutMs: undefined,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--scenario') parsed.scenarios.push(readValue(args, ++index, arg));
    else if (arg === '--tier') parsed.tiers.push(readValue(args, ++index, arg));
    else if (arg === '--owner') parsed.owners.push(readValue(args, ++index, arg));
    else if (arg === '--output-root') parsed.outputRoot = readValue(args, ++index, arg);
    else if (arg === '--expected-vscode-version') {
      parsed.expectedVSCodeVersion = readValue(args, ++index, arg);
    } else if (arg === '--test-workspace') parsed.testWorkspace = readValue(args, ++index, arg);
    else if (arg === '--debug-port') parsed.debugPort = Number(readValue(args, ++index, arg));
    else if (arg === '--controller-file') parsed.controllerFile = readValue(args, ++index, arg);
    else if (arg === '--startup-timeout-ms')
      parsed.startupTimeoutMs = Number(readValue(args, ++index, arg));
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return parsed;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return value;
}

async function discoverScenarios(root) {
  const paths = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...(await discoverScenarios(path)));
    else if (entry.isFile() && entry.name.endsWith('.scenario.json'))
      paths.push(relative(repoRoot, path));
  }
  return paths.sort();
}

function printUsage() {
  process.stdout.write(`Usage: node scripts/webview-functional/cli.mjs [options]\n\n`);
  process.stdout.write(`  --scenario <path>          Run one scenario (repeatable)\n`);
  process.stdout.write(`  --tier <p0|p1|p2>          Filter by tier\n`);
  process.stdout.write(`  --owner <package>          Filter by owning package\n`);
  process.stdout.write(`  --dry-run                  Validate and list without launching a host\n`);
  process.stdout.write(
    `  --expected-vscode-version <version> Validate the running VS Code version\n`,
  );
  process.stdout.write(
    `  --test-workspace <path>    Built-in Debug Host workspace ` +
      `(default: scripts/webview-functional/neko-test)\n`,
  );
  process.stdout.write(
    `  --debug-port <port>        VS Code CDP endpoint shared by built-in Debug (default: 9222)\n`,
  );
  process.stdout.write(
    `  --controller-file <path>   Controller connection file relative to repository\n`,
  );
  process.stdout.write(`  --startup-timeout-ms <ms>  Override host startup timeout\n`);
  process.stdout.write(`  --output-root <path>       Override the gitignored report root\n`);
}
