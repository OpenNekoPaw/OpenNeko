/**
 * Canvas Ambient Context bridge.
 *
 * Extension owns VSCode EventEmitter wiring. The state model, node summaries,
 * asset inference and pending-change buffer live in @neko/agent runtime.
 */

import type { CanvasNode, GenerationModelConfig } from '@neko/shared';
import {
  CanvasAmbientContextRuntime,
  DEFAULT_CANVAS_AMBIENT_SCOPE_ID,
  type CanvasChangeSummary,
  type SelectedNodeSummary,
} from '@neko/agent/runtime';
import * as vscode from 'vscode';

export type { CanvasChangeSummary, SelectedNodeSummary } from '@neko/agent/runtime';

const runtime = new CanvasAmbientContextRuntime();
let activeScopeId = DEFAULT_CANVAS_AMBIENT_SCOPE_ID;

// =============================================================================
// Generation config event (for status bar subscription)
// =============================================================================

const _onDidChangeGenerationConfig = new vscode.EventEmitter<GenerationModelConfig | undefined>();
/** Fired when the active project generation model config changes. */
export const onDidChangeGenerationConfig = _onDidChangeGenerationConfig.event;

const _onDidChangeCanvasSelection = new vscode.EventEmitter<SelectedNodeSummary[]>();
/** Fired when the canvas selection changes; used to push ambient chips to the webview. */
export const onDidChangeCanvasSelection = _onDidChangeCanvasSelection.event;

const _onDidReceiveCanvasChange = new vscode.EventEmitter<CanvasChangeSummary>();
/**
 * Fired when a canvas or asset change event is received from neko-canvas.
 * Subscribers can surface a "canvas changed" indicator without polling.
 */
export const onDidReceiveCanvasChange = _onDidReceiveCanvasChange.event;

// =============================================================================
// Public API
// =============================================================================

/** Bind subsequent ambient updates to the active conversation scope. */
export function setActiveCanvasAmbientScope(
  scopeId: string | null | undefined,
): SelectedNodeSummary[] {
  activeScopeId = scopeId ?? DEFAULT_CANVAS_AMBIENT_SCOPE_ID;
  return runtime.getCanvasSelection(activeScopeId);
}

/** Read the active ambient scope, primarily for bridge diagnostics/tests. */
export function getActiveCanvasAmbientScope(): string {
  return activeScopeId;
}

/** Update the stored selection (called from onSelectionChange handler). */
export function setCanvasSelection(nodes: CanvasNode[], scopeId = activeScopeId): void {
  const selectedNodes = runtime.setCanvasSelection(nodes, scopeId);
  _onDidChangeCanvasSelection.fire(selectedNodes);
}

/** Read the current selection for injection into agent context. */
export function getCanvasSelection(scopeId = activeScopeId): SelectedNodeSummary[] {
  return runtime.getCanvasSelection(scopeId);
}

/** Clear the selection (called when canvas editor closes). */
export function clearCanvasSelection(scopeId = activeScopeId): void {
  const selectedNodes = runtime.clearCanvasSelection(scopeId);
  _onDidChangeCanvasSelection.fire(selectedNodes);
}

/** Update the active generation model config (called after set_project_generation_config). */
export function setActiveGenerationConfig(
  config: GenerationModelConfig,
  scopeId = activeScopeId,
): void {
  runtime.setActiveGenerationConfig(config, scopeId);
  _onDidChangeGenerationConfig.fire(config);
}

/** Read the active generation model config. */
export function getActiveGenerationConfig(
  scopeId = activeScopeId,
): GenerationModelConfig | undefined {
  return runtime.getActiveGenerationConfig(scopeId);
}

/**
 * Record an incoming canvas or asset change event.
 * Appends to the runtime ring buffer and fires the bridge event.
 */
export function recordCanvasChange(summary: CanvasChangeSummary, scopeId = activeScopeId): void {
  runtime.recordCanvasChange(summary, scopeId);
  _onDidReceiveCanvasChange.fire(summary);
}

/**
 * Return all pending canvas/asset changes and clear the buffer.
 * Called by the agent-message turn bridge to inject change context before a response.
 */
export function drainPendingCanvasChanges(scopeId = activeScopeId): CanvasChangeSummary[] {
  return runtime.drainPendingCanvasChanges(scopeId);
}

/** Peek at the pending changes without clearing them. */
export function getPendingCanvasChanges(scopeId = activeScopeId): readonly CanvasChangeSummary[] {
  return runtime.getPendingCanvasChanges(scopeId);
}
