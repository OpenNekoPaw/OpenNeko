import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const commandSource = readFileSync(join(__dirname, 'index.ts'), 'utf-8');
const messageHandlerSource = readFileSync(
  join(__dirname, '../editor/video/messageHandler.ts'),
  'utf-8',
);
const timelineCommandsSource = readFileSync(join(__dirname, 'timeline-commands.ts'), 'utf-8');
const timelineToolExecutorSource = readFileSync(
  join(__dirname, '../services/TimelineToolExecutor.ts'),
  'utf-8',
);
const removedGeneratedClipEditorExecutor = ['ensureTimelineEditor', 'ForGeneratedClip('].join('');
const removedGeneratedClipEditorTimeout = [
  'Timeline editor did not ',
  'become ready',
  ' before import.',
].join('');
const removedAddToTimelineCommand = ['neko.', 'addToTimeline'].join('');
const removedImportStoryboardCommand = ['neko.cut.', 'importStoryboard'].join('');
const removedImportCanvasDraftCommand = ['neko.cut.', 'importCanvasDraft'].join('');
const removedImportStoryboardMessage = ["type: '", "importStoryboard'"].join('');
const removedImportCanvasDraftMessage = ["type: '", "importCanvasDraft'"].join('');

describe('neko-cut command project-file I/O guardrails', () => {
  it('routes generated clip imports through Cut authoring instead of a Webview executor', () => {
    expect(commandSource).toContain('neko.cut.authoring.importGeneratedClip');
    expect(commandSource).toContain('cutProjectAuthoringService.importGeneratedClip(');
    expect(commandSource).not.toContain(removedGeneratedClipEditorExecutor);
    expect(commandSource).not.toContain(removedGeneratedClipEditorTimeout);
    expect(commandSource).not.toContain("target: { kind: 'active'");
    expect(commandSource).not.toContain('createAvailableTimelineFileUri');
  });

  it('routes manual add-to-timeline media adds through Cut authoring', () => {
    expect(commandSource).toContain('neko.cut.authoring.addSourceToTimeline');
    expect(commandSource).toContain('cutProjectAuthoringService.importMediaSource(');
    expect(commandSource).not.toContain(removedAddToTimelineCommand);
    expect(commandSource).not.toContain("type: 'project:sourceAdded'");
    expect(commandSource).not.toContain('workspace.asRelativePath');
    expect(commandSource).not.toContain("type: 'addMediaFile'");
    expect(commandSource).not.toContain("type: 'importGeneratedClip'");
  });

  it('routes storyboard and Canvas draft imports through Cut authoring commands', () => {
    expect(timelineCommandsSource).toContain('neko.cut.authoring.importStoryboard');
    expect(timelineCommandsSource).toContain('neko.cut.authoring.importCanvasDraft');
    expect(timelineCommandsSource).toContain('cutProjectAuthoringService.importStoryboard(');
    expect(timelineCommandsSource).toContain('cutProjectAuthoringService.importCanvasDraft(');
    expect(timelineCommandsSource).not.toContain(removedImportStoryboardCommand);
    expect(timelineCommandsSource).not.toContain(removedImportCanvasDraftCommand);
    expect(timelineCommandsSource).not.toContain(removedImportStoryboardMessage);
    expect(timelineCommandsSource).not.toContain(removedImportCanvasDraftMessage);
    expect(timelineCommandsSource).not.toContain("target: { kind: 'active'");
    expect(timelineCommandsSource).not.toContain('createAvailableTimelineFileUri');
  });

  it('does not keep the legacy addMediaToTimeline webview message path alive', () => {
    expect(messageHandlerSource).not.toContain("case 'addMediaToTimeline'");
    expect(messageHandlerSource).not.toContain("type: 'fileAdded'");
  });

  it('syncs active editor tool results through the VS Code TextDocument save lifecycle', () => {
    expect(timelineToolExecutorSource).not.toContain('saveCutProjectFile(');
    expect(timelineToolExecutorSource).toContain('model!.syncSavedProjectData(');
    expect(timelineToolExecutorSource).not.toContain('model!.updateProjectData(');
    expect(timelineToolExecutorSource).toContain('projectSession.updateProjectData(');
  });
});
