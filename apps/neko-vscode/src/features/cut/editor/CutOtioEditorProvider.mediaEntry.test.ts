import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('Cut OTIO media entry wiring', () => {
  it('routes picker and drop messages through one Host prepare/link method', async () => {
    const source = await readFile(
      fileURLToPath(new URL('./CutOtioEditorProvider.ts', import.meta.url)),
      'utf8',
    );
    const pickerBranch = branch(source, "value['type'] === 'cut:select-link-media'", 3_000);
    const dropBranch = branch(source, "value['type'] === 'cut:drop-link-media'", 2_000);
    const linkMethod = branch(source, 'private async linkMediaUri(', 4_000);

    expect(pickerBranch).toContain('this.linkMediaUri(');
    expect(pickerBranch).toContain("value['timelineStartFrames']");
    expect(pickerBranch).toContain("value['overlapPolicy']");
    expect(dropBranch).toContain("for (const uri of value['uris'])");
    expect(dropBranch).toContain('this.linkMediaUri(');
    expect(dropBranch).toContain("value['timelineStartFrames']");
    expect(dropBranch).toContain("value['overlapPolicy']");
    expect(dropBranch).toContain('expectedRevision: document.session.revision');
    expect(linkMethod).toContain('CutWorkspaceMediaImporter.create');
    expect(linkMethod).toContain('importer.prepare(document.uri.fsPath, mediaUri.fsPath)');
    expect(linkMethod).toContain('paths.linkMedia(');
    expect(linkMethod).toContain('this.probeCompatibleDuration(');
    expect(linkMethod).toContain('this.applyCommand(document, identity');
    expect(linkMethod).toContain('timelineStartFrames');
    expect(linkMethod).toContain('overlapPolicy');
    expect(linkMethod).not.toContain('children.length');
    expect(linkMethod).not.toContain('getWorkspaceFolder(mediaUri)');
  });
});

function branch(source: string, marker: string, length: number): string {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start, start + length);
}
