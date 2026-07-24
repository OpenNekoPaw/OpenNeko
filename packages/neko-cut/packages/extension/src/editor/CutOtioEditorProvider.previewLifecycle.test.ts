import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('Cut preview generation lifecycle wiring', () => {
  it('keeps the initial generation paused until the connected Webview activates it', async () => {
    const source = await readFile(
      fileURLToPath(new URL('./CutOtioEditorProvider.ts', import.meta.url)),
      'utf8',
    );
    const initialStart = branch(source, 'private async startPanelPreview(', 2_000);

    expect(initialStart).not.toContain('await this.resumePreviewRecord(document, record)');
    expect(initialStart).toContain('this.previewSessions.set(panel, { prepared: record })');
    expect(initialStart).toContain("type: 'cut:preview-ready'");
  });

  it('publishes the activated generation before retiring the previous stream', async () => {
    const source = await readFile(
      fileURLToPath(new URL('./CutOtioEditorProvider.ts', import.meta.url)),
      'utf8',
    );
    const prepareBranch = branch(source, "value['type'] === 'cut:preview-prepare'", 2_000);
    const builder = branch(source, 'private async buildPanelPreview(', 6_000);
    const activation = branch(source, 'private async activatePanelPreview(', 3_000);

    expect(prepareBranch).toContain('this.preparePanelPreview(');
    expect(builder.match(/startPaused: true/g)).toHaveLength(2);
    expect(activation).toContain('await this.resumePreviewRecord(document, prepared)');
    expect(activation).toContain('await this.stopPreviewRecord(document, current.active)');
    expect(activation).toContain("type: 'cut:preview-activated'");
    expect(activation.indexOf("type: 'cut:preview-activated'")).toBeLessThan(
      activation.indexOf('stopPreviewRecord(document, current.active)'),
    );
  });
});

function branch(source: string, marker: string, length: number): string {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start, start + length);
}
