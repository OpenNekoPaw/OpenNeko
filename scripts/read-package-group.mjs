#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const configPath = resolve(scriptDir, 'package-groups.json');

function readPackageConfig() {
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

function readConfigValue(pathExpression) {
  if (!pathExpression) {
    throw new Error('Expected a config path, for example: packages.tsExtensions');
  }

  return pathExpression.split('.').reduce((value, segment) => {
    if (value && Object.prototype.hasOwnProperty.call(value, segment)) {
      return value[segment];
    }
    throw new Error(`Unknown package group path: ${pathExpression}`);
  }, readPackageConfig());
}

export function readPackageGroup(pathExpression) {
  const value = readConfigValue(pathExpression);
  if (!Array.isArray(value)) {
    throw new Error(`Package group path must resolve to an array: ${pathExpression}`);
  }
  return value;
}

function main() {
  const pathExpression = process.argv[2];
  const value = readConfigValue(pathExpression);

  if (Array.isArray(value)) {
    process.stdout.write(value.join('\n'));
    if (value.length > 0) {
      process.stdout.write('\n');
    }
    return;
  }

  if (typeof value === 'string') {
    process.stdout.write(`${value}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main();
}
