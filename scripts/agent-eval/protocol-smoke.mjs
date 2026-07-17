#!/usr/bin/env node
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUEST_SCHEMA,
  createDebugResponseReader,
  readRequiredString,
  sendDebugRequest,
} from './runner/debug-protocol-client.mjs';
import { runSingleMessageTuiDriver } from './runner/single-message-driver.mjs';
import { createV2DryRun, runV2Case } from './runner/run-v2-case.mjs';
import { resolveTuiDebugLaunch } from './runner/tui-debug-launch.mjs';
import { discoverSuites, selectSuiteCases } from './suites/discovery.mjs';

export const EXIT_CASE_FAIL = 1;
export const EXIT_INFRASTRUCTURE_FAIL = 2;
export const EXIT_CONFIG_INVALID = 3;
export { REQUEST_SCHEMA };
const scriptPath = fileURLToPath(import.meta.url);

export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  let args;
  try {
    args = await resolveArgs(argv, { env: io.env });
    if (args.mode === 'suite') {
      if (args.dryRun) {
        io.stdout.write(`${JSON.stringify(createV2DryRun(args.selection), null, 2)}\n`);
        return 0;
      }
      const run = await runV2Case(args.selection, {
        spawn: io.spawn,
        env: io.env,
        cwd: io.cwd(),
        outputRoot: args.reportRoot,
        runId: args.runId,
      });
      io.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
      return exitCodeForOutcome(run.outcome);
    }
    if (!args.cwd || !args.prompt) {
      printUsage(io.stderr);
      return EXIT_CONFIG_INVALID;
    }
    if (args.dryRun) {
      io.stdout.write(`${JSON.stringify(createDryRunResult(args), null, 2)}\n`);
      return 0;
    }
  } catch (error) {
    io.stderr.write(`configuration invalid: ${formatErrorMessage(error)}\n`);
    return EXIT_CONFIG_INVALID;
  }

  const launch = resolveTuiDebugLaunch({ debugCommand: io.env.NEKO_DEBUG_COMMAND });
  const child = io.spawn(
    launch.command,
    [...launch.argsPrefix, 'debug', 'automation', '--stdio', '-C', args.cwd],
    {
      cwd: io.cwd(),
      shell: launch.shell,
      stdio: ['pipe', 'pipe', 'inherit'],
    },
  );

  const responses = createDebugResponseReader(child.stdout);

  try {
    const facts = await runSinglePromptProtocol(child, responses, args);
    assertSuccessfulFacts(facts);
    io.stdout.write(`${JSON.stringify({ ok: true, facts }, null, 2)}\n`);
    return 0;
  } catch (error) {
    const classification = classifyError(error);
    io.stderr.write(`${classification.label}: ${formatErrorMessage(error)}\n`);
    return classification.exitCode;
  }
}

export function assertSuccessfulFacts(facts, options = { requireFinalAnswer: true }) {
  const runtimeErrors = Array.isArray(facts?.runtimeErrors) ? facts.runtimeErrors : [];
  if (runtimeErrors.length > 0) {
    throw new Error(`debug automation completed with runtime errors: ${runtimeErrors.join('; ')}`);
  }

  const turns = Array.isArray(facts?.turns) ? facts.turns : [];
  const errorTurns = turns.filter((turn) => turn?.isError);
  if (errorTurns.length > 0) {
    throw new Error(
      `debug automation completed with error turns: ${errorTurns
        .map((turn) => turn.content)
        .filter(Boolean)
        .join('; ')}`,
    );
  }

  const internalContinuationUserTurns = turns.filter(
    (turn) =>
      turn?.role === 'user' &&
      typeof turn.content === 'string' &&
      /Continue from the completed async task result\.|completed async task result|completed subagent result/i.test(
        turn.content,
      ),
  );
  if (internalContinuationUserTurns.length > 0) {
    throw new Error(
      'debug automation projected internal continuation prompts as user-authored messages',
    );
  }

  const assistantTurns = turns.filter((turn) => turn?.role === 'assistant');
  const finalAssistant = assistantTurns.at(-1);
  if (
    options.requireFinalAnswer !== false &&
    (!finalAssistant ||
      typeof finalAssistant.content !== 'string' ||
      finalAssistant.content.trim().length === 0)
  ) {
    throw new Error('debug automation completed without a non-empty assistant response');
  }
}

export async function runSinglePromptProtocol(child, responses, args) {
  return runSingleMessageTuiDriver(child, responses, {
    sessionParams: createSessionParams(args),
    prompt: args.prompt,
    timeoutMs: args.timeoutMs,
    cancelAfterMs: args.cancelAfterMs,
    terminalResizes: args.terminalResizes,
    includeHistory: true,
  });
}

export async function sendRequest(childProcess, reader, input) {
  return sendDebugRequest(childProcess, reader, input);
}

export async function* createResponseReader(output) {
  yield* createDebugResponseReader(output);
}

export function readString(value, key) {
  return readRequiredString(value, key);
}

export function classifyError(error) {
  const code = error && typeof error === 'object' ? error.code : undefined;
  if (code === 'invalid-request' || code === 'invalid-schema' || code === 'invalid-json') {
    return { label: 'configuration invalid', exitCode: EXIT_CONFIG_INVALID };
  }
  if (code === 'session-timeout' || code === 'internal-error' || code === 'session-not-ready') {
    return { label: 'infrastructure fail', exitCode: EXIT_INFRASTRUCTURE_FAIL };
  }
  return { label: 'case fail', exitCode: EXIT_CASE_FAIL };
}

export function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--cwd') {
      parsed.cwd = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--prompt') {
      parsed.prompt = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--suite') {
      parsed.suiteId = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--case') {
      parsed.caseId = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--timeout-ms') {
      parsed.timeoutMs = parseTimeoutMs(readOptionValue(argv, index, arg));
      index += 1;
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--report-root') {
      parsed.reportRoot = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === '--run-id') {
      parsed.runId = readOptionValue(argv, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

export async function resolveArgs(argv) {
  const parsed = parseArgs(argv);
  if (parsed.suiteId) {
    if (!parsed.caseId) throw new Error('--case is required when --suite is provided');
    const discovered = await discoverSuites();
    const [selection] = selectSuiteCases(discovered, {
      suiteId: parsed.suiteId,
      caseId: parsed.caseId,
    });
    return { ...parsed, mode: 'suite', selection };
  }
  return {
    ...parsed,
    cwd: parsed.cwd ? expandHome(parsed.cwd) : undefined,
  };
}

export function createSessionParams(args) {
  const params = {};
  const chat = args.model?.chat;
  const provider = args.provider ?? chat?.providerId;
  const model = chat?.modelId;
  if (provider) params.provider = provider;
  if (model) params.model = model;
  if (args.model?.purposes) params.modelPurposes = args.model.purposes;
  if (args.apiKey) params.apiKey = args.apiKey;
  return params;
}

export function createDryRunResult(args) {
  return {
    ok: true,
    dryRun: true,
    mode: 'direct-prompt',
    cwd: args.cwd,
    prompt: args.prompt,
    timeoutMs: args.timeoutMs,
  };
}

export function expandHome(value) {
  if (value === '~') {
    return os.homedir();
  }
  if (value.startsWith('~/')) {
    return `${os.homedir()}${value.slice(1)}`;
  }
  return value;
}

function readOptionValue(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${arg} requires a value`);
  }
  return value;
}

function parseTimeoutMs(value) {
  const timeoutMs = Number.parseInt(value, 10);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`--timeout-ms must be a positive integer: ${value}`);
  }
  return timeoutMs;
}

function printUsage(stderr = process.stderr) {
  stderr.write(
    'Usage: node scripts/agent-eval/protocol-smoke.mjs --cwd <dir> --prompt <prompt> [--timeout-ms <ms>]\n' +
      '   or: node scripts/agent-eval/protocol-smoke.mjs --suite <id> --case <id> [--dry-run] [--report-root <dir>]\n',
  );
}

function exitCodeForOutcome(outcome) {
  if (outcome === 'pass') return 0;
  if (outcome === 'case-fail') return EXIT_CASE_FAIL;
  if (outcome === 'configuration-invalid') return EXIT_CONFIG_INVALID;
  return EXIT_INFRASTRUCTURE_FAIL;
}

function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function defaultIo() {
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
    cwd: () => process.cwd(),
    spawn,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  process.exitCode = await main();
}
