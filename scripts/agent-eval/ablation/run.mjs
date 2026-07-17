#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createConfigurationAblationDryRun,
  runConfigurationAblation,
} from './configuration-runner.mjs';
import {
  createImplementationAblationDryRun,
  runImplementationAblation,
} from './implementation-runner.mjs';
import { validateAblationPlan } from '../schemas/ablation-contracts.mjs';
import { discoverSuites, selectSuiteCases } from '../suites/discovery.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ABLATION_ROOT = dirname(SCRIPT_PATH);
const DEFAULT_PLANS_ROOT = resolve(ABLATION_ROOT, 'plans');
const REPOSITORY_ROOT = resolve(ABLATION_ROOT, '../../..');

export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  try {
    const args = parseArgs(argv);
    const planFile = resolvePlanFile(args.plan, io.cwd());
    const plan = validateAblationPlan(JSON.parse(await fs.readFile(planFile, 'utf8')));
    const discovered = await (io.discoverSuites ?? discoverSuites)();
    const [selection] = selectSuiteCases(discovered, {
      suiteId: plan.suiteId,
      caseId: plan.caseId,
    });
    if (args.dryRun) {
      const result =
        plan.mode === 'configuration'
          ? createConfigurationAblationDryRun(plan, selection)
          : createImplementationAblationDryRun(plan, selection);
      io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }
    const common = {
      runId: args.runId,
      outputRoot: args.reportRoot,
      discovered,
      repositoryRoot: REPOSITORY_ROOT,
      workspaceParent: args.workspaceParent,
      env: io.env,
    };
    const result =
      plan.mode === 'configuration'
        ? await (io.runConfiguration ?? runConfigurationAblation)(plan, common)
        : await (io.runImplementation ?? runImplementationAblation)(plan, common);
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return exitCodeForOutcome(result.outcome);
  } catch (error) {
    const classified = classifyError(error);
    io.stderr.write(`${classified.label}: ${formatError(error)}\n`);
    return classified.exitCode;
  }
}

export function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--plan') {
      parsed.plan = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--report-root') {
      parsed.reportRoot = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--run-id') {
      parsed.runId = readValue(argv, index, arg);
      index += 1;
    } else if (arg === '--workspace-parent') {
      parsed.workspaceParent = readValue(argv, index, arg);
      index += 1;
    } else {
      throw configurationError(`unknown ablation argument: ${arg}`);
    }
  }
  if (!parsed.plan) throw configurationError('--plan is required');
  return parsed;
}

export function resolvePlanFile(value, cwd = process.cwd()) {
  const candidate =
    value.includes('/') || value.endsWith('.json')
      ? resolve(cwd, value)
      : resolve(DEFAULT_PLANS_ROOT, `${value}.json`);
  assertContained(REPOSITORY_ROOT, candidate, 'ablation plan');
  return candidate;
}

function classifyError(error) {
  const code = error && typeof error === 'object' ? error.code : undefined;
  if (code === 'configuration-invalid') return { label: 'configuration invalid', exitCode: 3 };
  if (code === 'implementation-build-failed' || code === 'implementation-cleanup-failed') {
    return { label: 'evaluation infrastructure failed', exitCode: 2 };
  }
  return { label: 'evaluation failed', exitCode: 2 };
}

function exitCodeForOutcome(outcome) {
  if (outcome === 'pass') return 0;
  if (outcome === 'case-fail' || outcome === 'non-comparable') return 1;
  if (outcome === 'configuration-invalid') return 3;
  return 2;
}

function readValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw configurationError(`${option} requires a value`);
  return value;
}

function assertContained(root, target, label) {
  const relation = relative(root, target);
  if (relation === '..' || relation.startsWith(`..${sep}`) || relation.startsWith(sep)) {
    throw configurationError(`${label} escapes the repository`);
  }
}

function configurationError(message) {
  return Object.assign(new Error(message), { code: 'configuration-invalid' });
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function defaultIo() {
  return {
    cwd: () => process.cwd(),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  process.exitCode = await main();
}
