#!/usr/bin/env node
import * as fs from 'node:fs/promises';

const EXIT_CASE_FAIL = 1;
const EXIT_CONFIG_INVALID = 3;

const args = parseArgs(process.argv.slice(2));
if (!args.file) {
  printUsage();
  process.exit(EXIT_CONFIG_INVALID);
}

try {
  const raw = await fs.readFile(args.file, 'utf8');
  const parsed = JSON.parse(raw);
  const normalized = JSON.stringify(parsed);
  const missing = args.expect.filter((expected) => !normalized.includes(expected));
  if (missing.length > 0) {
    process.stderr.write(`Canvas JSON missing expected content: ${missing.join(', ')}\n`);
    process.exit(EXIT_CASE_FAIL);
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        file: args.file,
        expected: args.expect,
      },
      null,
      2,
    )}\n`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Canvas JSON check failed: ${message}\n`);
  process.exit(EXIT_CONFIG_INVALID);
}

function parseArgs(argv) {
  const parsed = { expect: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--file') {
      parsed.file = argv[++index];
    } else if (arg === '--expect') {
      const expected = argv[++index];
      if (expected) parsed.expect.push(expected);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function printUsage() {
  process.stderr.write(
    'Usage: node scripts/agent-eval/canvas-json-check.mjs --file <canvas.json> [--expect <text>...]\n',
  );
}
