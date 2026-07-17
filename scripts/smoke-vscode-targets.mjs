#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { get } from 'node:http';
import { homedir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { BENIGN_VSCODE_WEBVIEW_CONSOLE_WARNINGS } from './vscode-webview-warning-policy.mjs';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);

process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printUsage();
  process.exit(0);
}

const debugPort = readNumber(
  options.port ?? process.env.NEKO_VSCODE_DEBUG_PORT ?? '9222',
  'debug port',
);
const timeoutMs = readNumber(
  options.timeoutMs ?? process.env.NEKO_VSCODE_DEBUGGER_SMOKE_TIMEOUT_MS ?? '10000',
  'timeout',
);
const requireWebview =
  options.requireWebview || process.env.NEKO_VSCODE_DEBUGGER_SMOKE_REQUIRE_WEBVIEW === '1';
const requiredSkills = [
  ...options.skills,
  ...splitList(process.env.NEKO_VSCODE_DEBUGGER_SMOKE_SKILLS),
];

if (requiredSkills.length === 0) {
  throw new Error(
    'At least one Skill is required. Pass --skill <name-or-path> or set NEKO_VSCODE_DEBUGGER_SMOKE_SKILLS.',
  );
}

const skillEvidence = requiredSkills.map(resolveSkill);
const targets = await waitForTargets(debugPort, timeoutMs);
const projectedTargets = targets.map(projectTarget);
const pageTargets = projectedTargets.filter((target) => target.type === 'page');
const webviewTargets = projectedTargets.filter(
  (target) => target.type === 'iframe' || target.url.includes('vscode-webview://'),
);
const workerTargets = projectedTargets.filter((target) => target.type === 'worker');
const assertions = [];

assertion(
  pageTargets.length > 0,
  `observed ${pageTargets.length} VS Code page target(s)`,
  `VS Code debugger on port ${debugPort} exposed no page targets`,
);

if (requireWebview) {
  assertion(
    webviewTargets.length > 0,
    `observed ${webviewTargets.length} webview target(s)`,
    'no webview iframe targets were visible; bring the target webview to the foreground and retry',
  );
}

for (const expectedTitle of options.expectTitles) {
  assertTargetMatch(`title contains "${expectedTitle}"`, (target) =>
    includesIgnoreCase(target.title, expectedTitle),
  );
}

for (const expectedUrl of options.expectUrls) {
  assertTargetMatch(`url contains "${expectedUrl}"`, (target) =>
    includesIgnoreCase(target.url, expectedUrl),
  );
}

for (const expectedExtensionId of options.expectExtensionIds) {
  assertTargetMatch(
    `extension id contains "${expectedExtensionId}"`,
    (target) =>
      includesIgnoreCase(target.title, `extensionId=${expectedExtensionId}`) ||
      includesIgnoreCase(target.url, `extensionId=${expectedExtensionId}`) ||
      includesIgnoreCase(target.title, expectedExtensionId) ||
      includesIgnoreCase(target.url, expectedExtensionId),
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      mode: 'vscode-target-discovery-smoke',
      installVsix: false,
      observedAt: new Date().toISOString(),
      debugPort,
      timeoutMs,
      skills: skillEvidence,
      counts: {
        total: projectedTargets.length,
        page: pageTargets.length,
        webview: webviewTargets.length,
        worker: workerTargets.length,
      },
      assertions,
      benignConsoleWarnings: BENIGN_VSCODE_WEBVIEW_CONSOLE_WARNINGS,
      pageTargets,
      webviewTargets,
      workerTargets,
    },
    null,
    2,
  ),
);

function parseArgs(args) {
  const parsed = {
    expectExtensionIds: [],
    expectTitles: [],
    expectUrls: [],
    help: false,
    port: undefined,
    requireWebview: false,
    skills: [],
    timeoutMs: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--':
        break;
      case '--expect-extension-id':
        parsed.expectExtensionIds.push(readValue(args, (index += 1), arg));
        break;
      case '--expect-title':
        parsed.expectTitles.push(readValue(args, (index += 1), arg));
        break;
      case '--expect-url':
        parsed.expectUrls.push(readValue(args, (index += 1), arg));
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      case '--port':
        parsed.port = readValue(args, (index += 1), arg);
        break;
      case '--require-webview':
        parsed.requireWebview = true;
        break;
      case '--skill':
        parsed.skills.push(readValue(args, (index += 1), arg));
        break;
      case '--timeout-ms':
        parsed.timeoutMs = readValue(args, (index += 1), arg);
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        parsed.skills.push(arg);
        break;
    }
  }

  return parsed;
}

function printUsage() {
  console.log(`Usage:
  pnpm smoke:vscode:targets -- --skill vscode-extension-debugger --require-webview

Options:
  --port <port>                 VS Code remote debugging port. Defaults to NEKO_VSCODE_DEBUG_PORT or 9222.
  --timeout-ms <ms>             Time to wait for debugger targets. Defaults to 10000.
  --skill <name-or-path>        Skill used for the smoke evidence. Can be repeated.
  --require-webview             Require at least one visible VS Code webview iframe target.
  --expect-title <text>         Require any target title to contain text. Can be repeated.
  --expect-url <text>           Require any target URL to contain text. Can be repeated.
  --expect-extension-id <id>    Require any target to contain an extension id. Can be repeated.
`);
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function readNumber(value, label) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return numberValue;
}

async function waitForTargets(port, timeout) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeout) {
    try {
      const debuggerTargets = await readTargets(port);
      if (Array.isArray(debuggerTargets) && debuggerTargets.length > 0) {
        return debuggerTargets;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }

  throw new Error(
    `Timed out waiting for VS Code debugger on port ${port}: ${lastError?.message ?? 'no targets'}`,
  );
}

function readTargets(port) {
  return new Promise((resolvePromise, reject) => {
    const request = get(`http://127.0.0.1:${port}/json`, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          resolvePromise(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.setTimeout(2000, () => {
      request.destroy(new Error('debugger target request timed out'));
    });
  });
}

function resolveSkill(skill) {
  const candidates = skillCandidates(skill);
  const skillPath = candidates.find((candidate) => existsSync(candidate));

  if (!skillPath) {
    throw new Error(
      `Skill "${skill}" was not found. Checked: ${candidates.map(formatPath).join(', ')}`,
    );
  }

  const source = readFileSync(skillPath, 'utf8');
  return {
    input: skill,
    path: formatPath(skillPath),
    declaredName: readFrontMatterField(source, 'name') ?? basename(resolve(skillPath, '..')),
    description: readFrontMatterField(source, 'description'),
  };
}

function skillCandidates(skill) {
  const home = homedir();
  const codexHome = process.env.CODEX_HOME
    ? resolve(process.env.CODEX_HOME)
    : resolve(home, '.codex');
  const resolvedSkill = resolve(repoRoot, skill);
  const candidates = [];

  if (skill.endsWith('SKILL.md')) {
    candidates.push(resolvedSkill);
  } else {
    candidates.push(resolve(repoRoot, '.codex/skills', skill, 'SKILL.md'));
    candidates.push(resolve(codexHome, 'skills', skill, 'SKILL.md'));
    candidates.push(resolve(home, '.codex/skills', skill, 'SKILL.md'));
    candidates.push(resolve(resolvedSkill, 'SKILL.md'));
  }

  return [...new Set(candidates)];
}

function readFrontMatterField(source, fieldName) {
  const match = source.match(new RegExp(`^${fieldName}:\\s*(.+)$`, 'm'));
  const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
  return value === '|' || value === '>' ? undefined : value;
}

function assertTargetMatch(description, predicate) {
  const matchedTargets = projectedTargets.filter(predicate);
  assertion(
    matchedTargets.length > 0,
    `matched target expectation: ${description}`,
    `no VS Code debugger target matched expectation: ${description}`,
  );
}

function assertion(condition, okMessage, failMessage) {
  if (!condition) {
    throw new Error(`${failMessage}. Targets: ${JSON.stringify(projectedTargets, null, 2)}`);
  }
  assertions.push(okMessage);
}

function projectTarget(target) {
  return {
    id: String(target.id ?? ''),
    type: String(target.type ?? ''),
    title: String(target.title ?? ''),
    url: String(target.url ?? '').slice(0, 240),
    parentId: typeof target.parentId === 'string' ? target.parentId : undefined,
  };
}

function includesIgnoreCase(value, expected) {
  return value.toLowerCase().includes(expected.toLowerCase());
}

function splitList(value) {
  return value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function formatPath(pathValue) {
  const absolutePath = resolve(pathValue);
  const home = homedir();
  const codexHome = process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : undefined;

  if (absolutePath.startsWith(`${repoRoot}${sep}`)) {
    return absolutePath.slice(repoRoot.length + 1);
  }
  if (codexHome && absolutePath.startsWith(`${codexHome}${sep}`)) {
    return join('${CODEX_HOME}', absolutePath.slice(codexHome.length + 1));
  }
  if (absolutePath.startsWith(`${home}${sep}`)) {
    return join('${HOME}', absolutePath.slice(home.length + 1));
  }
  return absolutePath;
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function fail(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[smoke:vscode:targets] ${message}`);
  process.exit(1);
}
