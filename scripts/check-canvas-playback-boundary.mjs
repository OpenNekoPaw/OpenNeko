#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();

const files = {
  manifest: 'packages/neko-canvas/package.json',
  extension: 'packages/neko-canvas/packages/extension/src/extension.ts',
  provider: 'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
  workspace:
    'packages/neko-canvas/packages/webview/src/components/playback/PlaybackWorkspace.tsx',
};

const sources = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, readFileSync(resolve(repoRoot, path), 'utf8')]),
);
const legacyBridgePath =
  'packages/neko-canvas/packages/extension/src/editor/narrativePreviewBridge.ts';

const failures = [];

function fail(message) {
  failures.push(message);
}

const manifest = JSON.parse(sources.manifest);
const contributedCommands = new Set(
  (manifest.contributes?.commands ?? []).map((command) => command.command),
);

assertSourceAnchor('provider', 'export class CanvasEditorProvider');
assertSourceAnchor('provider', 'async revealPlaybackWorkspace(');
assertSourceAnchor('provider', "case 'canvasAction':");
assertSourceAnchor('provider', "case 'save':");
assertSourceAnchor('extension', "registerCommand('neko.canvas.revealPlaybackWorkspace'");
assertSourceAnchor('workspace', 'export function PlaybackWorkspace');

if (contributedCommands.has('neko.canvas.openNarrativePreview')) {
  fail(
    'package.json must not contribute neko.canvas.openNarrativePreview as a user-facing command.',
  );
}

if (!contributedCommands.has('neko.canvas.revealPlaybackWorkspace')) {
  fail('package.json must contribute neko.canvas.revealPlaybackWorkspace.');
}

if (existsSync(resolve(repoRoot, legacyBridgePath))) {
  fail(`${legacyBridgePath} must remain deleted; PlaybackWorkspace owns the canonical UI path.`);
}

for (const legacySymbol of ['openNarrativePreview', 'NarrativePreviewBridge']) {
  for (const [key, source] of Object.entries(sources)) {
    if (source.includes(legacySymbol)) {
      fail(`${files[key]} must not retain legacy playback symbol ${legacySymbol}.`);
    }
  }
}

const providerRevealMethod = sources.provider.match(
  /async revealPlaybackWorkspace\([\s\S]*?\n  }\n\n  getPlaybackPlan/,
);
if (!providerRevealMethod) {
  fail(
    'CanvasEditorProvider.revealPlaybackWorkspace must remain the explicit canonical reveal path.',
  );
} else {
  if (!providerRevealMethod[0].includes('targetPanel.reveal();')) {
    fail('CanvasEditorProvider.revealPlaybackWorkspace must reveal the active Canvas panel.');
  }
  if (!providerRevealMethod[0].includes("type: 'playback:revealWorkspace'")) {
    fail(
      'CanvasEditorProvider.revealPlaybackWorkspace must post playback:revealWorkspace to the Canvas Webview.',
    );
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

if (!sources.workspace.includes('usePlaybackStore')) {
  fail('PlaybackWorkspace must consume the canonical Canvas playback store.');
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
