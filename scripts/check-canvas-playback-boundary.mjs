#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();

const files = {
  manifest: 'packages/neko-canvas/package.json',
  extension: 'packages/neko-canvas/packages/extension/src/extension.ts',
  provider: 'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
  bridge: 'packages/neko-canvas/packages/extension/src/editor/narrativePreviewBridge.ts',
};

const sources = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, readFileSync(resolve(repoRoot, path), 'utf8')]),
);

const failures = [];

function fail(message) {
  failures.push(message);
}

const manifest = JSON.parse(sources.manifest);
const contributedCommands = new Set(
  (manifest.contributes?.commands ?? []).map((command) => command.command),
);

assertSourceAnchor('provider', 'export class CanvasEditorProvider');
assertSourceAnchor('provider', 'openNarrativePreview');
assertSourceAnchor('provider', "case 'canvasAction':");
assertSourceAnchor('provider', "case 'save':");
assertSourceAnchor('extension', "registerCommand('neko.canvas.openNarrativePreview'");
assertSourceAnchor('bridge', 'createWebviewPanel');

if (contributedCommands.has('neko.canvas.openNarrativePreview')) {
  fail(
    'package.json must not contribute neko.canvas.openNarrativePreview as a user-facing command.',
  );
}

if (!contributedCommands.has('neko.canvas.revealPlaybackWorkspace')) {
  fail('package.json must contribute neko.canvas.revealPlaybackWorkspace.');
}

const legacyRegistration = sources.extension.match(
  /registerCommand\('neko\.canvas\.openNarrativePreview'[\s\S]*?\n\s*\),/,
);
if (!legacyRegistration) {
  fail(
    'extension.ts must keep the legacy openNarrativePreview shim visible until callers migrate.',
  );
} else if (
  !legacyRegistration[0].includes(
    "vscode.commands.executeCommand('neko.canvas.revealPlaybackWorkspace')",
  )
) {
  fail('legacy openNarrativePreview shim must only dispatch neko.canvas.revealPlaybackWorkspace.');
}

const providerOpenMethod = sources.provider.match(
  /openNarrativePreview\(\): Promise<boolean> \{[\s\S]*?\n\s*\}/,
);
if (!providerOpenMethod) {
  fail(
    'CanvasEditorProvider.openNarrativePreview shim must remain explicit while legacy callers exist.',
  );
} else {
  if (!providerOpenMethod[0].includes('return this.revealPlaybackWorkspace();')) {
    fail('CanvasEditorProvider.openNarrativePreview must reveal same-Webview PlaybackWorkspace.');
  }
  if (providerOpenMethod[0].includes('narrativePreviewBridge.open')) {
    fail('CanvasEditorProvider.openNarrativePreview must not open NarrativePreviewBridge.');
  }
}

const canvasActionBranch = sources.provider.slice(
  sources.provider.indexOf("case 'canvasAction':"),
  sources.provider.indexOf("case 'save':"),
);
if (canvasActionBranch.length === 0) {
  fail(
    'Canvas provider message handler anchors changed; update check-canvas-playback-boundary.mjs.',
  );
}
if (!canvasActionBranch.includes("message.action === 'revealPlaybackWorkspace'")) {
  fail('Canvas canvasAction branch must support revealPlaybackWorkspace.');
}
if (canvasActionBranch.includes("executeCommand('neko.canvas.openNarrativePreview'")) {
  fail('Canvas canvasAction branch must not route through openNarrativePreview.');
}
if (!sources.provider.includes("type: 'playback:revealWorkspace'")) {
  fail('Canvas provider must post playback:revealWorkspace to the active Canvas editor Webview.');
}

const panelCreationCount = (sources.bridge.match(/createWebviewPanel\(/g) ?? []).length;
if (panelCreationCount > 2) {
  fail('NarrativePreviewBridge contains unexpected createWebviewPanel call sites.');
}

if (failures.length > 0) {
  console.error('Canvas playback boundary check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Canvas playback boundary check passed.');

function assertSourceAnchor(key, anchor) {
  if (!sources[key].includes(anchor)) {
    fail(
      `${files[key]} no longer contains expected anchor "${anchor}"; update check-canvas-playback-boundary.mjs before trusting this boundary check.`,
    );
  }
}
