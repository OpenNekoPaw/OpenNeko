import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import eslintConfig from '../../eslint.config.mjs';

const EXPLICIT_ANY_RULE = '@typescript-eslint/no-explicit-any';
const UNUSED_VARIABLE_RULE = '@typescript-eslint/no-unused-vars';
const HOOK_ORDER_RULE = 'react-hooks/rules-of-hooks';
const CONSOLE_RULE = 'no-console';
const TIMING_ATTACK_RULE = 'security/detect-possible-timing-attacks';
const FUNCTIONAL_MJS_PATTERN = 'scripts/desktop-functional/**/*.mjs';
const CONSOLE_BOUNDARY_FILES = ['packages/neko-shared/src/logger/console-logger.ts'];

test('critical production ESLint rules remain blocking', () => {
  assert.equal(readLastRuleSetting(EXPLICIT_ANY_RULE, isProductionTypeScriptConfig), 'error');
  assert.equal(readLastRuleSetting(UNUSED_VARIABLE_RULE, isProductionTypeScriptConfig)[0], 'error');
  assert.equal(readLastRuleSetting(HOOK_ORDER_RULE, isReactHookConfig), 'error');
});

test('test files retain the scoped explicit-any override', () => {
  assert.equal(readLastRuleSetting(EXPLICIT_ANY_RULE, isTestConfig), 'off');
});

test('console output remains blocking outside exact output boundaries', () => {
  assert.equal(readLastRuleSetting(CONSOLE_RULE, isProductionTypeScriptConfig), 'error');
  assert.deepEqual(readRuleOverrideFiles(CONSOLE_RULE, 'off'), CONSOLE_BOUNDARY_FILES);
});

test('possible timing attacks remain blocking', () => {
  assert.equal(readLastRuleSetting(TIMING_ATTACK_RULE, isSecurityConfig), 'error');
});

test('Desktop functional MJS sources remain inside the lint gate', async () => {
  const ignoredPatterns = eslintConfig.flatMap((config) => config.ignores ?? []);
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

  assert.equal(ignoredPatterns.includes('**/*.mjs'), false);
  assert.equal(readLastRuleSetting(CONSOLE_RULE, isFunctionalMjsConfig), 'error');
  assert.match(packageJson.scripts?.lint ?? '', /scripts\/desktop-functional\/\*\*\/\*\.mjs/u);
  assert.match(packageJson.scripts?.lint ?? '', /packages\/\*-webview\/functional\/\*\*\/\*\.mjs/u);
});

function readLastRuleSetting(ruleName, predicate) {
  const settings = eslintConfig
    .filter(predicate)
    .map((config) => config.rules?.[ruleName])
    .filter((setting) => setting !== undefined);

  return settings.at(-1);
}

function readRuleOverrideFiles(ruleName, expectedSetting) {
  return eslintConfig
    .filter((config) => config.rules?.[ruleName] === expectedSetting)
    .flatMap((config) => config.files ?? [])
    .sort();
}

function isProductionTypeScriptConfig(config) {
  return config.files?.includes('packages/**/src/**/*.ts') === true;
}

function isReactHookConfig(config) {
  return config.files?.includes('packages/**/src/**/*.tsx') === true;
}

function isSecurityConfig(config) {
  return config.rules?.['security/detect-object-injection'] === 'off';
}

function isFunctionalMjsConfig(config) {
  return config.files?.includes(FUNCTIONAL_MJS_PATTERN) === true;
}

function isTestConfig(config) {
  return config.files?.includes('**/*.test.ts') === true;
}
