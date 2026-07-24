import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const skillPath = path.join(repositoryRoot, '.codex/skills/vscode-extension-debugger/SKILL.md');

const skillSource = await readFile(skillPath, 'utf8');

test('VS Code debugger skill defines a no-port host UI lane', () => {
  assert.match(skillSource, /Host UI \/ black box/u);
  assert.match(skillSource, /Debug port\s+\|/u);
  assert.match(skillSource, /Not required/u);
  assert.match(skillSource, /computer-use/u);
  assert.match(skillSource, /macOS Accessibility/u);
});

test('VS Code debugger skill retains the CDP Webview lane', () => {
  assert.match(skillSource, /Webview \/ white box/u);
  assert.match(skillSource, /CDP Required/u);
  assert.match(skillSource, /iframe/u);
  assert.match(skillSource, /9222/u);
  assert.match(skillSource, /cdp-client\.js list/u);
  assert.match(skillSource, /require an iframe target/u);
});

test('VS Code debugger skill keeps host and Webview evidence non-equivalent', () => {
  assert.match(skillSource, /cannot\s+prove the Webview's DOM/u);
  assert.match(skillSource, /does not replace a CDP\s+Webview\s+run/u);
  assert.match(skillSource, /do not require a CDP port for a host-only UI\s+scenario/u);
});
