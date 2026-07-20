import assert from 'node:assert/strict';
import test from 'node:test';

import eslintConfig from '../../eslint.config.mjs';

const EXPLICIT_ANY_RULE = '@typescript-eslint/no-explicit-any';
const HOOK_ORDER_RULE = 'react-hooks/rules-of-hooks';
const CONSOLE_RULE = 'no-console';
const CONSOLE_BOUNDARY_FILES = [
  'packages/neko-engine/packages/extension/src/mediaEngine/export/ExportIntegrationTest.ts',
  'packages/neko-types/src/logger/console-logger.ts',
];

test('critical production ESLint rules remain blocking', () => {
  assert.equal(readLastRuleSetting(EXPLICIT_ANY_RULE, isProductionTypeScriptConfig), 'error');
  assert.equal(readLastRuleSetting(HOOK_ORDER_RULE, isReactHookConfig), 'error');
});

test('test files retain the scoped explicit-any override', () => {
  assert.equal(readLastRuleSetting(EXPLICIT_ANY_RULE, isTestConfig), 'off');
});

test('console output remains blocking outside exact output boundaries', () => {
  assert.equal(readLastRuleSetting(CONSOLE_RULE, isProductionTypeScriptConfig), 'error');
  assert.deepEqual(readRuleOverrideFiles(CONSOLE_RULE, 'off'), CONSOLE_BOUNDARY_FILES);
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

function isTestConfig(config) {
  return config.files?.includes('**/*.test.ts') === true;
}
