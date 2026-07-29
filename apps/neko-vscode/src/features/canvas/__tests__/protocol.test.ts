import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');
const providerSource = readFileSync(join(__dirname, '../agentCapabilityProvider.ts'), 'utf-8');
const editorSource = readFileSync(join(__dirname, '../editor/canvasEditorProvider.ts'), 'utf-8');
const webviewSource = readFileSync(
  join(__dirname, '../../../../../../packages/neko-canvas-webview/src/hooks/useVSCodeMessages.ts'),
  'utf-8',
);
const playbackWorkspaceSource = readFileSync(
  join(
    __dirname,
    '../../../../../../packages/neko-canvas-webview/src/components/playback/PlaybackWorkspace.tsx',
  ),
  'utf-8',
);
const dragDropSource = readFileSync(
  join(__dirname, '../../../../../../packages/neko-canvas-webview/src/hooks/useDragDrop.ts'),
  'utf-8',
);
const addActionCatalogSource = readFileSync(
  join(__dirname, '../../../../../../packages/neko-canvas-webview/src/utils/canvasAddActions.ts'),
  'utf-8',
);

describe('canonical Canvas host protocol', () => {
  it('keeps headless authoring and generic Preview on explicit host paths', () => {
    expect(extensionSource).toContain('canvasProjectAuthoringService.applyAgentContent');
    expect(editorSource).toContain("case 'playback:getPreviewPlan'");
    expect(editorSource).toContain('createCanvasPlaybackPlan({');
    expect(editorSource).toContain("type: 'playback:previewPlanResult'");
    expect(playbackWorkspaceSource).toContain('createCanvasPlaybackPlan({');
    expect(playbackWorkspaceSource).toContain('<StorylinePlaybackOverlay');
    expect(playbackWorkspaceSource).not.toContain('<StorylineGraph');
    expect(playbackWorkspaceSource).not.toContain('<PlaybackStage');
    expect(editorSource).toContain("case 'media:play'");
    expect(editorSource).toContain("case 'media:seek'");
  });

  it('routes quick generation through Agent-owned Job execution', () => {
    expect(editorSource).toContain("if (action === 'generate')");
    expect(editorSource).toContain("'neko.agent.sendContext'");
    expect(editorSource).toContain("'neko.ai.sendMessage'");
    expect(editorSource).toContain('requestedAction:');
    expect(editorSource).not.toContain('executeCanvasCreativeAi');
  });

  it('does not retain Storyboard, Narrative, Entity, or specialized generation handlers', () => {
    for (const legacyPath of [
      'createStoryboardFromPayload',
      'storyboardActionIntent',
      'canvasCreativeAiAction',
      'entity.confirmCandidate',
      'NarrativePreviewBridge',
      'getStoryboardExecutionSummary',
    ]) {
      expect(extensionSource + editorSource + providerSource).not.toContain(legacyPath);
    }
  });

  it('keeps source-add intents separate from persisted node types', () => {
    expect(dragDropSource).toContain('createProjectSourceAddClient({');
    expect(dragDropSource).toContain('createCanvasFilePickerAddSourceInput');
    expect(dragDropSource).toContain('applyCanvasAddSourceResult');
    for (const source of [webviewSource, addActionCatalogSource]) {
      expect(source).not.toContain("type: 'gallery'");
      expect(source).not.toContain("type: 'scene'");
      expect(source).not.toContain("type: 'shot'");
    }
  });
});
