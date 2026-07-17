#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import { TextDecoder } from 'node:util';

const [kind, file] = process.argv.slice(2);
if (!['json-document-v1', 'utf8-text-v1'].includes(kind) || !file) {
  process.stderr.write('Usage: file-validator-cli.mjs <json-document-v1|utf8-text-v1> <file>\n');
  process.exit(3);
}

try {
  const bytes = await fs.readFile(file);
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (kind === 'json-document-v1') JSON.parse(text);
  process.stdout.write(`${JSON.stringify({ ok: true, validatorId: kind, bytes: bytes.length })}\n`);
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ ok: false, validatorId: kind, diagnostic: toDiagnostic(error) })}\n`,
  );
  process.exit(1);
}

function toDiagnostic(error) {
  if (error instanceof SyntaxError) return 'invalid-json';
  if (error instanceof TypeError) return 'invalid-utf8';
  if (error && typeof error === 'object' && error.code === 'ENOENT') return 'file-not-found';
  return 'validator-failed';
}
